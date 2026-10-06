import {
  addDenimNode,
  addDenimEdge,
  clearDenimSequence,
  connectDenimChild,
  createDenimChild,
  createDenimContainedNode,
  deleteDenimNode,
  deleteDenimNodeAndChildren,
  deleteDenimEdge,
  getDenimEdge,
  getDenimContainment,
  getDenimGraph,
  getDenimNode,
  hasDenimEdge,
  initializeDenimSequence,
  listDenimDescendantIds,
  listDenimNodeIds,
  removeDenimBoard,
  replaceDenimContainment,
  runDenimTransaction,
  updateDenimEdgePriority,
  updateDenimNode,
  type DenimDatabase,
  type DenimNode,
} from './database.ts';
import {
  getDenimBoardGraph,
  loadNodeOnSourceBoards,
  putBoard,
  readDenimBoards,
  requireDenimBoard,
  sourceGraph,
  type DenimBoard,
  type DenimBoardContainer,
} from './board.ts';

export { DENIM_PINNED_BOARDS, getDenimBoardGraph, readDenimBoards } from './board.ts';
export type { DenimBoard, DenimBoardContainer, DenimQuerySource } from './board.ts';

export type DenimAction =
  | { op: 'journey.create'; id?: string; text?: string }
  | { op: 'node.create'; id?: string; type: string; text: string; placement?: { boardId: string; x: number; y: number } }
  | { op: 'node.differentiate'; parentId: string; id?: string; edgeId?: string; text?: string; placement?: { boardId: string; x: number; y: number } }
  | { op: 'edge.connect'; parentId: string; childId: string; edgeId?: string }
  | { op: 'edge.delete'; edgeId: string }
  | { op: 'container.attach'; boardId: string; containerNodeId: string; nodeId: string; position: { x: number; y: number } }
  | { op: 'container.detach'; containerNodeId: string; nodeId: string }
  | { op: 'node.update'; id: string; patch: Partial<Pick<DenimNode, 'type' | 'text'>> }
  | { op: 'node.delete'; id: string; scope: 'node' | 'subtree' }
  | { op: 'edge.priority.set'; edgeId: string; priority: number }
  | { op: 'sequence.initialize'; parentId: string; orderedChildIds: string[] }
  | { op: 'sequence.clear'; parentId: string }
  | { op: 'board.read'; boardId: string }
  | { op: 'board.container.spawn'; boardId: string; headNodeId: string; container: DenimBoardContainer }
  | { op: 'board.container.move'; boardId: string; headNodeId: string; position: { x: number; y: number }; carriedPositions?: Record<string, { x: number; y: number }>; carriedContainers?: Record<string, { x: number; y: number }> }
  | { op: 'board.container.resize'; boardId: string; headNodeId: string; size: { width: number; height: number } }
  | { op: 'container.node.create'; boardId: string; headNodeId: string; id?: string; edgeId?: string }
  | { op: 'container.nodes.create'; boardId: string; headNodeId: string; nodes: Array<{ id: string; type: string; text: string; position: { x: number; y: number }; edgeId?: string }> }
  | { op: 'board.sequenceMode.set'; boardId: string; parentId: string; mode: 'rank' | 'priority' }
  | { op: 'board.node.load.set'; boardId: string; nodeId: string; loaded: boolean }
  | { op: 'board.node.move'; boardId: string; nodeId: string; position: { x: number; y: number } }
  | { op: 'board.nodes.move'; boardId: string; positions: Record<string, { x: number; y: number }> }
  | { op: 'board.openJourney'; journeyId: string; boardId?: string }
  | { op: 'board.close'; boardId: string };

export const DENIM_ACTION_CATALOG = [
  { op: 'journey.create', required: [], optional: ['id', 'text'], purpose: 'Create a Journey Node.' },
  { op: 'node.create', required: ['type', 'text'], optional: ['id', 'placement'], purpose: 'Create an unconnected Node, optionally placing and including it on a Board.' },
  { op: 'node.differentiate', required: ['parentId'], optional: ['id', 'edgeId', 'text', 'placement'], purpose: 'Create a child Node with the same type as its parent and connect it to its parent; optionally place it on a Board.' },
  { op: 'edge.connect', required: ['parentId', 'childId'], optional: ['edgeId'], purpose: 'Connect an existing Node as a child.' },
  { op: 'edge.delete', required: ['edgeId'], optional: [], purpose: 'Delete one edge while keeping its endpoint Nodes.' },
  { op: 'container.attach', required: ['boardId', 'containerNodeId', 'nodeId', 'position'], optional: [], purpose: 'Attach and position an existing Node in a Container, replacing its previous containment Edge.' },
  { op: 'container.detach', required: ['containerNodeId', 'nodeId'], optional: [], purpose: 'Remove a contains Edge while keeping the Node and its current Board presence.' },
  { op: 'node.update', required: ['id', 'patch'], optional: [], purpose: 'Change a Node type or text.' },
  { op: 'node.delete', required: ['id', 'scope'], optional: [], purpose: 'Delete one Node or its full descendant subtree; scope is node or subtree.' },
  { op: 'edge.priority.set', required: ['edgeId', 'priority'], optional: [], purpose: 'Set an edge sequence priority.' },
  { op: 'sequence.initialize', required: ['parentId', 'orderedChildIds'], optional: [], purpose: 'Assign priorities in the supplied child order.' },
  { op: 'sequence.clear', required: ['parentId'], optional: [], purpose: 'Clear priorities on all child edges.' },
  { op: 'board.read', required: ['boardId'], optional: [], purpose: 'Read a Board and its query projection.' },
  { op: 'board.container.spawn', required: ['boardId', 'headNodeId', 'container'], optional: [], purpose: 'Spawn a Board container represented by a Node.' },
  { op: 'board.container.move', required: ['boardId', 'headNodeId', 'position'], optional: ['carriedPositions', 'carriedContainers'], purpose: 'Move a Board container, its visually contained Nodes, and their nested Containers.' },
  { op: 'board.container.resize', required: ['boardId', 'headNodeId', 'size'], optional: [], purpose: 'Resize a Board container.' },
  { op: 'container.node.create', required: ['boardId', 'headNodeId'], optional: ['id', 'edgeId'], purpose: 'Create a Node inside a Container, using the container owner Node type.' },
  { op: 'container.nodes.create', required: ['boardId', 'headNodeId', 'nodes'], optional: [], purpose: 'Create a set of typed Nodes with labels and positions inside one Container.' },
  { op: 'board.sequenceMode.set', required: ['boardId', 'parentId', 'mode'], optional: [], purpose: 'Set a parent label mode on a Board to rank or priority.' },
  { op: 'board.node.load.set', required: ['boardId', 'nodeId', 'loaded'], optional: [], purpose: 'Load a Node onto a Board or unload it from that Board without changing shared graph data.' },
  { op: 'board.node.move', required: ['boardId', 'nodeId', 'position'], optional: [], purpose: 'Save a Node position on a Board.' },
  { op: 'board.nodes.move', required: ['boardId', 'positions'], optional: [], purpose: 'Save multiple Node positions on a Board as one action.' },
  { op: 'board.openJourney', required: ['journeyId'], optional: ['boardId'], purpose: 'Create a persistent Board sourced from a Journey.' },
  { op: 'board.close', required: ['boardId'], optional: [], purpose: 'Close and remove a Board; pinned Boards cannot be closed.' },
] as const;

export interface DenimActionResult {
  ok: true;
  changed: boolean;
  nodeId?: string;
  nodeIds?: string[];
  boardId?: string;
  board?: DenimBoard;
  graph?: ReturnType<typeof getDenimBoardGraph>;
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function requireNode(db: DenimDatabase, id: string): DenimNode {
  const node = getDenimNode(db, id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

function requireBoard(db: DenimDatabase, id: string): DenimBoard {
  return requireDenimBoard(db, id);
}

type ActionFor<Op extends DenimAction['op']> = Extract<DenimAction, { op: Op }>;

function handleJourneyCreate(db: DenimDatabase, action: ActionFor<'journey.create'>): DenimActionResult {
  if (action.id !== undefined && typeof action.id !== 'string') throw new Error('Journey ID must be text');
  if (action.text !== undefined && typeof action.text !== 'string') throw new Error('Journey text must be text');
  const nodeId = action.id ?? newId('journey');
  addDenimNode(db, { id: nodeId, type: 'Journey', text: action.text ?? 'New journey' });
  loadNodeOnSourceBoards(db, nodeId);
  return { ok: true, changed: true, nodeId };
}

function handleNodeCreate(db: DenimDatabase, action: ActionFor<'node.create'>): DenimActionResult {
  if (typeof action.type !== 'string' || !action.type.trim()) throw new Error('Node type must be nonempty text');
  if (typeof action.text !== 'string') throw new Error('Node text must be text');
  if (action.placement && ![action.placement.x, action.placement.y].every(Number.isFinite)) {
    throw new Error('Node placement must contain finite x and y values');
  }
  const board = action.placement ? requireBoard(db, action.placement.boardId) : undefined;
  const nodeId = action.id ?? newId('node');
  if (getDenimNode(db, nodeId)) throw new Error(`Node already exists: ${nodeId}`);
  addDenimNode(db, { id: nodeId, type: action.type.trim(), text: action.text });
  loadNodeOnSourceBoards(db, nodeId);
  if (board && action.placement) {
    const currentBoard = requireBoard(db, board.id);
    putBoard(db, { ...currentBoard, loadedNodeIds: [...new Set([...currentBoard.loadedNodeIds, nodeId])],
      positions: { ...currentBoard.positions, [nodeId]: { x: action.placement.x, y: action.placement.y } } });
  }
  return { ok: true, changed: true, nodeId, boardId: board?.id };
}

function handleNodeDifferentiate(db: DenimDatabase, action: ActionFor<'node.differentiate'>): DenimActionResult {
  if (action.text !== undefined && typeof action.text !== 'string') throw new Error('Node text must be text');
  if (action.placement && ![action.placement.x, action.placement.y].every(Number.isFinite)) {
    throw new Error('Node position must contain finite x and y values');
  }
  const placementBoard = action.placement ? requireBoard(db, action.placement.boardId) : undefined;
  const parent = requireNode(db, action.parentId);
  const nodeId = action.id ?? newId('node');
  createDenimChild(db, action.parentId, { id: nodeId, type: parent.type, text: action.text ?? 'New action' }, action.edgeId ?? newId('parent-child'));
  loadNodeOnSourceBoards(db, nodeId, parent.id);
  if (action.placement && placementBoard) {
    const currentBoard = requireBoard(db, placementBoard.id);
    putBoard(db, { ...currentBoard, loadedNodeIds: [...new Set([...currentBoard.loadedNodeIds, nodeId])],
      positions: { ...currentBoard.positions, [nodeId]: { x: action.placement.x, y: action.placement.y } } });
  }
  return { ok: true, changed: true, nodeId };
}

function handleEdgeConnect(db: DenimDatabase, action: ActionFor<'edge.connect'>): DenimActionResult {
  requireNode(db, action.parentId); requireNode(db, action.childId);
  if (action.parentId === action.childId) throw new Error('A node cannot connect to itself');
  if (hasDenimEdge(db, 'parent-child', action.parentId, action.childId)) {
    throw new Error('These Nodes are already connected');
  }
  connectDenimChild(db, action.parentId, action.childId, action.edgeId ?? newId('parent-child'));
  loadNodeOnSourceBoards(db, action.childId, action.parentId);
  return { ok: true, changed: true, nodeId: action.childId };
}

function handleEdgeDelete(db: DenimDatabase, action: ActionFor<'edge.delete'>): DenimActionResult {
  if (!getDenimEdge(db, action.edgeId)) throw new Error(`Edge not found: ${action.edgeId}`);
  deleteDenimEdge(db, action.edgeId);
  return { ok: true, changed: true };
}

function handleContainerAttach(db: DenimDatabase, action: ActionFor<'container.attach'>): DenimActionResult {
  requireNode(db, action.containerNodeId);
  requireNode(db, action.nodeId);
  if (action.containerNodeId === action.nodeId) throw new Error('A Node cannot contain itself');
  const board = requireBoard(db, action.boardId);
  if (!board.containers[action.containerNodeId]) throw new Error(`Container not found for Node: ${action.containerNodeId}`);
  if (!getDenimBoardGraph(db, board).nodes.some((node) => node.id === action.containerNodeId)) {
    throw new Error(`Container owner Node is not on Board: ${action.containerNodeId}`);
  }
  if (![action.position?.x, action.position?.y].every(Number.isFinite)) throw new Error('Node position must contain finite x and y values');
  replaceDenimContainment(db, action.containerNodeId, action.nodeId, newId('contains'));
  loadNodeOnSourceBoards(db, action.nodeId, action.containerNodeId);
  putBoard(db, { ...board, loadedNodeIds: [...new Set([...board.loadedNodeIds, action.nodeId])], positions: { ...board.positions, [action.nodeId]: action.position } });
  return { ok: true, changed: true, nodeId: action.nodeId, boardId: board.id };
}

function handleContainerDetach(db: DenimDatabase, action: ActionFor<'container.detach'>): DenimActionResult {
  const edge = getDenimContainment(db, action.nodeId);
  if (edge?.sourceId !== action.containerNodeId) throw new Error(`Containment Edge not found from ${action.containerNodeId} to ${action.nodeId}`);
  const boardsToKeepNodeOn = readDenimBoards(db).filter((board) => board.containers[action.containerNodeId]
    && getDenimBoardGraph(db, board).nodes.some((node) => node.id === action.nodeId));
  deleteDenimEdge(db, edge.id);
  for (const board of boardsToKeepNodeOn) {
    if (board.loadedNodeIds.includes(action.nodeId)) continue;
    putBoard(db, { ...board, loadedNodeIds: [...board.loadedNodeIds, action.nodeId] });
  }
  return { ok: true, changed: true, nodeId: action.nodeId };
}

function handleNodeUpdate(db: DenimDatabase, action: ActionFor<'node.update'>): DenimActionResult {
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

function handleNodeDelete(db: DenimDatabase, action: ActionFor<'node.delete'>): DenimActionResult {
  if (action.scope !== 'node' && action.scope !== 'subtree') throw new Error('Node delete scope must be node or subtree');
  const node = requireNode(db, action.id);
  const descendants = new Set(listDenimDescendantIds(db, action.id));
  const removed = action.scope === 'subtree' ? new Set([action.id, ...descendants]) : new Set([action.id]);
  const loadedBoards = new Set(readDenimBoards(db).filter((board) => getDenimBoardGraph(db, board).nodes.some((item) => item.id === action.id)).map((board) => board.id));
  if (action.scope === 'subtree') deleteDenimNodeAndChildren(db, action.id); else deleteDenimNode(db, action.id);
  for (const board of readDenimBoards(db)) {
    if (action.scope === 'subtree' && board.kind === 'board' && board.sources.some((source) => source.kind === 'journey' && removed.has(source.journeyId))) {
      removeDenimBoard(db, board.id);
      continue;
    }
    let loadedNodeIds = board.loadedNodeIds.filter((id) => !removed.has(id));
    if (action.scope === 'node' && loadedBoards.has(board.id)) loadedNodeIds = [...new Set([...loadedNodeIds, ...descendants])];
    putBoard(db, { ...board, loadedNodeIds,
      positions: Object.fromEntries(Object.entries(board.positions).filter(([id]) => !removed.has(id))),
      sequenceModes: Object.fromEntries(Object.entries(board.sequenceModes).filter(([id]) => !removed.has(id))),
      containers: Object.fromEntries(Object.entries(board.containers).filter(([headNodeId]) => !removed.has(headNodeId))),
    });
  }
  return { ok: true, changed: true, nodeId: node.id };
}

function handleEdgePrioritySet(db: DenimDatabase, action: ActionFor<'edge.priority.set'>): DenimActionResult {
  if (!Number.isFinite(action.priority)) throw new Error('Edge priority must be finite');
  if (!getDenimEdge(db, action.edgeId)) throw new Error(`Edge not found: ${action.edgeId}`);
  updateDenimEdgePriority(db, action.edgeId, action.priority);
  return { ok: true, changed: true };
}

function handleSequenceInitialize(db: DenimDatabase, action: ActionFor<'sequence.initialize'>): DenimActionResult {
  if (!Array.isArray(action.orderedChildIds) || action.orderedChildIds.some((id) => typeof id !== 'string')) throw new Error('orderedChildIds must be an array of IDs');
  requireNode(db, action.parentId); initializeDenimSequence(db, action.parentId, action.orderedChildIds);
  return { ok: true, changed: true };
}

function handleSequenceClear(db: DenimDatabase, action: ActionFor<'sequence.clear'>): DenimActionResult {
  requireNode(db, action.parentId); clearDenimSequence(db, action.parentId);
  return { ok: true, changed: true };
}

function handleBoardRead(db: DenimDatabase, action: ActionFor<'board.read'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  return { ok: true, changed: false, boardId: board.id, board, graph: getDenimBoardGraph(db, board) };
}

function handleBoardContainerSpawn(db: DenimDatabase, action: ActionFor<'board.container.spawn'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  requireNode(db, action.headNodeId);
  if (!getDenimBoardGraph(db, board).nodes.some((node) => node.id === action.headNodeId)) {
    throw new Error(`Container head Node is not on Board: ${action.headNodeId}`);
  }
  if (![action.container?.x, action.container?.y, action.container?.width, action.container?.height].every(Number.isFinite)
    || action.container.width <= 0 || action.container.height <= 0) {
    throw new Error('Container bounds must have finite position and positive size');
  }
  if (board.containers[action.headNodeId]) return { ok: true, changed: false, nodeId: action.headNodeId, boardId: board.id };
  putBoard(db, { ...board, containers: { ...board.containers, [action.headNodeId]: action.container } });
  return { ok: true, changed: true, nodeId: action.headNodeId, boardId: board.id };
}

function handleBoardContainerMove(db: DenimDatabase, action: ActionFor<'board.container.move'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  const container = board.containers[action.headNodeId];
  if (!container) throw new Error(`Container not found for Node: ${action.headNodeId}`);
  if (![action.position?.x, action.position?.y].every(Number.isFinite)) throw new Error('Container position must contain finite x and y values');
  const carriedPositions = action.carriedPositions ?? {};
  const carriedContainers = action.carriedContainers ?? {};
  const graphNodeIds = new Set(listDenimNodeIds(db));
  for (const [id, point] of Object.entries(carriedPositions)) {
    if (!graphNodeIds.has(id)) throw new Error(`Node not found: ${id}`);
    if (![point?.x, point?.y].every(Number.isFinite)) throw new Error('Carried Node positions must contain finite x and y values');
  }
  const containers = { ...board.containers, [action.headNodeId]: { ...container, ...action.position } };
  for (const [id, position] of Object.entries(carriedContainers)) {
    const nested = containers[id];
    if (!nested) throw new Error(`Nested Container not found: ${id}`);
    if (![position?.x, position?.y].every(Number.isFinite)) throw new Error('Carried Container positions must contain finite x and y values');
    containers[id] = { ...nested, ...position };
  }
  putBoard(db, { ...board, positions: { ...board.positions, ...carriedPositions }, containers });
  return { ok: true, changed: true, nodeId: action.headNodeId, boardId: board.id };
}

function handleBoardContainerResize(db: DenimDatabase, action: ActionFor<'board.container.resize'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  const container = board.containers[action.headNodeId];
  if (!container) throw new Error(`Container not found for Node: ${action.headNodeId}`);
  if (![action.size?.width, action.size?.height].every(Number.isFinite) || action.size.width <= 0 || action.size.height <= 0) {
    throw new Error('Container size must contain positive finite width and height');
  }
  putBoard(db, { ...board, containers: { ...board.containers, [action.headNodeId]: { ...container, ...action.size } } });
  return { ok: true, changed: true, nodeId: action.headNodeId, boardId: board.id };
}

function handleContainerNodeCreate(db: DenimDatabase, action: ActionFor<'container.node.create'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  const container = board.containers[action.headNodeId];
  if (!container) throw new Error(`Container not found for Node: ${action.headNodeId}`);
  const owner = requireNode(db, action.headNodeId);
  if (!getDenimBoardGraph(db, board).nodes.some((node) => node.id === owner.id)) {
    throw new Error(`Container owner Node is not on Board: ${owner.id}`);
  }
  const nodeId = action.id ?? newId('node');
  createDenimContainedNode(db, owner.id, { id: nodeId, type: owner.type, text: 'New node' }, action.edgeId ?? newId('contains'));
  loadNodeOnSourceBoards(db, nodeId, owner.id);
  const currentBoard = requireBoard(db, board.id);
  putBoard(db, { ...currentBoard, loadedNodeIds: [...new Set([...currentBoard.loadedNodeIds, nodeId])], positions: { ...currentBoard.positions, [nodeId]: { x: container.x + 12, y: container.y + 88 } } });
  return { ok: true, changed: true, nodeId, boardId: board.id };
}

function handleContainerNodesCreate(db: DenimDatabase, action: ActionFor<'container.nodes.create'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  const container = board.containers[action.headNodeId];
  if (!container) throw new Error(`Container not found for Node: ${action.headNodeId}`);
  const owner = requireNode(db, action.headNodeId);
  if (!getDenimBoardGraph(db, board).nodes.some((node) => node.id === owner.id)) {
    throw new Error(`Container owner Node is not on Board: ${owner.id}`);
  }
  if (!Array.isArray(action.nodes) || action.nodes.length === 0) throw new Error('Container node batch must be a nonempty array');
  const ids = new Set<string>();
  const edgeIds = new Set<string>();
  const positions = { ...board.positions };
  for (const item of action.nodes) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || getDenimNode(db, item.id)) {
      throw new Error(`Container batch has a missing or duplicate Node ID: ${item?.id ?? ''}`);
    }
    if (typeof item.type !== 'string' || !item.type.trim() || typeof item.text !== 'string') throw new Error(`Invalid type or label for Node: ${item.id}`);
    if (![item.position?.x, item.position?.y].every(Number.isFinite)) throw new Error(`Invalid position for Node: ${item.id}`);
    const edgeId = item.edgeId ?? `contains-${item.id}`;
    if (edgeIds.has(edgeId) || getDenimEdge(db, edgeId)) throw new Error(`Container batch has a duplicate Edge ID: ${edgeId}`);
    ids.add(item.id); edgeIds.add(edgeId);
    positions[item.id] = item.position;
  }
  runDenimTransaction(db, () => {
    for (const item of action.nodes) {
      addDenimNode(db, { id: item.id, type: item.type.trim(), text: item.text });
      addDenimEdge(db, { id: item.edgeId ?? `contains-${item.id}`, type: 'contains', sourceId: action.headNodeId, targetId: item.id });
    }
    for (const item of action.nodes) loadNodeOnSourceBoards(db, item.id, action.headNodeId);
    const currentBoard = requireBoard(db, board.id);
    putBoard(db, { ...currentBoard, loadedNodeIds: [...new Set([...currentBoard.loadedNodeIds, ...action.nodes.map((item) => item.id)])], positions });
  });
  return { ok: true, changed: true, nodeIds: action.nodes.map((item) => item.id), boardId: board.id };
}

function handleBoardSequenceModeSet(db: DenimDatabase, action: ActionFor<'board.sequenceMode.set'>): DenimActionResult {
  if (action.mode !== 'rank' && action.mode !== 'priority') throw new Error('Sequence mode must be rank or priority');
  requireNode(db, action.parentId);
  const board = requireBoard(db, action.boardId);
  putBoard(db, { ...board, sequenceModes: { ...board.sequenceModes, [action.parentId]: action.mode } });
  return { ok: true, changed: true, boardId: board.id };
}

function handleBoardNodeLoadSet(db: DenimDatabase, action: ActionFor<'board.node.load.set'>): DenimActionResult {
  if (typeof action.loaded !== 'boolean') throw new Error('Node loaded state must be true or false');
  const board = requireBoard(db, action.boardId); requireNode(db, action.nodeId);
  const wasLoaded = board.loadedNodeIds.includes(action.nodeId);
  if (wasLoaded === action.loaded) return { ok: true, changed: false, boardId: board.id };
  const loaded = new Set(board.loadedNodeIds);
  if (action.loaded) loaded.add(action.nodeId); else loaded.delete(action.nodeId);
  putBoard(db, { ...board, loadedNodeIds: [...loaded] });
  return { ok: true, changed: true, boardId: board.id };
}

function handleBoardNodeMove(db: DenimDatabase, action: ActionFor<'board.node.move'>): DenimActionResult {
  const board = requireBoard(db, action.boardId); requireNode(db, action.nodeId);
  if (![action.position?.x, action.position?.y].every(Number.isFinite)) throw new Error('Node position must contain finite x and y values');
  putBoard(db, { ...board, positions: { ...board.positions, [action.nodeId]: action.position } });
  return { ok: true, changed: true, boardId: board.id };
}

function handleBoardNodesMove(db: DenimDatabase, action: ActionFor<'board.nodes.move'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  if (!action.positions || typeof action.positions !== 'object' || Array.isArray(action.positions)) throw new Error('Node positions must be an object');
  const graphNodeIds = new Set(listDenimNodeIds(db));
  for (const [id, position] of Object.entries(action.positions)) {
    if (!graphNodeIds.has(id)) throw new Error(`Node not found: ${id}`);
    if (![position?.x, position?.y].every(Number.isFinite)) throw new Error('Node position must contain finite x and y values');
  }
  putBoard(db, { ...board, positions: { ...board.positions, ...action.positions } });
  return { ok: true, changed: true, boardId: board.id };
}

function handleBoardOpenJourney(db: DenimDatabase, action: ActionFor<'board.openJourney'>): DenimActionResult {
  const journey = requireNode(db, action.journeyId);
  if (journey.type !== 'Journey') throw new Error(`Node is not a Journey: ${action.journeyId}`);
  const boardId = action.boardId ?? newId('journey-board');
  if (readDenimBoards(db).some((board) => board.id === boardId)) throw new Error(`Board already exists: ${boardId}`);
  const sources = [{ kind: 'journey' as const, journeyId: journey.id }];
  putBoard(db, { version: 1, id: boardId, kind: 'board', title: journey.text,
    sources, loadedNodeIds: sourceGraph(db, { sources }).nodes.map((node) => node.id), positions: {}, sequenceModes: {}, containers: {} });
  return { ok: true, changed: true, boardId };
}

function handleBoardClose(db: DenimDatabase, action: ActionFor<'board.close'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  if (board.kind === 'pinned') throw new Error('Pinned Boards cannot be closed');
  removeDenimBoard(db, board.id);
  return { ok: true, changed: true, boardId: board.id };
}

/** Apply one Denim domain action to an open database. */
export function applyDenimAction(db: DenimDatabase, action: DenimAction): DenimActionResult {
  if (!action || typeof action !== 'object' || typeof action.op !== 'string') throw new Error('Invalid Denim action');
  switch (action.op) {
    case 'journey.create': return handleJourneyCreate(db, action);
    case 'node.create': return handleNodeCreate(db, action);
    case 'node.differentiate': return handleNodeDifferentiate(db, action);
    case 'edge.connect': return handleEdgeConnect(db, action);
    case 'edge.delete': return handleEdgeDelete(db, action);
    case 'container.attach': return handleContainerAttach(db, action);
    case 'container.detach': return handleContainerDetach(db, action);
    case 'node.update': return handleNodeUpdate(db, action);
    case 'node.delete': return handleNodeDelete(db, action);
    case 'edge.priority.set': return handleEdgePrioritySet(db, action);
    case 'sequence.initialize': return handleSequenceInitialize(db, action);
    case 'sequence.clear': return handleSequenceClear(db, action);
    case 'board.read': return handleBoardRead(db, action);
    case 'board.container.spawn': return handleBoardContainerSpawn(db, action);
    case 'board.container.move': return handleBoardContainerMove(db, action);
    case 'board.container.resize': return handleBoardContainerResize(db, action);
    case 'container.node.create': return handleContainerNodeCreate(db, action);
    case 'container.nodes.create': return handleContainerNodesCreate(db, action);
    case 'board.sequenceMode.set': return handleBoardSequenceModeSet(db, action);
    case 'board.node.load.set': return handleBoardNodeLoadSet(db, action);
    case 'board.node.move': return handleBoardNodeMove(db, action);
    case 'board.nodes.move': return handleBoardNodesMove(db, action);
    case 'board.openJourney': return handleBoardOpenJourney(db, action);
    case 'board.close': return handleBoardClose(db, action);
    default: throw new Error(`Unknown Denim action: ${(action as { op: string }).op}`);
  }
}

/** Read the graph and its persistent Boards so agents can understand a database. */
export function readDenimSnapshot(db: DenimDatabase) {
  return { graph: getDenimGraph(db), boards: readDenimBoards(db) };
}
