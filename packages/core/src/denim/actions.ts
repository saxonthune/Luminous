import { orderedTreeLayout } from '@luminous/cactus/layout';
import { sequenceDescendantEntries, type SequenceListEntry } from './sequence.ts';
import {
  addDenimNode,
  addDenimEdge,
  clearDenimSequence,
  connectDenimChild,
  createDenimSequenceContainer,
  createDenimNodeType,
  createDenimChild,
  createDenimChildAfter,
  createDenimContainedNode,
  createDenimContainerIfMissing,
  deleteDenimNode,
  deleteDenimNodeAndChildren,
  deleteDenimEdge,
  getDenimEdge,
  getDenimContainment,
  getDenimGraph,
  getDenimNode,
  getDenimSequenceContainerByOwner,
  hasDenimEdge,
  initializeDenimSequence,
  insertDenimSequenceChild,
  listDenimDescendantIds,
  listDenimContainers,
  listDenimNodeIds,
  moveDenimChild,
  removeDenimBoard,
  renameDenimNodeType,
  setDenimNodeTypeColor,
  replaceDenimContainment,
  runDenimTransaction,
  updateDenimEdgePriority,
  updateDenimNode,
  upsertDenimEdge,
  upsertDenimNode,
  type DenimDatabase,
  type DenimNode,
} from './database.ts';
import {
  DENIM_DEFAULT_NODE_SIZE,
  getDenimBoardGraph,
  ensureLoadedContainerPlacements,
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
  | { op: 'sequenceContainer.read'; ownerNodeId: string }
  | { op: 'sequenceContainer.layout'; ownerNodeId: string; boardId: string }
  | { op: 'sequence.node.indent'; ownerNodeId: string; nodeId: string; fromParentId?: string }
  | { op: 'sequence.node.outdent'; ownerNodeId: string; nodeId: string; fromParentId?: string }
  | { op: 'sequence.node.insert'; ownerNodeId: string; boardId: string; parentId?: string; beforeNodeId?: string; afterNodeId?: string; text: string; type?: string; relativePlacement?: 'below' | 'right'; id?: string }

  | { op: 'journey.create'; id?: string; text?: string }
  | { op: 'node.type.color.set'; typeId: string; themeSlot: number }
  | { op: 'node.type.create'; name: string }
  | { op: 'node.type.rename'; typeId: string; name: string }
  | { op: 'node.create'; id?: string; type: string; text: string; placement?: { boardId: string; x: number; y: number } }
  | { op: 'node.upsert'; id?: string; uniqueKey: string; type: string; text: string }
  | { op: 'edge.upsert'; id?: string; uniqueKey: string; type: string; sourceId: string; targetId: string; priority?: number | null }
  | { op: 'node.differentiate'; parentId: string; id?: string; edgeId?: string; text?: string; placement?: { boardId: string; x: number; y: number } }
  | { op: 'edge.connect'; parentId: string; childId: string; edgeId?: string }
  | { op: 'edge.delete'; edgeId: string }
  | { op: 'container.attach'; boardId: string; containerNodeId: string; nodeId: string; position: { x: number; y: number } }
  | { op: 'container.detach'; containerNodeId: string; nodeId: string }
  | { op: 'container.create'; boardId: string; ownerNodeId: string; container: DenimBoardContainer; id?: string }
  | { op: 'node.update'; id: string; patch: Partial<Pick<DenimNode, 'type' | 'text' | 'uniqueKey'>> }
  | { op: 'node.delete'; id: string; scope: 'node' | 'subtree' }
  | { op: 'edge.priority.set'; edgeId: string; priority: number }
  | { op: 'sequence.initialize'; parentId: string; orderedChildIds: string[] }
  | { op: 'sequence.clear'; parentId: string }
  | { op: 'sequence.node.move'; ownerNodeId?: string; nodeId: string; fromParentId: string; parentId: string; beforeNodeId?: string; afterNodeId?: string }
  | { op: 'sequence.node.insertAfter'; boardId: string; sequenceOwnerId: string; parentId: string; afterNodeId: string; position: { x: number; y: number }; id?: string; edgeId?: string }
  | { op: 'sequenceContainer.create'; boardId: string; ownerNodeId: string; container: DenimBoardContainer; id?: string }
  | { op: 'sequenceContainer.presentation.set'; boardId: string; ownerNodeId: string; presentation: 'special' | 'graph' }
  | { op: 'board.read'; boardId: string }
  | { op: 'board.create'; id?: string; title?: string }
  | { op: 'board.container.move'; boardId: string; headNodeId: string; position: { x: number; y: number }; carriedPositions?: Record<string, { x: number; y: number }>; carriedContainers?: Record<string, { x: number; y: number }> }
  | { op: 'board.container.resize'; boardId: string; headNodeId: string; size: { width: number; height: number } }
  | { op: 'container.node.create'; boardId: string; headNodeId: string; id?: string; edgeId?: string }
  | { op: 'container.nodes.create'; boardId: string; headNodeId: string; nodes: Array<{ id: string; type: string; text: string; position: { x: number; y: number }; edgeId?: string; uniqueKey?: string | null }> }
  | { op: 'board.sequenceMode.set'; boardId: string; parentId: string; mode: 'rank' | 'priority' }
  | { op: 'board.node.load.set'; boardId: string; nodeId: string; loaded: boolean }
  | { op: 'board.node.move'; boardId: string; nodeId: string; position: { x: number; y: number } }
  | { op: 'board.nodes.move'; boardId: string; positions: Record<string, { x: number; y: number }> }
  | { op: 'board.openJourney'; journeyId: string; boardId?: string }
  | { op: 'board.close'; boardId: string };

export const DENIM_ACTION_CATALOG = [
  { op: 'journey.create', required: [], optional: ['id', 'text'], purpose: 'Create a Journey Node.' },
  { op: 'sequenceContainer.read', required: ['ownerNodeId'], optional: [], purpose: 'Read a shared Sequence Container as ordered entries with depth and labels.' },
  { op: 'sequenceContainer.layout', required: ['ownerNodeId', 'boardId'], optional: [], purpose: 'Load and arrange sequence Nodes in ordered depth rows on a Board.' },
  { op: 'sequence.node.indent', required: ['ownerNodeId', 'nodeId'], optional: ['fromParentId'], purpose: 'Move an entry under its previous sibling.' },
  { op: 'sequence.node.outdent', required: ['ownerNodeId', 'nodeId'], optional: ['fromParentId'], purpose: 'Move an entry after its parent at the next outer depth.' },
  { op: 'sequence.node.insert', required: ['ownerNodeId', 'boardId', 'text'], optional: ['parentId', 'beforeNodeId', 'afterNodeId', 'type', 'relativePlacement', 'id'], purpose: 'Insert an ordered Node, placing it below or right of its anchor.' },
  { op: 'node.type.color.set', required: ['typeId', 'themeSlot'], optional: [], purpose: 'Set the shared theme color for a Node type.' },
  { op: 'node.type.create', required: ['name'], optional: [], purpose: 'Create a Node type.' },
  { op: 'node.type.rename', required: ['typeId', 'name'], optional: [], purpose: 'Rename a Node type and its Nodes.' },
  { op: 'node.create', required: ['type', 'text'], optional: ['id', 'placement'], purpose: 'Create an unconnected Node, optionally placing and including it on a Board.' },
  { op: 'node.upsert', required: ['uniqueKey', 'type', 'text'], optional: ['id'], purpose: 'Create or update a Node by its stable unique key, preserving its database ID.' },
  { op: 'edge.upsert', required: ['uniqueKey', 'type', 'sourceId', 'targetId'], optional: ['id', 'priority'], purpose: 'Create or update an Edge by its stable unique key, preserving its database ID.' },
  { op: 'node.differentiate', required: ['parentId'], optional: ['id', 'edgeId', 'text', 'placement'], purpose: 'Create a child Node with the same type as its parent and connect it to its parent; optionally place it on a Board.' },
  { op: 'edge.connect', required: ['parentId', 'childId'], optional: ['edgeId'], purpose: 'Connect an existing Node as a child.' },
  { op: 'edge.delete', required: ['edgeId'], optional: [], purpose: 'Delete one edge while keeping its endpoint Nodes.' },
  { op: 'container.attach', required: ['boardId', 'containerNodeId', 'nodeId', 'position'], optional: [], purpose: 'Attach and position an existing Node in a Container, replacing its previous containment Edge.' },
  { op: 'container.detach', required: ['containerNodeId', 'nodeId'], optional: [], purpose: 'Remove a contains Edge while keeping the Node and its current Board presence.' },
  { op: 'container.create', required: ['boardId', 'ownerNodeId', 'container'], optional: ['id'], purpose: 'Create a shared regular Container for an owner Node and place it on this Board.' },
  { op: 'node.update', required: ['id', 'patch'], optional: [], purpose: 'Change a Node type or text.' },
  { op: 'node.delete', required: ['id', 'scope'], optional: [], purpose: 'Delete one Node or its full descendant subtree; scope is node or subtree.' },
  { op: 'edge.priority.set', required: ['edgeId', 'priority'], optional: [], purpose: 'Set an edge sequence priority.' },
  { op: 'sequence.initialize', required: ['parentId', 'orderedChildIds'], optional: [], purpose: 'Assign priorities in the supplied child order.' },
  { op: 'sequence.clear', required: ['parentId'], optional: [], purpose: 'Clear priorities on all child edges.' },
  { op: 'sequence.node.move', required: ['nodeId', 'fromParentId', 'parentId'], optional: ['ownerNodeId', 'beforeNodeId', 'afterNodeId'], purpose: 'Move one parent-child Edge to a new parent and set its sibling position.' },
  { op: 'sequence.node.insertAfter', required: ['boardId', 'sequenceOwnerId', 'parentId', 'afterNodeId', 'position'], optional: ['id', 'edgeId'], purpose: 'Create a same-type sibling immediately after a Node in a Sequence Container.' },
  { op: 'sequenceContainer.create', required: ['boardId', 'ownerNodeId', 'container'], optional: ['id'], purpose: 'Create a shared Sequence Container if needed and load it onto a Board.' },
  { op: 'sequenceContainer.presentation.set', required: ['boardId', 'ownerNodeId', 'presentation'], optional: [], purpose: 'Set the Sequence Container presentation on one Board.' },
  { op: 'board.read', required: ['boardId'], optional: [], purpose: 'Read a Board and its query projection.' },
  { op: 'board.create', required: [], optional: ['id', 'title'], purpose: 'Create a new persistent Board with no query sources.' },
  { op: 'board.container.move', required: ['boardId', 'headNodeId', 'position'], optional: ['carriedPositions', 'carriedContainers'], purpose: 'Move a Board container, its visually contained Nodes, and their nested Containers.' },
  { op: 'board.container.resize', required: ['boardId', 'headNodeId', 'size'], optional: [], purpose: 'Resize a Board container.' },
  { op: 'container.node.create', required: ['boardId', 'headNodeId'], optional: ['id', 'edgeId'], purpose: 'Create a Node inside a Container, using the container owner Node type.' },
  { op: 'container.nodes.create', required: ['boardId', 'headNodeId', 'nodes'], optional: [], purpose: 'Create a set of typed Nodes with labels and positions inside one Container.' },
  { op: 'board.sequenceMode.set', required: ['boardId', 'parentId', 'mode'], optional: [], purpose: 'Set a parent label mode on a Board to rank or priority.' },
  { op: 'board.node.load.set', required: ['boardId', 'nodeId', 'loaded'], optional: [], purpose: 'Load or unload a Node on a Board; loading an owner also places its regular Container on that Board when one exists.' },
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
  edgeId?: string;
  boardId?: string;
  board?: DenimBoard;
  graph?: ReturnType<typeof getDenimBoardGraph>;
  sequenceContainerId?: string;
  owner?: DenimNode;
  entries?: SequenceListEntry[];
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

function handleNodeTypeColorSet(db: DenimDatabase, action: ActionFor<'node.type.color.set'>): DenimActionResult {
  if (typeof action.typeId !== 'string' || !action.typeId) throw new Error('Node type ID must be nonempty text');
  return { ok: true, changed: setDenimNodeTypeColor(db, action.typeId, action.themeSlot) };
}

function handleNodeTypeCreate(db: DenimDatabase, action: ActionFor<'node.type.create'>): DenimActionResult {
  if (typeof action.name !== 'string') throw new Error('Node type name must be text');
  const result = createDenimNodeType(db, action.name);
  return { ok: true, changed: result.changed };
}

function handleNodeTypeRename(db: DenimDatabase, action: ActionFor<'node.type.rename'>): DenimActionResult {
  if (typeof action.typeId !== 'string' || !action.typeId) throw new Error('Node type ID must be nonempty text');
  if (typeof action.name !== 'string') throw new Error('Node type name must be text');
  const result = renameDenimNodeType(db, action.typeId, action.name);
  return { ok: true, changed: result.changed };
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

function handleNodeUpsert(db: DenimDatabase, action: ActionFor<'node.upsert'>): DenimActionResult {
  if (typeof action.uniqueKey !== 'string' || !action.uniqueKey.trim()) throw new Error('Node unique key must be nonempty text');
  if (typeof action.type !== 'string' || !action.type.trim()) throw new Error('Node type must be nonempty text');
  if (typeof action.text !== 'string') throw new Error('Node text must be text');
  if (action.id !== undefined && (typeof action.id !== 'string' || !action.id)) throw new Error('Node ID must be nonempty text');
  const result = upsertDenimNode(db, { id: action.id, uniqueKey: action.uniqueKey, type: action.type.trim(), text: action.text });
  return { ok: true, changed: result.changed, nodeId: result.id };
}

function handleEdgeUpsert(db: DenimDatabase, action: ActionFor<'edge.upsert'>): DenimActionResult {
  if (typeof action.uniqueKey !== 'string' || !action.uniqueKey.trim()) throw new Error('Edge unique key must be nonempty text');
  if (typeof action.type !== 'string' || !action.type.trim()) throw new Error('Edge type must be nonempty text');
  if (action.type === 'contains') throw new Error('Use container.attach to create or move a contains Edge');
  requireNode(db, action.sourceId); requireNode(db, action.targetId);
  if (action.id !== undefined && (typeof action.id !== 'string' || !action.id)) throw new Error('Edge ID must be nonempty text');
  if (action.priority !== undefined && action.priority !== null && !Number.isFinite(action.priority)) throw new Error('Edge priority must be finite');
  const result = upsertDenimEdge(db, { ...action, type: action.type.trim() });
  return { ok: true, changed: result.changed, edgeId: result.id };
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
  if (action.patch.type === undefined && action.patch.text === undefined && action.patch.uniqueKey === undefined) throw new Error('Node update requires a field');
  if (action.patch.type !== undefined && typeof action.patch.type !== 'string') throw new Error('Node type must be text');
  if (action.patch.text !== undefined && typeof action.patch.text !== 'string') throw new Error('Node text must be text');
  if (action.patch.uniqueKey !== undefined && action.patch.uniqueKey !== null
    && (typeof action.patch.uniqueKey !== 'string' || !action.patch.uniqueKey.trim())) throw new Error('Node unique key must be nonempty text or null');
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

function readSequence(db: DenimDatabase, ownerNodeId: string) {
  const owner = requireNode(db, ownerNodeId);
  const primitive = getDenimSequenceContainerByOwner(db, ownerNodeId);
  if (!primitive) throw new Error(`Sequence Container not found for owner: ${ownerNodeId}`);
  const entries = sequenceDescendantEntries(getDenimGraph(db), ownerNodeId);
  return { owner, primitive, entries };
}

function handleSequenceRead(db: DenimDatabase, action: ActionFor<'sequenceContainer.read'>): DenimActionResult {
  const { owner, primitive, entries } = readSequence(db, action.ownerNodeId);
  return { ok: true, changed: false, owner, entries, sequenceContainerId: primitive.id };
}

function handleSequenceIndent(db: DenimDatabase, action: ActionFor<'sequence.node.indent'> | ActionFor<'sequence.node.outdent'>): DenimActionResult {
  const { entries } = readSequence(db, action.ownerNodeId);
  const entry = entries.find(item => item.node.id === action.nodeId && (!action.fromParentId || item.parentId === action.fromParentId));
  if (!entry) throw new Error('Sequence entry not found');
  if (action.op === 'sequence.node.indent') {
    const siblings = entries.filter(item => item.parentId === entry.parentId);
    const previous = siblings[siblings.indexOf(entry) - 1];
    if (!previous) return { ok: true, changed: false };
    return { ok: true, changed: moveDenimChild(db, entry.node.id, entry.parentId, previous.node.id), nodeId: entry.node.id };
  }
  if (entry.parentId === action.ownerNodeId) return { ok: true, changed: false };
  const parent = entries.find(item => item.node.id === entry.parentId)!;
  return { ok: true, changed: moveDenimChild(db, entry.node.id, entry.parentId, parent.parentId, { afterNodeId: parent.node.id }), nodeId: entry.node.id };
}

function handleSequenceLayout(db: DenimDatabase, action: ActionFor<'sequenceContainer.layout'>): DenimActionResult {
  const { entries } = readSequence(db, action.ownerNodeId);
  const board = requireBoard(db, action.boardId);
  const container = board.containers[action.ownerNodeId];
  if (!container?.sequenceContainerId) throw new Error('Load the Sequence Container onto this Board first');
  const relative = orderedTreeLayout(entries.map(entry => ({ id: entry.node.id,
    parentId: entry.parentId === action.ownerNodeId ? null : entry.parentId })), DENIM_DEFAULT_NODE_SIZE);
  const positions = { ...board.positions };
  let width = Math.max(220, container.width), height = Math.max(140, container.height);
  for (const [id, point] of relative) {
    positions[id] = { x: container.x + 16 + point.x, y: container.y + 60 + point.y };
    width = Math.max(width, point.x + DENIM_DEFAULT_NODE_SIZE.width + 32);
    height = Math.max(height, point.y + DENIM_DEFAULT_NODE_SIZE.height + 76);
  }
  putBoard(db, { ...board, positions,
    loadedNodeIds: [...new Set([...board.loadedNodeIds, action.ownerNodeId, ...relative.keys()])],
    containers: { ...board.containers, [action.ownerNodeId]: { ...container, width, height } } });
  return { ok: true, changed: true, boardId: board.id, nodeIds: [...relative.keys()] };
}

function handleSequenceInsert(db: DenimDatabase, action: ActionFor<'sequence.node.insert'>): DenimActionResult {
  const { owner, entries } = readSequence(db, action.ownerNodeId);
  const board = requireBoard(db, action.boardId);
  const container = board.containers[action.ownerNodeId];
  if (!container?.sequenceContainerId) throw new Error('Load the Sequence Container onto this Board first');
  if (typeof action.text !== 'string') throw new Error('Node text must be text');
  if (action.beforeNodeId && action.afterNodeId) throw new Error('Choose before or after');
  if (action.relativePlacement !== undefined && !['below', 'right'].includes(action.relativePlacement)) throw new Error('Relative placement must be below or right');
  const anchorId = action.afterNodeId ?? action.beforeNodeId;
  const anchor = anchorId ? entries.find(entry => entry.node.id === anchorId) : undefined;
  if (anchorId && !anchor) throw new Error('Anchor is outside the sequence');
  const parentId = action.parentId ?? anchor?.parentId ?? owner.id;
  if (parentId !== owner.id && !entries.some(entry => entry.node.id === parentId)) throw new Error('Parent is outside the sequence');
  if (anchor && anchor.parentId !== parentId) throw new Error('Anchor is not a sibling under the requested parent');
  const type = action.type ?? anchor?.node.type ?? requireNode(db, parentId).type;
  if (typeof type !== 'string' || !type.trim()) throw new Error('Node type must be nonempty text');
  const nodeId = action.id ?? newId('node');
  if (getDenimNode(db, nodeId)) throw new Error(`Node already exists: ${nodeId}`);
  const siblings = entries.filter(entry => entry.parentId === parentId);
  const relativeTo = anchor?.node.id ?? siblings.at(-1)?.node.id ?? (parentId === owner.id ? undefined : parentId);
  const base = relativeTo ? board.positions[relativeTo] : undefined;
  const position = base ? {
    x: base.x + (action.relativePlacement === 'right' ? DENIM_DEFAULT_NODE_SIZE.width + 24 : 0),
    y: base.y + (action.relativePlacement === 'right' ? 0 : DENIM_DEFAULT_NODE_SIZE.height + 24),
  } : { x: container.x + 16, y: container.y + 60 };
    const order = siblings.map(entry => entry.node.id);
    const index = action.beforeNodeId ? order.indexOf(action.beforeNodeId)
      : action.afterNodeId ? order.indexOf(action.afterNodeId) + 1 : order.length;
    insertDenimSequenceChild(db, parentId, { id: nodeId, type, text: action.text }, newId('parent-child'), index);
    loadNodeOnSourceBoards(db, nodeId, parentId);
    const current = requireBoard(db, board.id);
    putBoard(db, { ...current, loadedNodeIds: [...new Set([...current.loadedNodeIds, nodeId])],
      positions: { ...current.positions, [nodeId]: position },
      containers: { ...current.containers, [owner.id]: { ...container,
        width: Math.max(container.width, position.x - container.x + DENIM_DEFAULT_NODE_SIZE.width + 16),
        height: Math.max(container.height, position.y - container.y + DENIM_DEFAULT_NODE_SIZE.height + 16) } } });
  return { ok: true, changed: true, nodeId, boardId: board.id };
}

function handleSequenceNodeMove(db: DenimDatabase, action: ActionFor<'sequence.node.move'>): DenimActionResult {
  if (action.ownerNodeId) {
    const { entries } = readSequence(db, action.ownerNodeId);
    if (!entries.some(entry => entry.node.id === action.nodeId && entry.parentId === action.fromParentId)
      || (action.parentId !== action.ownerNodeId && !entries.some(entry => entry.node.id === action.parentId))) {
      throw new Error('Move must stay within the requested sequence');
    }
  }
  requireNode(db, action.nodeId);
  requireNode(db, action.fromParentId);
  requireNode(db, action.parentId);
  if (action.beforeNodeId !== undefined && typeof action.beforeNodeId !== 'string') throw new Error('beforeNodeId must be text');
  if (action.afterNodeId !== undefined && typeof action.afterNodeId !== 'string') throw new Error('afterNodeId must be text');
  const changed = moveDenimChild(db, action.nodeId, action.fromParentId, action.parentId, {
    beforeNodeId: action.beforeNodeId,
    afterNodeId: action.afterNodeId,
  });
  return { ok: true, changed, nodeId: action.nodeId };
}

function handleSequenceNodeInsertAfter(db: DenimDatabase, action: ActionFor<'sequence.node.insertAfter'>): DenimActionResult {
  requireNode(db, action.sequenceOwnerId);
  requireNode(db, action.parentId);
  requireNode(db, action.afterNodeId);
  if (!action.position || ![action.position.x, action.position.y].every(Number.isFinite)) {
    throw new Error('Node position must contain finite x and y values');
  }
  const board = requireBoard(db, action.boardId);
  const sequence = getDenimSequenceContainerByOwner(db, action.sequenceOwnerId);
  if (!sequence || board.containers[action.sequenceOwnerId]?.sequenceContainerId !== sequence.id) {
    throw new Error(`Sequence Container is not loaded on Board: ${action.sequenceOwnerId}`);
  }
  if (!getDenimBoardGraph(db, board).nodes.some((node) => node.id === action.sequenceOwnerId)) {
    throw new Error(`Sequence Container owner Node is not on Board: ${action.sequenceOwnerId}`);
  }
  const descendants = new Set(listDenimDescendantIds(db, action.sequenceOwnerId));
  if (action.parentId !== action.sequenceOwnerId && !descendants.has(action.parentId)) {
    throw new Error(`Parent Node is outside the Sequence Container: ${action.parentId}`);
  }
  if (!descendants.has(action.afterNodeId)) throw new Error(`Node is outside the Sequence Container: ${action.afterNodeId}`);

  const nodeId = action.id ?? newId('node');
  const edgeId = action.edgeId ?? newId('parent-child');
  const node = createDenimChildAfter(db, action.parentId, action.afterNodeId, nodeId, edgeId);
  loadNodeOnSourceBoards(db, node.id, action.parentId);
  const currentBoard = requireBoard(db, board.id);
  putBoard(db, { ...currentBoard,
    loadedNodeIds: [...new Set([...currentBoard.loadedNodeIds, node.id])],
    positions: { ...currentBoard.positions, [node.id]: action.position },
  });
  return { ok: true, changed: true, nodeId: node.id, boardId: board.id };
}

function handleSequenceContainerCreate(db: DenimDatabase, action: ActionFor<'sequenceContainer.create'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  const owner = requireNode(db, action.ownerNodeId);
  if (!getDenimBoardGraph(db, board).nodes.some((node) => node.id === owner.id)) {
    throw new Error(`Sequence Container owner Node is not on Board: ${owner.id}`);
  }
  const existingPrimitive = getDenimSequenceContainerByOwner(db, owner.id);
  const currentPlacement = board.containers[owner.id];
  if (existingPrimitive && currentPlacement?.sequenceContainerId === existingPrimitive.id) {
    return { ok: true, changed: false, nodeId: owner.id, boardId: board.id, sequenceContainerId: existingPrimitive.id };
  }
  if (!currentPlacement && ![action.container?.x, action.container?.y, action.container?.width, action.container?.height].every(Number.isFinite)) {
    throw new Error('Sequence Container bounds must be finite');
  }
  const bounds = currentPlacement ?? action.container;
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('Sequence Container bounds must have finite position and positive size');
  }
  const primitive = existingPrimitive ?? createDenimSequenceContainer(db, {
    id: action.id ?? newId('sequence-container'), ownerNodeId: owner.id,
  });
  putBoard(db, { ...board, containers: { ...board.containers, [owner.id]: {
    ...bounds, sequenceContainerId: primitive.id,
    presentation: currentPlacement?.sequenceContainerId ? currentPlacement.presentation ?? 'special' : 'special',
  } } });
  return { ok: true, changed: true, nodeId: owner.id, boardId: board.id, sequenceContainerId: primitive.id };
}

function handleSequenceContainerPresentationSet(db: DenimDatabase, action: ActionFor<'sequenceContainer.presentation.set'>): DenimActionResult {
  if (action.presentation !== 'special' && action.presentation !== 'graph') throw new Error('Unknown Sequence Container presentation');
  const board = requireBoard(db, action.boardId);
  const placement = board.containers[action.ownerNodeId];
  const primitive = getDenimSequenceContainerByOwner(db, action.ownerNodeId);
  if (!placement || !primitive || placement.sequenceContainerId !== primitive.id) {
    throw new Error(`Sequence Container is not loaded on Board: ${action.ownerNodeId}`);
  }
  if ((placement.presentation ?? 'special') === action.presentation) {
    return { ok: true, changed: false, nodeId: action.ownerNodeId, boardId: board.id, sequenceContainerId: primitive.id };
  }
  putBoard(db, { ...board, containers: { ...board.containers, [action.ownerNodeId]: { ...placement, presentation: action.presentation } } });
  return { ok: true, changed: true, nodeId: action.ownerNodeId, boardId: board.id, sequenceContainerId: primitive.id };
}

function handleBoardRead(db: DenimDatabase, action: ActionFor<'board.read'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  return { ok: true, changed: false, boardId: board.id, board, graph: getDenimBoardGraph(db, board) };
}

function handleBoardCreate(db: DenimDatabase, action: ActionFor<'board.create'>): DenimActionResult {
  if (action.id !== undefined && (typeof action.id !== 'string' || !action.id.trim())) throw new Error('Board ID must be nonempty text');
  if (action.title !== undefined && typeof action.title !== 'string') throw new Error('Board title must be text');
  const id = action.id ?? newId('board');
  if (readDenimBoards(db).some((board) => board.id === id)) throw new Error(`Board already exists: ${id}`);
  const requestedTitle = action.title?.trim();
  let title = requestedTitle || 'New Board';
  if (!requestedTitle) {
    const existingTitles = new Set(readDenimBoards(db).map((board) => board.title));
    let suffix = 2;
    while (existingTitles.has(title)) title = `New Board ${suffix++}`;
  }
  putBoard(db, { version: 1, id, kind: 'board', title, sources: [], loadedNodeIds: [], positions: {}, sequenceModes: {}, containers: {} });
  return { ok: true, changed: true, boardId: id };
}

function handleContainerCreate(db: DenimDatabase, action: ActionFor<'container.create'>): DenimActionResult {
  const board = requireBoard(db, action.boardId);
  requireNode(db, action.ownerNodeId);
  if (!getDenimBoardGraph(db, board).nodes.some((node) => node.id === action.ownerNodeId)) {
    throw new Error(`Container owner Node is not on Board: ${action.ownerNodeId}`);
  }
  if (![action.container?.x, action.container?.y, action.container?.width, action.container?.height].every(Number.isFinite)
    || action.container.width <= 0 || action.container.height <= 0) {
    throw new Error('Container bounds must have finite position and positive size');
  }
  let created = false;
  const needsPlacement = !board.containers[action.ownerNodeId];
  runDenimTransaction(db, () => {
    created = createDenimContainerIfMissing(db, { id: action.id ?? newId('container'), ownerNodeId: action.ownerNodeId }).changed;
    if (needsPlacement) putBoard(db, { ...board, containers: { ...board.containers, [action.ownerNodeId]: action.container } });
  });
  return { ok: true, changed: created || needsPlacement, nodeId: action.ownerNodeId, boardId: board.id };
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
    if (item.uniqueKey !== undefined && item.uniqueKey !== null
      && (typeof item.uniqueKey !== 'string' || !item.uniqueKey.trim())) throw new Error(`Invalid unique key for Node: ${item.id}`);
    if (![item.position?.x, item.position?.y].every(Number.isFinite)) throw new Error(`Invalid position for Node: ${item.id}`);
    const edgeId = item.edgeId ?? `contains-${item.id}`;
    if (edgeIds.has(edgeId) || getDenimEdge(db, edgeId)) throw new Error(`Container batch has a duplicate Edge ID: ${edgeId}`);
    ids.add(item.id); edgeIds.add(edgeId);
    positions[item.id] = item.position;
  }
  runDenimTransaction(db, () => {
    for (const item of action.nodes) {
      addDenimNode(db, { id: item.id, type: item.type.trim(), text: item.text, uniqueKey: item.uniqueKey ?? null });
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
  const updated = ensureLoadedContainerPlacements(db, { ...board, loadedNodeIds: [...loaded] }, readDenimBoards(db));
  putBoard(db, updated);
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
    case 'node.type.color.set': return handleNodeTypeColorSet(db, action);
    case 'node.type.create': return handleNodeTypeCreate(db, action);
    case 'node.type.rename': return handleNodeTypeRename(db, action);
    case 'node.create': return handleNodeCreate(db, action);
    case 'node.upsert': return handleNodeUpsert(db, action);
    case 'edge.upsert': return handleEdgeUpsert(db, action);
    case 'node.differentiate': return handleNodeDifferentiate(db, action);
    case 'edge.connect': return handleEdgeConnect(db, action);
    case 'edge.delete': return handleEdgeDelete(db, action);
    case 'container.attach': return handleContainerAttach(db, action);
    case 'container.detach': return handleContainerDetach(db, action);
    case 'container.create': return handleContainerCreate(db, action);
    case 'node.update': return handleNodeUpdate(db, action);
    case 'node.delete': return handleNodeDelete(db, action);
    case 'edge.priority.set': return handleEdgePrioritySet(db, action);
    case 'sequence.initialize': return handleSequenceInitialize(db, action);
    case 'sequence.clear': return handleSequenceClear(db, action);
    case 'sequenceContainer.read': return handleSequenceRead(db, action);
    case 'sequenceContainer.layout': return handleSequenceLayout(db, action);
    case 'sequence.node.indent':
    case 'sequence.node.outdent': return handleSequenceIndent(db, action);
    case 'sequence.node.insert': return handleSequenceInsert(db, action);
    case 'sequence.node.move': return handleSequenceNodeMove(db, action);
    case 'sequence.node.insertAfter': return handleSequenceNodeInsertAfter(db, action);
    case 'sequenceContainer.create': return handleSequenceContainerCreate(db, action);
    case 'sequenceContainer.presentation.set': return handleSequenceContainerPresentationSet(db, action);
    case 'board.read': return handleBoardRead(db, action);
    case 'board.create': return handleBoardCreate(db, action);
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
  return { graph: getDenimGraph(db), boards: readDenimBoards(db), containers: listDenimContainers(db) };
}
