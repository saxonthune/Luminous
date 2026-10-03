import { createContext, useContext } from 'solid-js';
import { createStore, type Store } from 'solid-js/store';
import {
  exportDenimDatabase,
  getDenimGraph,
  getJourneyGraph,
  listCapabilities,
  listJourneys,
  listTopLevelResources,
  type DenimDatabase,
  type DenimEdge,
  type DenimGraph,
  type DenimNode,
} from '@luminous/core/denim';
import { applyDenimAction, DENIM_PINNED_VIEWS, readDenimSnapshot, readDenimViews,
  type DenimAction, type DenimQuerySource, type DenimTabView } from '@luminous/core/denim/actions';

export type { DenimQuerySource, DenimTabView } from '@luminous/core/denim/actions';

export interface DenimSessionState {
  tabs: DenimTabView[];
  activeTabId: string;
  cameras: Record<string, { x: number; y: number; k: number }>;
  selectedId: string | null;
  graph: DenimGraph;
  saving: boolean;
  dirty: boolean;
  conflict: boolean;
  error: string | null;
}

export interface DenimSession {
  readonly state: Store<DenimSessionState>;
  dispatchAction(action: DenimAction): Promise<{ ok: boolean; error?: string; nodeId?: string; tabId?: string }>;
  selectView(view: 'journeys' | 'capabilities' | 'resources'): void;
  activateTab(id: string): void;
  setCamera(id: string, camera: { x: number; y: number; k: number }): void;
  openJourney(id: string): Promise<void>;
  closeTab(id: string): Promise<void>;
  selectNode(id: string | null): void;
  createJourney(text?: string): Promise<void>;
  differentiate(parentId: string, text?: string, placement?: { tabId: string; x: number; y: number }): Promise<string | undefined>;
  connectExisting(parentId: string, childId: string): Promise<void>;
  canConnectExisting(parentId: string, childId: string): boolean;
  initializeSequence(parentId: string, orderedChildIds: string[]): Promise<void>;
  clearSequence(parentId: string): Promise<void>;
  setSequenceMode(parentId: string, mode: 'rank' | 'priority', tabId?: string): Promise<void>;
  includeNode(nodeId: string, tabId?: string): Promise<void>;
  moveNode(nodeId: string, position: { x: number; y: number }, tabId?: string): Promise<void>;
  moveNodes(positions: Record<string, { x: number; y: number }>, tabId?: string): Promise<void>;
  updateNode(id: string, patch: Partial<Pick<DenimNode, 'type' | 'text'>>): Promise<void>;
  /** Delete this node and every descendant connected through parent-child edges. */
  deleteNode(id: string): Promise<void>;
  /** Delete only this node and preserve its descendants as view nodes. */
  deleteNodeOnly(id: string): Promise<void>;
  setEdgePriority(edgeId: string, priority: number): Promise<void>;
  findNodesToConnect(query: string): DenimNode[];
  retrySave(): Promise<void>;
  dispose(): Promise<void>;
  discard(): Promise<void>;
}

export type DenimFileSaver = (bytes: Uint8Array, revision: string) => Promise<string>;

export class DenimPersistenceConflict extends Error {
  constructor(message = 'Database revision changed') {
    super(message);
    this.name = 'DenimPersistenceConflict';
  }
}

const PINNED_TABS = DENIM_PINNED_VIEWS;

const ACTIVE_TAB_KEY = 'denim-active-tab:';

function sourceGraph(database: DenimDatabase, source: DenimQuerySource): DenimGraph {
  if (source.kind === 'journey') return getJourneyGraph(database, source.journeyId);
  if (source.kind === 'capabilities') return { nodes: listCapabilities(database), edges: [] };
  if (source.kind === 'resources') return { nodes: listTopLevelResources(database), edges: [] };
  return { nodes: listJourneys(database), edges: [] };
}

function projectTab(database: DenimDatabase, tab: DenimTabView): DenimGraph {
  const nodes = new Map<string, DenimNode>();
  const edges = new Map<string, DenimEdge>();
  for (const source of tab.sources) {
    const graph = sourceGraph(database, source);
    graph.nodes.forEach((node) => nodes.set(node.id, node));
    graph.edges.forEach((edge) => edges.set(edge.id, edge));
  }
  if (tab.includedNodeIds.length > 0) {
    const graph = getDenimGraph(database);
    const included = new Set(tab.includedNodeIds);
    graph.nodes.filter((node) => included.has(node.id)).forEach((node) => nodes.set(node.id, node));
    graph.edges.filter((edge) => nodes.has(edge.sourceId) && nodes.has(edge.targetId))
      .forEach((edge) => edges.set(edge.id, edge));
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function sessionStorageRead(sourceKey: string): { activeTabId?: string; cameras: DenimSessionState['cameras'] } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(`${ACTIVE_TAB_KEY}${sourceKey}`) ?? 'null');
    if (!saved || typeof saved !== 'object') return { cameras: {} };
    const cameras: DenimSessionState['cameras'] = {};
    if (saved.cameras && typeof saved.cameras === 'object') {
      for (const [id, camera] of Object.entries(saved.cameras)) {
        const point = camera as { x?: unknown; y?: unknown; k?: unknown };
        if ([point.x, point.y, point.k].every(Number.isFinite) && Number(point.k) > 0) {
          cameras[id] = { x: Number(point.x), y: Number(point.y), k: Number(point.k) };
        }
      }
    }
    return { activeTabId: typeof saved.activeTabId === 'string' ? saved.activeTabId : undefined, cameras };
  } catch { return { cameras: {} }; }
}

function sessionStorageWrite(sourceKey: string, state: DenimSessionState): void {
  try {
    sessionStorage.setItem(`${ACTIVE_TAB_KEY}${sourceKey}`, JSON.stringify({
      activeTabId: state.activeTabId,
      cameras: state.cameras,
    }));
  }
  catch { /* Tab navigation remains usable when session storage is unavailable. */ }
}

export function createDenimSession(
  database: DenimDatabase,
  saveFile: DenimFileSaver,
  initialRevision: string,
  sourceKey = 'default',
): DenimSession {
  const tabs = readDenimViews(database);
  const transient = sessionStorageRead(sourceKey);
  const initialTabId = tabs.some((tab) => tab.id === transient.activeTabId) ? transient.activeTabId! : PINNED_TABS[0].id;
  const [state, setState] = createStore<DenimSessionState>({
    tabs,
    activeTabId: initialTabId,
    cameras: transient.cameras,
    selectedId: null,
    graph: { nodes: [], edges: [] },
    saving: false,
    dirty: false,
    conflict: false,
    error: null,
  });

  let saveTail: Promise<void> = Promise.resolve();
  let latestSave = 0;
  let revision = initialRevision;
  let disposed = false;
  let transientSaveTimer: ReturnType<typeof setTimeout> | undefined;

  function saveTransient(): void {
    clearTimeout(transientSaveTimer);
    transientSaveTimer = undefined;
    sessionStorageWrite(sourceKey, state);
  }

  function scheduleTransientSave(): void {
    clearTimeout(transientSaveTimer);
    transientSaveTimer = setTimeout(saveTransient, 120);
  }

  function activeTab(): DenimTabView {
    return state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0];
  }

  function refreshGraph(): void {
    const tab = activeTab();
    setState('graph', projectTab(database, tab));
  }

  async function persist(): Promise<void> {
    const saveId = ++latestSave;
    setState({ dirty: true, saving: true, error: null, conflict: false });
    const current = saveTail.catch(() => undefined).then(async () => {
      revision = await saveFile(exportDenimDatabase(database), revision);
    });
    saveTail = current;
    try {
      await current;
      if (saveId === latestSave) setState({ dirty: false, saving: false, conflict: false, error: null });
    } catch (cause) {
      if (saveId === latestSave) setState({
        saving: false,
        dirty: true,
        conflict: cause instanceof DenimPersistenceConflict,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  async function dispatchAction(action: DenimAction): Promise<{ ok: boolean; error?: string; nodeId?: string; tabId?: string }> {
    if (disposed) return { ok: false, error: 'Denim session is closed' };
    try {
      const result = applyDenimAction(database, action);
      const snapshot = readDenimSnapshot(database);
      setState('tabs', snapshot.views);
      setState('cameras', (cameras) => Object.fromEntries(Object.entries(cameras)
        .filter(([tabId]) => snapshot.views.some((tab) => tab.id === tabId))));
      if (action.op === 'view.openJourney' && result.tabId) {
        setState({ activeTabId: result.tabId, selectedId: action.journeyId });
        saveTransient();
      } else if (action.op === 'view.close' && state.activeTabId === action.tabId) {
        setState({ activeTabId: PINNED_TABS[0].id, selectedId: null });
        saveTransient();
      } else if (action.op === 'node.delete') {
        if (!state.tabs.some((tab) => tab.id === state.activeTabId)) {
          setState('activeTabId', PINNED_TABS[0].id);
          saveTransient();
        }
        setState('selectedId', null);
      } else if (result.nodeId) setState('selectedId', result.nodeId);
      refreshGraph();
      if (result.changed) await persist();
      if (state.dirty && state.error) return { ok: false, error: state.error };
      return { ...result, ok: true };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      setState('error', error);
      return { ok: false, error };
    }
  }

  refreshGraph();

  return {
    state,
    dispatchAction,
    selectView(view) {
      const id = `pinned:${view}`;
      if (!state.tabs.some((tab) => tab.id === id)) return;
      setState({ activeTabId: id, selectedId: null, error: null });
      saveTransient();
      refreshGraph();
    },
    setCamera(id, camera) {
      if (![camera.x, camera.y, camera.k].every(Number.isFinite) || camera.k <= 0) return;
      setState('cameras', id, { x: camera.x, y: camera.y, k: camera.k });
      scheduleTransientSave();
    },
    activateTab(id) {
      if (!state.tabs.some((tab) => tab.id === id)) return;
      setState({ activeTabId: id, selectedId: null, error: null });
      saveTransient();
      refreshGraph();
    },
    async openJourney(id) { await dispatchAction({ op: 'view.openJourney', journeyId: id }); },
    async closeTab(id) { await dispatchAction({ op: 'view.close', tabId: id }); },
    selectNode(id) {
      setState('selectedId', id);
    },
    async createJourney(text = 'New journey') { await dispatchAction({ op: 'journey.create', text }); },
    async differentiate(parentId, text = 'New action', placement) {
      return (await dispatchAction({ op: 'node.differentiate', parentId, text, placement })).nodeId;
    },
    async connectExisting(parentId, childId) { await dispatchAction({ op: 'edge.connect', parentId, childId }); },
    canConnectExisting(parentId, childId) {
      if (parentId === childId) return false;
      const graph = getDenimGraph(database);
      const nodeIds = new Set(graph.nodes.map((node) => node.id));
      if (!nodeIds.has(parentId) || !nodeIds.has(childId)) return false;
      const childIdsByParent = new Map<string, string[]>();
      for (const edge of graph.edges) {
        if (edge.type !== 'parent-child') continue;
        const children = childIdsByParent.get(edge.sourceId) ?? [];
        children.push(edge.targetId);
        childIdsByParent.set(edge.sourceId, children);
      }
      if ((childIdsByParent.get(parentId) ?? []).includes(childId)) return false;
      const pending = [childId];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const currentId = pending.pop()!;
        if (currentId === parentId) return false;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        pending.push(...(childIdsByParent.get(currentId) ?? []));
      }
      return true;
    },
    async initializeSequence(parentId, orderedChildIds) { await dispatchAction({ op: 'sequence.initialize', parentId, orderedChildIds }); },
    async clearSequence(parentId) { await dispatchAction({ op: 'sequence.clear', parentId }); },
    async setSequenceMode(parentId, mode, tabId = state.activeTabId) { await dispatchAction({ op: 'view.sequenceMode.set', tabId, parentId, mode }); },
    async includeNode(nodeId, tabId = state.activeTabId) { await dispatchAction({ op: 'view.includeNode', tabId, nodeId }); },
    async moveNode(nodeId, position, tabId = state.activeTabId) { await dispatchAction({ op: 'view.node.move', tabId, nodeId, position }); },
    async moveNodes(positions, tabId = state.activeTabId) { await dispatchAction({ op: 'view.nodes.move', tabId, positions }); },
    async updateNode(id, patch) { await dispatchAction({ op: 'node.update', id, patch }); },
    async deleteNode(id) { await dispatchAction({ op: 'node.delete', id, scope: 'subtree' }); },
    async deleteNodeOnly(id) { await dispatchAction({ op: 'node.delete', id, scope: 'node' }); },
    async setEdgePriority(edgeId, priority) { await dispatchAction({ op: 'edge.priority.set', edgeId, priority }); },
    findNodesToConnect(query) {
      const shownIds = new Set(state.graph.nodes.map((node) => node.id));
      const normalized = query.trim().toLowerCase();
      return getDenimGraph(database).nodes.filter((node) =>
        !shownIds.has(node.id) && `${node.type} ${node.text}`.toLowerCase().includes(normalized));
    },
    async retrySave() {
      if (disposed) throw new Error('Denim session is closed');
      if (state.conflict) return;
      await persist();
    },
    async dispose() {
      await saveTail.catch(() => undefined);
      if (state.dirty) throw new Error('This database has unsaved changes. Retry saving before closing it.');
      if (!disposed) {
        saveTransient();
        disposed = true;
        database.close();
      }
    },
    async discard() {
      await saveTail.catch(() => undefined);
      if (!disposed) {
        saveTransient();
        disposed = true;
        database.close();
      }
    },
  };
}

export const DenimSessionContext = createContext<DenimSession>();

export function useDenimSession(): DenimSession {
  const session = useContext(DenimSessionContext);
  if (!session) throw new Error('DenimSessionContext is missing');
  return session;
}
