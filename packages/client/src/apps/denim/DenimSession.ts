import { createContext, useContext } from 'solid-js';
import { createStore, type Store } from 'solid-js/store';
import {
  connectDenimChild,
  createDenimChild,
  addDenimNode,
  exportDenimDatabase,
  getDenimGraph,
  getJourneyGraph,
  listCapabilities,
  listDenimWorkspaces,
  listJourneys,
  listTopLevelResources,
  putDenimWorkspace,
  removeDenimWorkspace,
  updateDenimNode,
  type DenimDatabase,
  type DenimEdge,
  type DenimGraph,
  type DenimNode,
} from '@luminous/core/denim';

export type DenimQuerySource =
  | { kind: 'journeys' }
  | { kind: 'capabilities' }
  | { kind: 'resources' }
  | { kind: 'journey'; journeyId: string };

export interface DenimTabView {
  version: 1;
  id: string;
  kind: 'pinned' | 'workspace';
  title: string;
  sources: DenimQuerySource[];
  includedNodeIds: string[];
  positions: Record<string, { x: number; y: number }>;
}

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
  selectView(view: 'journeys' | 'capabilities' | 'resources'): void;
  activateTab(id: string): void;
  setCamera(id: string, camera: { x: number; y: number; k: number }): void;
  openJourney(id: string): Promise<void>;
  closeTab(id: string): Promise<void>;
  selectNode(id: string | null): void;
  createJourney(text?: string): Promise<void>;
  differentiate(parentId: string, type?: string, text?: string): Promise<string | undefined>;
  connectExisting(parentId: string, childId: string): Promise<void>;
  includeNode(nodeId: string, tabId?: string): Promise<void>;
  moveNode(nodeId: string, position: { x: number; y: number }, tabId?: string): Promise<void>;
  updateNode(id: string, patch: Partial<Pick<DenimNode, 'type' | 'text'>>): Promise<void>;
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

const PINNED_TABS: DenimTabView[] = [
  { version: 1, id: 'pinned:journeys', kind: 'pinned', title: 'Journeys', sources: [{ kind: 'journeys' }], includedNodeIds: [], positions: {} },
  { version: 1, id: 'pinned:capabilities', kind: 'pinned', title: 'Capabilities', sources: [{ kind: 'capabilities' }], includedNodeIds: [], positions: {} },
  { version: 1, id: 'pinned:resources', kind: 'pinned', title: 'Resources', sources: [{ kind: 'resources' }], includedNodeIds: [], positions: {} },
];

const ACTIVE_TAB_KEY = 'denim-active-tab:';

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isQuerySource(value: unknown): value is DenimQuerySource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return source.kind === 'journeys' || source.kind === 'capabilities' || source.kind === 'resources'
    || (source.kind === 'journey' && typeof source.journeyId === 'string');
}

function decodeWorkspace(value: unknown): DenimTabView | undefined {
  if (!value || typeof value !== 'object') return;
  const tab = value as Partial<DenimTabView>;
  if (tab.version !== 1 || typeof tab.id !== 'string' || !Array.isArray(tab.sources) || !tab.sources.every(isQuerySource)
    || !Array.isArray(tab.includedNodeIds) || !tab.includedNodeIds.every((id) => typeof id === 'string')
    || !tab.positions || typeof tab.positions !== 'object') return;
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [id, point] of Object.entries(tab.positions)) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    positions[id] = { x: point.x, y: point.y };
  }
  if (tab.kind === 'pinned') {
    const pinned = PINNED_TABS.find((item) => item.id === tab.id);
    if (!pinned) return;
    return { ...pinned, includedNodeIds: [...new Set(tab.includedNodeIds)], positions };
  }
  if (tab.kind !== 'workspace' || typeof tab.title !== 'string' || PINNED_TABS.some((item) => item.id === tab.id)) return;
  return {
    version: 1,
    id: tab.id,
    kind: 'workspace',
    title: tab.title,
    sources: tab.sources,
    includedNodeIds: [...new Set(tab.includedNodeIds)],
    positions,
  };
}

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
  const persisted = listDenimWorkspaces(database)
    .map(({ payload }) => decodeWorkspace(payload))
    .filter((tab): tab is DenimTabView => Boolean(tab));
  const overrides = new Map(persisted.filter((tab) => tab.kind === 'pinned').map((tab) => [tab.id, tab]));
  const workspaces = persisted.filter((tab) => tab.kind === 'workspace');
  const tabs = [
    ...PINNED_TABS.map((tab) => overrides.get(tab.id) ?? tab),
    ...workspaces,
  ];
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

  async function change(run: () => void, selectedId?: string | null): Promise<void> {
    if (disposed) throw new Error('Denim session is closed');
    try {
      run();
      if (selectedId !== undefined) setState('selectedId', selectedId);
      refreshGraph();
      await persist();
    } catch (cause) {
      setState('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  function persistTab(tab: DenimTabView): void {
    putDenimWorkspace(database, { id: tab.id, payload: tab });
  }

  async function updateTab(tabId: string, update: (tab: DenimTabView) => DenimTabView): Promise<void> {
    if (disposed) throw new Error('Denim session is closed');
    try {
      const current = state.tabs.find((tab) => tab.id === tabId);
      if (!current) return;
      const next = update(current);
      persistTab(next);
      setState('tabs', (items) => items.map((tab) => tab.id === tabId ? next : tab));
      refreshGraph();
      await persist();
    } catch (cause) {
      setState('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  refreshGraph();

  return {
    state,
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
    async openJourney(id) {
      if (disposed) throw new Error('Denim session is closed');
      const node = getDenimGraph(database).nodes.find((item) => item.id === id);
      if (!node || node.type !== 'Journey') return;
      const tab: DenimTabView = {
        version: 1, id: newId('journey-tab'), kind: 'workspace', title: node.text,
        sources: [{ kind: 'journey', journeyId: id }], includedNodeIds: [], positions: {},
      };
      persistTab(tab);
      setState('tabs', (items) => [...items, tab]);
      setState({ activeTabId: tab.id, selectedId: id });
      saveTransient();
      refreshGraph();
      await persist();
    },
    async closeTab(id) {
      const tab = state.tabs.find((item) => item.id === id);
      if (!tab || tab.kind === 'pinned') return;
      removeDenimWorkspace(database, id);
      const nextTabs = state.tabs.filter((item) => item.id !== id);
      const nextActive = state.activeTabId === id ? PINNED_TABS[0].id : state.activeTabId;
      setState({ tabs: nextTabs, activeTabId: nextActive, selectedId: null });
      setState('cameras', (cameras) => {
        const next = { ...cameras };
        delete next[id];
        return next;
      });
      saveTransient();
      refreshGraph();
      await persist();
    },
    selectNode(id) {
      setState('selectedId', id);
    },
    createJourney(text = 'New journey') {
      const node = { id: newId('journey'), type: 'Journey', text };
      return change(() => addDenimNode(database, node), node.id);
    },
    async differentiate(parentId, type = 'Action', text = 'New action') {
      const node = { id: newId('node'), type, text };
      await change(() => createDenimChild(database, parentId, node, newId('parent-child')), node.id);
      return getDenimGraph(database).nodes.some((item) => item.id === node.id) ? node.id : undefined;
    },
    connectExisting(parentId, childId) {
      return change(() => connectDenimChild(database, parentId, childId, newId('parent-child')), childId);
    },
    includeNode(nodeId, tabId = state.activeTabId) {
      return updateTab(tabId, (tab) => ({
        ...tab,
        includedNodeIds: tab.includedNodeIds.includes(nodeId) ? tab.includedNodeIds : [...tab.includedNodeIds, nodeId],
      }));
    },
    moveNode(nodeId, position, tabId = state.activeTabId) {
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return Promise.resolve();
      return updateTab(tabId, (tab) => {
        return { ...tab, positions: { ...tab.positions, [nodeId]: { x: position.x, y: position.y } } };
      });
    },
    updateNode(id, patch) {
      const tab = activeTab();
      const node = getDenimGraph(database).nodes.find((item) => item.id === id);
      return change(() => updateDenimNode(database, id, patch), undefined).then(async () => {
        if (node?.type === 'Journey' && patch.text !== undefined) {
          const affected = state.tabs.filter((item) => item.kind === 'workspace'
            && item.sources.some((source) => source.kind === 'journey' && source.journeyId === id));
          for (const item of affected) await updateTab(item.id, (current) => ({ ...current, title: patch.text! }));
        }
        if (tab.id === state.activeTabId) refreshGraph();
      });
    },
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
