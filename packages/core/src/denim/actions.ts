import {
  addDenimNode,
  clearDenimSequence,
  connectDenimChild,
  createDenimChild,
  deleteDenimNode,
  deleteDenimNodeAndChildren,
  deleteDenimEdge,
  getDenimGraph,
  getJourneyGraph,
  initializeDenimSequence,
  listCapabilities,
  listDenimBoards,
  listJourneys,
  listTopLevelInstances,
  putDenimBoard,
  removeDenimBoard,
  updateDenimEdgePriority,
  updateDenimNode,
  type DenimDatabase,
  type DenimNode,
} from './database.ts';

export type DenimQuerySource =
  | { kind: 'journeys' }
  | { kind: 'capabilities' }
  | { kind: 'instances' }
  | { kind: 'journey'; journeyId: string };

export interface DenimBoard {
  version: 1;
  id: string;
  kind: 'pinned' | 'board';
  title: string;
  sources: DenimQuerySource[];
  includedNodeIds: string[];
  positions: Record<string, { x: number; y: number }>;
  sequenceModes: Record<string, 'rank' | 'priority'>;
}

export const DENIM_PINNED_BOARDS: DenimBoard[] = [
  { version: 1, id: 'pinned:journeys', kind: 'pinned', title: 'Journeys', sources: [{ kind: 'journeys' }], includedNodeIds: [], positions: {}, sequenceModes: {} },
  { version: 1, id: 'pinned:capabilities', kind: 'pinned', title: 'Capabilities', sources: [{ kind: 'capabilities' }], includedNodeIds: [], positions: {}, sequenceModes: {} },
  { version: 1, id: 'pinned:instances', kind: 'pinned', title: 'Instances', sources: [{ kind: 'instances' }], includedNodeIds: [], positions: {}, sequenceModes: {} },
];

export type DenimAction =
  | { op: 'journey.create'; id?: string; text?: string }
  | { op: 'node.differentiate'; parentId: string; id?: string; edgeId?: string; text?: string; placement?: { boardId: string; x: number; y: number } }
  | { op: 'edge.connect'; parentId: string; childId: string; edgeId?: string }
  | { op: 'edge.delete'; edgeId: string }
  | { op: 'node.update'; id: string; patch: Partial<Pick<DenimNode, 'type' | 'text'>> }
  | { op: 'node.delete'; id: string; scope: 'node' | 'subtree' }
  | { op: 'edge.priority.set'; edgeId: string; priority: number }
  | { op: 'sequence.initialize'; parentId: string; orderedChildIds: string[] }
  | { op: 'sequence.clear'; parentId: string }
  | { op: 'board.read'; boardId: string }
  | { op: 'board.sequenceMode.set'; boardId: string; parentId: string; mode: 'rank' | 'priority' }
  | { op: 'board.includeNode'; boardId: string; nodeId: string }
  | { op: 'board.node.move'; boardId: string; nodeId: string; position: { x: number; y: number } }
  | { op: 'board.nodes.move'; boardId: string; positions: Record<string, { x: number; y: number }> }
  | { op: 'board.openJourney'; journeyId: string; boardId?: string }
  | { op: 'board.close'; boardId: string };

export const DENIM_ACTION_CATALOG = [
  { op: 'journey.create', required: [], optional: ['id', 'text'], purpose: 'Create a Journey Node.' },
  { op: 'node.differentiate', required: ['parentId'], optional: ['id', 'edgeId', 'text', 'placement'], purpose: 'Create a child Node with the same type as its parent and connect it to its parent; optionally place it on a Board.' },
  { op: 'edge.connect', required: ['parentId', 'childId'], optional: ['edgeId'], purpose: 'Connect an existing Node as a child.' },
  { op: 'edge.delete', required: ['edgeId'], optional: [], purpose: 'Delete one edge while keeping its endpoint Nodes.' },
  { op: 'node.update', required: ['id', 'patch'], optional: [], purpose: 'Change a Node type or text.' },
  { op: 'node.delete', required: ['id', 'scope'], optional: [], purpose: 'Delete one Node or its full descendant subtree; scope is node or subtree.' },
  { op: 'edge.priority.set', required: ['edgeId', 'priority'], optional: [], purpose: 'Set an edge sequence priority.' },
  { op: 'sequence.initialize', required: ['parentId', 'orderedChildIds'], optional: [], purpose: 'Assign priorities in the supplied child order.' },
  { op: 'sequence.clear', required: ['parentId'], optional: [], purpose: 'Clear priorities on all child edges.' },
  { op: 'board.read', required: ['boardId'], optional: [], purpose: 'Read a Board and its query projection.' },
  { op: 'board.sequenceMode.set', required: ['boardId', 'parentId', 'mode'], optional: [], purpose: 'Set a parent label mode on a Board to rank or priority.' },
  { op: 'board.includeNode', required: ['boardId', 'nodeId'], optional: [], purpose: 'Include a Node on a Board.' },
  { op: 'board.node.move', required: ['boardId', 'nodeId', 'position'], optional: [], purpose: 'Save a Node position on a Board.' },
  { op: 'board.nodes.move', required: ['boardId', 'positions'], optional: [], purpose: 'Save multiple Node positions on a Board as one action.' },
  { op: 'board.openJourney', required: ['journeyId'], optional: ['boardId'], purpose: 'Create a persistent Board sourced from a Journey.' },
  { op: 'board.close', required: ['boardId'], optional: [], purpose: 'Close and remove a Board; pinned Boards cannot be closed.' },
] as const;

export interface DenimActionResult {
  ok: true;
  changed: boolean;
  nodeId?: string;
  boardId?: string;
  board?: DenimBoard;
  graph?: ReturnType<typeof graphForBoard>;
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function readDenimBoards(db: DenimDatabase): DenimBoard[] {
  const persisted = listDenimBoards(db).map(({ payload }) => decodeBoard(payload)).filter((v): v is DenimBoard => Boolean(v));
  const overrides = new Map(persisted.filter((v) => v.kind === 'pinned').map((v) => [v.id, v]));
  return [
    ...DENIM_PINNED_BOARDS.map((board) => overrides.get(board.id) ?? board),
    ...persisted.filter((v) => v.kind === 'board'),
  ];
}

function isQuerySource(value: unknown): value is DenimQuerySource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return source.kind === 'journeys' || source.kind === 'capabilities' || source.kind === 'instances'
    || (source.kind === 'journey' && typeof source.journeyId === 'string');
}

function decodeBoard(value: unknown): DenimBoard | undefined {
  if (!value || typeof value !== 'object') return;
  const board = value as Partial<DenimBoard>;
  if (board.version !== 1 || typeof board.id !== 'string' || !Array.isArray(board.sources) || !board.sources.every(isQuerySource)
    || !Array.isArray(board.includedNodeIds) || !board.includedNodeIds.every((id) => typeof id === 'string')
    || !board.positions || typeof board.positions !== 'object') return;
  const positions: DenimBoard['positions'] = {};
  for (const [id, point] of Object.entries(board.positions)) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    positions[id] = { x: point.x, y: point.y };
  }
  const sequenceModes: DenimBoard['sequenceModes'] = {};
  if (board.sequenceModes && typeof board.sequenceModes === 'object') {
    for (const [id, mode] of Object.entries(board.sequenceModes)) if (mode === 'rank' || mode === 'priority') sequenceModes[id] = mode;
  }
  if (board.kind === 'pinned') {
    const pinned = DENIM_PINNED_BOARDS.find((candidate) => candidate.id === board.id);
    if (!pinned) return;
    return { ...pinned, includedNodeIds: [...new Set(board.includedNodeIds)], positions, sequenceModes };
  }
  if (board.kind !== 'board' || typeof board.title !== 'string' || DENIM_PINNED_BOARDS.some((candidate) => candidate.id === board.id)) return;
  return { version: 1, id: board.id, kind: 'board', title: board.title, sources: board.sources,
    includedNodeIds: [...new Set(board.includedNodeIds)], positions, sequenceModes };
}

function putBoard(db: DenimDatabase, board: DenimBoard): void {
  putDenimBoard(db, { id: board.id, payload: board });
}

function graphForBoard(db: DenimDatabase, board: DenimBoard) {
  const nodes = new Map<string, DenimNode>();
  const edges = new Map<string, ReturnType<typeof getDenimGraph>['edges'][number]>();
  for (const source of board.sources) {
    const graph = source.kind === 'journey' ? getJourneyGraph(db, source.journeyId)
      : source.kind === 'capabilities' ? { nodes: listCapabilities(db), edges: [] }
        : source.kind === 'instances' ? { nodes: listTopLevelInstances(db), edges: [] }
          : { nodes: listJourneys(db), edges: [] };
    graph.nodes.forEach((node) => nodes.set(node.id, node));
    graph.edges.forEach((edge) => edges.set(edge.id, edge));
  }
  if (board.includedNodeIds.length) {
    const graph = getDenimGraph(db);
    const included = new Set(board.includedNodeIds);
    graph.nodes.filter((node) => included.has(node.id)).forEach((node) => nodes.set(node.id, node));
    graph.edges.filter((edge) => nodes.has(edge.sourceId) && nodes.has(edge.targetId)).forEach((edge) => edges.set(edge.id, edge));
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function requireNode(db: DenimDatabase, id: string): DenimNode {
  const node = getDenimGraph(db).nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

function requireBoard(db: DenimDatabase, id: string): DenimBoard {
  const board = readDenimBoards(db).find((candidate) => candidate.id === id);
  if (!board) throw new Error(`Board not found: ${id}`);
  return board;
}

/** Apply one validated Denim domain action to an open database. */
export function applyDenimAction(db: DenimDatabase, action: DenimAction): DenimActionResult {
  if (!action || typeof action !== 'object' || typeof action.op !== 'string') throw new Error('Invalid Denim action');
  switch (action.op) {
    case 'journey.create': {
      if (action.id !== undefined && typeof action.id !== 'string') throw new Error('Journey ID must be text');
      if (action.text !== undefined && typeof action.text !== 'string') throw new Error('Journey text must be text');
      const nodeId = action.id ?? newId('journey');
      addDenimNode(db, { id: nodeId, type: 'Journey', text: action.text ?? 'New journey' });
      return { ok: true, changed: true, nodeId };
    }
    case 'node.differentiate': {
      if (action.text !== undefined && typeof action.text !== 'string') throw new Error('Node text must be text');
      if (action.placement && ![action.placement.x, action.placement.y].every(Number.isFinite)) {
        throw new Error('Node position must contain finite x and y values');
      }
      const placementBoard = action.placement ? requireBoard(db, action.placement.boardId) : undefined;
      const parent = requireNode(db, action.parentId);
      const nodeId = action.id ?? newId('node');
      createDenimChild(db, action.parentId, { id: nodeId, type: parent.type, text: action.text ?? 'New action' }, action.edgeId ?? newId('parent-child'));
      if (action.placement && placementBoard) putBoard(db, { ...placementBoard,
        positions: { ...placementBoard.positions, [nodeId]: { x: action.placement.x, y: action.placement.y } } });
      return { ok: true, changed: true, nodeId };
    }
    case 'edge.connect':
      requireNode(db, action.parentId); requireNode(db, action.childId);
      if (action.parentId === action.childId) throw new Error('A node cannot connect to itself');
      if (getDenimGraph(db).edges.some((edge) => edge.type === 'parent-child'
        && edge.sourceId === action.parentId && edge.targetId === action.childId)) {
        throw new Error('These Nodes are already connected');
      }
      connectDenimChild(db, action.parentId, action.childId, action.edgeId ?? newId('parent-child'));
      return { ok: true, changed: true, nodeId: action.childId };
    case 'edge.delete':
      if (!getDenimGraph(db).edges.some((edge) => edge.id === action.edgeId)) throw new Error(`Edge not found: ${action.edgeId}`);
      deleteDenimEdge(db, action.edgeId);
      return { ok: true, changed: true };
    case 'node.update': {
      if (!action.patch || typeof action.patch !== 'object' || Array.isArray(action.patch)) throw new Error('Node patch must be an object');
      const previous = requireNode(db, action.id);
      if (action.patch.type === undefined && action.patch.text === undefined) throw new Error('Node update requires type or text');
      if (action.patch.type !== undefined && typeof action.patch.type !== 'string') throw new Error('Node type must be text');
      if (action.patch.text !== undefined && typeof action.patch.text !== 'string') throw new Error('Node text must be text');
      updateDenimNode(db, action.id, action.patch);
      if (previous.type === 'Journey' && action.patch.text !== undefined) {
        for (const board of readDenimBoards(db)) if (board.kind === 'board' && board.sources.some((source) => source.kind === 'journey' && source.journeyId === action.id)) {
          putBoard(db, { ...board, title: action.patch.text });
        }
      }
      return { ok: true, changed: true, nodeId: action.id };
    }
    case 'node.delete': {
      if (action.scope !== 'node' && action.scope !== 'subtree') throw new Error('Node delete scope must be node or subtree');
      const node = requireNode(db, action.id);
      const graph = getDenimGraph(db);
      const children = new Map<string, string[]>();
      for (const edge of graph.edges) if (edge.type === 'parent-child') children.set(edge.sourceId, [...(children.get(edge.sourceId) ?? []), edge.targetId]);
      const descendants = new Set<string>();
      const pending = [...(children.get(action.id) ?? [])];
      while (pending.length) {
        const next = pending.pop()!;
        if (descendants.has(next)) continue;
        descendants.add(next); pending.push(...(children.get(next) ?? []));
      }
      const removed = action.scope === 'subtree' ? new Set([action.id, ...descendants]) : new Set([action.id]);
      const visibleBoards = new Set(readDenimBoards(db).filter((board) => graphForBoard(db, board).nodes.some((item) => item.id === action.id)).map((board) => board.id));
      if (action.scope === 'subtree') deleteDenimNodeAndChildren(db, action.id); else deleteDenimNode(db, action.id);
      for (const board of readDenimBoards(db)) {
        if (action.scope === 'subtree' && board.kind === 'board' && board.sources.some((source) => source.kind === 'journey' && removed.has(source.journeyId))) {
          removeDenimBoard(db, board.id);
          continue;
        }
        let includedNodeIds = board.includedNodeIds.filter((id) => !removed.has(id));
        if (action.scope === 'node' && visibleBoards.has(board.id)) includedNodeIds = [...new Set([...includedNodeIds, ...descendants])];
        putBoard(db, { ...board, includedNodeIds,
          positions: Object.fromEntries(Object.entries(board.positions).filter(([id]) => !removed.has(id))),
          sequenceModes: Object.fromEntries(Object.entries(board.sequenceModes).filter(([id]) => !removed.has(id))),
        });
      }
      return { ok: true, changed: true, nodeId: node.id };
    }
    case 'edge.priority.set':
      if (!Number.isFinite(action.priority)) throw new Error('Edge priority must be finite');
      if (!getDenimGraph(db).edges.some((edge) => edge.id === action.edgeId)) throw new Error(`Edge not found: ${action.edgeId}`);
      updateDenimEdgePriority(db, action.edgeId, action.priority);
      return { ok: true, changed: true };
    case 'sequence.initialize':
      if (!Array.isArray(action.orderedChildIds) || action.orderedChildIds.some((id) => typeof id !== 'string')) throw new Error('orderedChildIds must be an array of IDs');
      requireNode(db, action.parentId); initializeDenimSequence(db, action.parentId, action.orderedChildIds);
      return { ok: true, changed: true };
    case 'sequence.clear':
      requireNode(db, action.parentId); clearDenimSequence(db, action.parentId);
      return { ok: true, changed: true };
    case 'board.read': {
      const board = requireBoard(db, action.boardId);
      return { ok: true, changed: false, boardId: board.id, board, graph: graphForBoard(db, board) };
    }
    case 'board.sequenceMode.set': {
      if (action.mode !== 'rank' && action.mode !== 'priority') throw new Error('Sequence mode must be rank or priority');
      requireNode(db, action.parentId);
      const board = requireBoard(db, action.boardId);
      putBoard(db, { ...board, sequenceModes: { ...board.sequenceModes, [action.parentId]: action.mode } });
      return { ok: true, changed: true, boardId: board.id };
    }
    case 'board.includeNode': {
      const board = requireBoard(db, action.boardId); requireNode(db, action.nodeId);
      if (board.includedNodeIds.includes(action.nodeId)) return { ok: true, changed: false, boardId: board.id };
      putBoard(db, { ...board, includedNodeIds: [...board.includedNodeIds, action.nodeId] });
      return { ok: true, changed: true, boardId: board.id };
    }
    case 'board.node.move': {
      const board = requireBoard(db, action.boardId); requireNode(db, action.nodeId);
      if (![action.position?.x, action.position?.y].every(Number.isFinite)) throw new Error('Node position must contain finite x and y values');
      putBoard(db, { ...board, positions: { ...board.positions, [action.nodeId]: action.position } });
      return { ok: true, changed: true, boardId: board.id };
    }
    case 'board.nodes.move': {
      const board = requireBoard(db, action.boardId);
      if (!action.positions || typeof action.positions !== 'object' || Array.isArray(action.positions)) throw new Error('Node positions must be an object');
      const graphNodeIds = new Set(getDenimGraph(db).nodes.map((node) => node.id));
      for (const [id, position] of Object.entries(action.positions)) {
        if (!graphNodeIds.has(id)) throw new Error(`Node not found: ${id}`);
        if (![position?.x, position?.y].every(Number.isFinite)) throw new Error('Node position must contain finite x and y values');
      }
      putBoard(db, { ...board, positions: { ...board.positions, ...action.positions } });
      return { ok: true, changed: true, boardId: board.id };
    }
    case 'board.openJourney': {
      const journey = requireNode(db, action.journeyId);
      if (journey.type !== 'Journey') throw new Error(`Node is not a Journey: ${action.journeyId}`);
      const boardId = action.boardId ?? newId('journey-board');
      if (readDenimBoards(db).some((board) => board.id === boardId)) throw new Error(`Board already exists: ${boardId}`);
      putBoard(db, { version: 1, id: boardId, kind: 'board', title: journey.text,
        sources: [{ kind: 'journey', journeyId: journey.id }], includedNodeIds: [], positions: {}, sequenceModes: {} });
      return { ok: true, changed: true, boardId };
    }
    case 'board.close': {
      const board = requireBoard(db, action.boardId);
      if (board.kind === 'pinned') throw new Error('Pinned Boards cannot be closed');
      removeDenimBoard(db, board.id);
      return { ok: true, changed: true, boardId: board.id };
    }
    default: throw new Error(`Unknown Denim action: ${(action as { op: string }).op}`);
  }
}

/** Read the graph and its persistent Boards so agents can understand a database. */
export function readDenimSnapshot(db: DenimDatabase) {
  return { graph: getDenimGraph(db), boards: readDenimBoards(db) };
}
