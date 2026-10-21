import { createContext, useContext } from 'solid-js';
import { createStore, type Store } from 'solid-js/store';
import {
  exportDenimDatabase,
  getDenimGraph,
  listDenimNodeTypes,
  type DenimDatabase,
  type DenimGraph,
  type DenimNode,
  type DenimNodeType,
} from '@luminous/core/denim';
import { applyDenimAction, DENIM_PINNED_BOARDS, getDenimBoardGraph, readDenimSnapshot, readDenimBoards,
  type DenimAction, type DenimBoard } from '@luminous/core/denim/actions';
import { queryDenim, type DenimQuery, type DenimNodeVisibilityEntry } from '@luminous/core/denim/queries';

export type { DenimQuerySource, DenimBoard, DenimBoardContainer } from '@luminous/core/denim/actions';

export interface DenimSessionState {
  boards: DenimBoard[];
  nodeTypes: DenimNodeType[];
  activeBoardId: string;
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
  dispatchAction(action: DenimAction): Promise<DenimDispatchResult>;
  readBoard(boardId: string): Promise<DenimDispatchResult>;
  databaseGraph(): DenimGraph;
  queryNodes(query: DenimQuery): Promise<DenimNodeVisibilityEntry[]>;
  selectBoard(board: 'journeys' | 'capabilities' | 'instances'): void;
  activateBoard(id: string): void;
  setCamera(id: string, camera: { x: number; y: number; k: number }): void;
  openJourney(id: string): Promise<void>;
  closeBoard(id: string): Promise<void>;
  selectNode(id: string | null): void;
  createJourney(text?: string): Promise<void>;
  differentiate(parentId: string, text?: string, placement?: { boardId: string; x: number; y: number }): Promise<string | undefined>;
  connectExisting(parentId: string, childId: string): Promise<void>;
  canConnectExisting(parentId: string, childId: string): boolean;
  initializeSequence(parentId: string, orderedChildIds: string[]): Promise<void>;
  clearSequence(parentId: string): Promise<void>;
  setSequenceMode(parentId: string, mode: 'rank' | 'priority', boardId?: string): Promise<void>;
  setNodeLoaded(nodeId: string, loaded: boolean, boardId?: string): Promise<void>;
  moveNode(nodeId: string, position: { x: number; y: number }, boardId?: string): Promise<void>;
  moveNodes(positions: Record<string, { x: number; y: number }>, boardId?: string): Promise<void>;
  updateNode(id: string, patch: Partial<Pick<DenimNode, 'type' | 'text'>>): Promise<void>;
  /** Delete this node and every descendant connected through parent-child edges. */
  deleteNode(id: string): Promise<void>;
  /** Delete only this node and preserve its descendants on boards where it appeared. */
  deleteNodeOnly(id: string): Promise<void>;
  setEdgePriority(edgeId: string, priority: number): Promise<void>;
  findNodesToConnect(query: string): DenimNode[];
  retrySave(): Promise<void>;
  dispose(): Promise<void>;
  discard(): Promise<void>;
}

export interface DenimDispatchResult {
  ok: boolean;
  error?: string;
  nodeId?: string;
  edgeId?: string;
  boardId?: string;
  board?: DenimBoard;
  graph?: DenimGraph;
  changed?: boolean;
  sequenceContainerId?: string;
}

export type DenimFileSaver = (bytes: Uint8Array, revision: string) => Promise<string>;

export class DenimPersistenceConflict extends Error {
  constructor(message = 'Database revision changed') {
    super(message);
    this.name = 'DenimPersistenceConflict';
  }
}

const PINNED_BOARDS = DENIM_PINNED_BOARDS;

const ACTIVE_BOARD_KEY = 'denim-active-board:';
const LEGACY_ACTIVE_TAB_KEY = 'denim-active-tab:';

function projectBoard(database: DenimDatabase, board: DenimBoard): DenimGraph {
  return getDenimBoardGraph(database, board);
}

function sessionStorageRead(sourceKey: string): { activeBoardId?: string; cameras: DenimSessionState['cameras'] } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(`${ACTIVE_BOARD_KEY}${sourceKey}`)
      ?? sessionStorage.getItem(`${LEGACY_ACTIVE_TAB_KEY}${sourceKey}`) ?? 'null');
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
    const activeBoardId = typeof saved.activeBoardId === 'string' ? saved.activeBoardId
      : typeof saved.activeTabId === 'string' ? saved.activeTabId : undefined;
    return { activeBoardId, cameras };
  } catch { return { cameras: {} }; }
}

function sessionStorageWrite(sourceKey: string, state: DenimSessionState): void {
  try {
    sessionStorage.setItem(`${ACTIVE_BOARD_KEY}${sourceKey}`, JSON.stringify({
      activeBoardId: state.activeBoardId,
      cameras: state.cameras,
    }));
  }
  catch { /* Board navigation remains usable when session storage is unavailable. */ }
}

export function createDenimSession(
  database: DenimDatabase,
  saveFile: DenimFileSaver,
  initialRevision: string,
  sourceKey = 'default',
): DenimSession {
  const boards = readDenimBoards(database);
  const transient = sessionStorageRead(sourceKey);
  const initialBoardId = boards.some((board) => board.id === transient.activeBoardId && board.kind !== 'pinned') ? transient.activeBoardId! : (boards.find((board) => board.kind !== 'pinned')?.id ?? PINNED_BOARDS[0].id);
  const [state, setState] = createStore<DenimSessionState>({
    boards,
    nodeTypes: listDenimNodeTypes(database),
    activeBoardId: initialBoardId,
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

  function activeBoard(): DenimBoard {
    return state.boards.find((board) => board.id === state.activeBoardId) ?? state.boards[0];
  }

  function refreshGraph(): void {
    const board = activeBoard();
    setState('graph', projectBoard(database, board));
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

  async function dispatchAction(action: DenimAction): Promise<DenimDispatchResult> {
    if (disposed) return { ok: false, error: 'Denim session is closed' };
    try {
      const result = applyDenimAction(database, action);
      const snapshot = readDenimSnapshot(database);
      setState({ boards: snapshot.boards, nodeTypes: listDenimNodeTypes(database) });
      setState('cameras', (cameras) => Object.fromEntries(Object.entries(cameras)
        .filter(([boardId]) => snapshot.boards.some((board) => board.id === boardId))));
      if ((action.op === 'board.openJourney' || action.op === 'board.create') && result.boardId) {
        setState({ activeBoardId: result.boardId, selectedId: action.op === 'board.openJourney' ? action.journeyId : null });
        saveTransient();
      } else if (action.op === 'board.close' && state.activeBoardId === action.boardId) {
        setState({ activeBoardId: snapshot.boards.find((board) => board.kind !== 'pinned')?.id ?? PINNED_BOARDS[0].id, selectedId: null });
        saveTransient();
      } else if (action.op === 'node.delete') {
        if (!state.boards.some((board) => board.id === state.activeBoardId)) {
          setState('activeBoardId', PINNED_BOARDS[0].id);
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
    async readBoard(boardId) { return dispatchAction({ op: 'board.read', boardId }); },
    databaseGraph() { return getDenimGraph(database); },
    async queryNodes(query) { return queryDenim(database, query); },
    selectBoard(board) {
      const id = `pinned:${board}`;
      if (!state.boards.some((board) => board.id === id)) return;
      setState({ activeBoardId: id, selectedId: null, error: null });
      saveTransient();
      refreshGraph();
    },
    setCamera(id, camera) {
      if (![camera.x, camera.y, camera.k].every(Number.isFinite) || camera.k <= 0) return;
      setState('cameras', id, { x: camera.x, y: camera.y, k: camera.k });
      scheduleTransientSave();
    },
    activateBoard(id) {
      if (!state.boards.some((board) => board.id === id)) return;
      setState({ activeBoardId: id, selectedId: null, error: null });
      saveTransient();
      refreshGraph();
    },
    async openJourney(id) { await dispatchAction({ op: 'board.openJourney', journeyId: id }); },
    async closeBoard(id) { await dispatchAction({ op: 'board.close', boardId: id }); },
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
    async setSequenceMode(parentId, mode, boardId = state.activeBoardId) { await dispatchAction({ op: 'board.sequenceMode.set', boardId, parentId, mode }); },
    async setNodeLoaded(nodeId, loaded, boardId = state.activeBoardId) { await dispatchAction({ op: 'board.node.load.set', boardId, nodeId, loaded }); },
    async moveNode(nodeId, position, boardId = state.activeBoardId) { await dispatchAction({ op: 'board.node.move', boardId, nodeId, position }); },
    async moveNodes(positions, boardId = state.activeBoardId) { await dispatchAction({ op: 'board.nodes.move', boardId, positions }); },
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
