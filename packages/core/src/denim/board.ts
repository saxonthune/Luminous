import {
  getDenimGraph,
  getJourneyGraph,
  listCapabilities,
  listDenimContainers,
  listDenimBoards,
  listJourneys,
  listTopLevelInstances,
  putDenimBoard,
  type DenimDatabase,
  type DenimEdge,
  type DenimNode,
} from './database.ts';

export type DenimQuerySource =
  | { kind: 'journeys' }
  | { kind: 'capabilities' }
  | { kind: 'instances' }
  | { kind: 'journey'; journeyId: string };

export interface DenimBoardContainer {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Present when this Board container is the visual projection of a shared Sequence Container. */
  sequenceContainerId?: string;
  /** Presentation is a per-Board choice, not shared Sequence Container data. */
  presentation?: 'special' | 'graph';
}

export const DENIM_DEFAULT_NODE_SIZE = { width: 232, height: 142 } as const;
export const DENIM_DEFAULT_CONTAINER_SIZE = { width: 360, height: 280 } as const;
export const DENIM_DEFAULT_CONTAINER_GAP = 100;

export interface DenimBoard {
  version: 1;
  id: string;
  kind: 'pinned' | 'board';
  title: string;
  sources: DenimQuerySource[];
  /** Nodes currently loaded onto this Board. This is the Board's exact membership set. */
  loadedNodeIds: string[];
  positions: Record<string, { x: number; y: number }>;
  sequenceModes: Record<string, 'rank' | 'priority'>;
  /** Board-local bounds and presentation for shared regular and Sequence Containers. */
  containers: Record<string, DenimBoardContainer>;
}

export const DENIM_PINNED_BOARDS: DenimBoard[] = [
  { version: 1, id: 'pinned:journeys', kind: 'pinned', title: 'Journeys', sources: [{ kind: 'journeys' }], loadedNodeIds: [], positions: {}, sequenceModes: {}, containers: {} },
  { version: 1, id: 'pinned:capabilities', kind: 'pinned', title: 'Capabilities', sources: [{ kind: 'capabilities' }], loadedNodeIds: [], positions: {}, sequenceModes: {}, containers: {} },
  { version: 1, id: 'pinned:instances', kind: 'pinned', title: 'Instances', sources: [{ kind: 'instances' }], loadedNodeIds: [], positions: {}, sequenceModes: {}, containers: {} },
];

export function readDenimBoards(db: DenimDatabase): DenimBoard[] {
  const persisted = listDenimBoards(db).map(({ payload }) => decodeBoard(db, payload)).filter((v): v is DenimBoard => Boolean(v));
  const overrides = new Map(persisted.filter((v) => v.kind === 'pinned').map((v) => [v.id, v]));
  const boards = [
    ...DENIM_PINNED_BOARDS.map((board) => overrides.get(board.id) ?? { ...board, loadedNodeIds: sourceGraph(db, board).nodes.map((node) => node.id) }),
    ...persisted.filter((v) => v.kind === 'board'),
  ];
  return boards.map((board) => ensureLoadedContainerPlacements(db, board, boards));
}

/** Give loaded owners their regular Containers, deriving a Board-local placement when needed. */
export function ensureLoadedContainerPlacements(
  db: DenimDatabase,
  board: DenimBoard,
  candidateBoards: DenimBoard[],
): DenimBoard {
  const loaded = new Set(board.loadedNodeIds);
  let containers = board.containers;
  for (const record of listDenimContainers(db)) {
    const ownerNodeId = record.ownerNodeId;
    if (!loaded.has(ownerNodeId) || containers[ownerNodeId]) continue;
    const sourceBoard = candidateBoards.find((candidate) => candidate.id !== board.id
      && candidate.containers[ownerNodeId] && !candidate.containers[ownerNodeId].sequenceContainerId);
    const source = sourceBoard?.containers[ownerNodeId];
    if (sourceBoard && source) {
      const sourceOwnerPosition = sourceBoard.positions[ownerNodeId];
      const targetOwnerPosition = board.positions[ownerNodeId];
      const dx = sourceOwnerPosition && targetOwnerPosition ? targetOwnerPosition.x - sourceOwnerPosition.x : 0;
      const dy = sourceOwnerPosition && targetOwnerPosition ? targetOwnerPosition.y - sourceOwnerPosition.y : 0;
      containers = { ...containers, [ownerNodeId]: {
        x: source.x + dx, y: source.y + dy, width: source.width, height: source.height,
      } };
    } else {
      const ownerPosition = board.positions[ownerNodeId] ?? { x: 0, y: 0 };
      containers = { ...containers, [ownerNodeId]: {
        x: ownerPosition.x + DENIM_DEFAULT_NODE_SIZE.width + DENIM_DEFAULT_CONTAINER_GAP,
        y: ownerPosition.y,
        width: DENIM_DEFAULT_CONTAINER_SIZE.width,
        height: DENIM_DEFAULT_CONTAINER_SIZE.height,
      } };
    }
  }
  return containers === board.containers ? board : { ...board, containers };
}

function isQuerySource(value: unknown): value is DenimQuerySource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return source.kind === 'journeys' || source.kind === 'capabilities' || source.kind === 'instances'
    || (source.kind === 'journey' && typeof source.journeyId === 'string');
}

export function sourceGraph(db: DenimDatabase, board: Pick<DenimBoard, 'sources'>) {
  const nodes = new Map<string, DenimNode>();
  const edges = new Map<string, DenimEdge>();
  for (const source of board.sources) {
    const graph = source.kind === 'journey' ? getJourneyGraph(db, source.journeyId)
      : source.kind === 'capabilities' ? { nodes: listCapabilities(db), edges: [] }
        : source.kind === 'instances' ? { nodes: listTopLevelInstances(db), edges: [] }
          : { nodes: listJourneys(db), edges: [] };
    graph.nodes.forEach((node) => nodes.set(node.id, node));
    graph.edges.forEach((edge) => edges.set(edge.id, edge));
  }
  const graph = getDenimGraph(db);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const edge of graph.edges) {
      if (edge.type !== 'contains' || !nodes.has(edge.sourceId)) continue;
      edges.set(edge.id, edge);
      const member = graph.nodes.find((node) => node.id === edge.targetId);
      if (member && !nodes.has(member.id)) { nodes.set(member.id, member); expanded = true; }
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function decodeBoard(db: DenimDatabase, value: unknown): DenimBoard | undefined {
  if (!value || typeof value !== 'object') return;
  const board = value as Partial<DenimBoard>;
  const raw = value as Record<string, unknown>;
  if (board.version !== 1 || typeof board.id !== 'string' || !Array.isArray(board.sources) || !board.sources.every(isQuerySource)
    || !board.positions || typeof board.positions !== 'object') return;
  const sources = board.sources as DenimQuerySource[];
  const graph = sourceGraph(db, { sources });
  const legacyIncluded = Array.isArray(raw.includedNodeIds) ? raw.includedNodeIds.filter((id): id is string => typeof id === 'string') : [];
  const legacyHidden = Array.isArray(raw.hiddenNodeIds) ? raw.hiddenNodeIds.filter((id): id is string => typeof id === 'string') : [];
  const loadedNodeIds = Array.isArray(board.loadedNodeIds) && board.loadedNodeIds.every((id) => typeof id === 'string')
    ? [...new Set(board.loadedNodeIds)]
    : [...new Set([...graph.nodes.map((node) => node.id), ...legacyIncluded])].filter((id) => !legacyHidden.includes(id));
  const positions: DenimBoard['positions'] = {};
  for (const [id, point] of Object.entries(board.positions)) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    positions[id] = { x: point.x, y: point.y };
  }
  const sequenceModes: DenimBoard['sequenceModes'] = {};
  if (board.sequenceModes && typeof board.sequenceModes === 'object') {
    for (const [id, mode] of Object.entries(board.sequenceModes)) if (mode === 'rank' || mode === 'priority') sequenceModes[id] = mode;
  }
  const containers: DenimBoard['containers'] = {};
  if (board.containers !== undefined) {
    if (!board.containers || typeof board.containers !== 'object' || Array.isArray(board.containers)) return;
    for (const [headNodeId, container] of Object.entries(board.containers)) {
      if (!container || ![container.x, container.y, container.width, container.height].every(Number.isFinite)
        || container.width <= 0 || container.height <= 0) return;
      const sequenceContainerId = typeof container.sequenceContainerId === 'string' ? container.sequenceContainerId : undefined;
      const presentation = container.presentation === 'graph' ? 'graph' : 'special';
      containers[headNodeId] = {
        x: container.x,
        y: container.y,
        width: container.width,
        height: container.height,
        ...(sequenceContainerId ? { sequenceContainerId, presentation } : {}),
      };
    }
  }
  if (board.kind === 'pinned') {
    const pinned = DENIM_PINNED_BOARDS.find((candidate) => candidate.id === board.id);
    if (!pinned) return;
    return { ...pinned, loadedNodeIds, positions, sequenceModes, containers };
  }
  if (board.kind !== 'board' || typeof board.title !== 'string' || DENIM_PINNED_BOARDS.some((candidate) => candidate.id === board.id)) return;
  return { version: 1, id: board.id, kind: 'board', title: board.title, sources: board.sources,
    loadedNodeIds, positions, sequenceModes, containers };
}

export function putBoard(db: DenimDatabase, board: DenimBoard): void {
  putDenimBoard(db, { id: board.id, payload: board });
}

export function getDenimBoardGraph(db: DenimDatabase, board: DenimBoard) {
  const fullGraph = getDenimGraph(db);
  const loadedIds = new Set(board.loadedNodeIds);
  const loadedNodes = fullGraph.nodes.filter((node) => loadedIds.has(node.id));
  const loadedNodeIds = new Set(loadedNodes.map((node) => node.id));
  return { nodes: loadedNodes, edges: fullGraph.edges.filter((edge) => loadedNodeIds.has(edge.sourceId) && loadedNodeIds.has(edge.targetId)) };
}

export function loadNodeOnSourceBoards(db: DenimDatabase, nodeId: string, parentId?: string): void {
  for (const board of readDenimBoards(db)) {
    const sourceIds = new Set(sourceGraph(db, board).nodes.map((node) => node.id));
    const belongsBySource = sourceIds.has(nodeId) && (!parentId || board.loadedNodeIds.includes(parentId));
    if (!belongsBySource || board.loadedNodeIds.includes(nodeId)) continue;
    putBoard(db, { ...board, loadedNodeIds: [...board.loadedNodeIds, nodeId] });
  }
}

export function requireDenimBoard(db: DenimDatabase, id: string): DenimBoard {
  const board = readDenimBoards(db).find((candidate) => candidate.id === id);
  if (!board) throw new Error(`Board not found: ${id}`);
  return board;
}
