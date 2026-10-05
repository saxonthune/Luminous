import { getDenimGraph, type DenimDatabase, type DenimNode } from './database.ts';
import { getDenimBoardGraph, readDenimBoards, type DenimBoard } from './actions.ts';

export interface DenimNodeVisibilityEntry {
  node: DenimNode;
  /** True when the Node is part of the Board's query or explicit inclusion. */
  onBoard: boolean;
  /** True when the Node is currently visible in the Board's projection. */
  visible: boolean;
}

export type DenimQuery =
  | { op: 'board.nodes.list'; boardId: string }
  | { op: 'node.downstream.list'; boardId: string; nodeId: string }
  | { op: 'container.members.list'; boardId: string; containerNodeId: string };

export const DENIM_QUERY_CATALOG = [
  { op: 'board.nodes.list', required: ['boardId'], purpose: 'List all Nodes and whether each is on or visible on a Board.' },
  { op: 'node.downstream.list', required: ['boardId', 'nodeId'], purpose: 'List direct downstream Nodes and their Board visibility.' },
  { op: 'container.members.list', required: ['boardId', 'containerNodeId'], purpose: 'List Nodes directly linked to a Container by contains Edges and their Board visibility.' },
] as const;

function requireBoard(db: DenimDatabase, boardId: string): DenimBoard {
  const board = readDenimBoards(db).find((item) => item.id === boardId);
  if (!board) throw new Error(`Board not found: ${boardId}`);
  return board;
}

function nodeEntries(db: DenimDatabase, board: DenimBoard, nodeIds: Iterable<string>): DenimNodeVisibilityEntry[] {
  const allNodes = new Map(getDenimGraph(db).nodes.map((node) => [node.id, node]));
  const onBoard = new Set(getDenimBoardGraph(db, board, { includeHidden: true }).nodes.map((node) => node.id));
  const visible = new Set(getDenimBoardGraph(db, board).nodes.map((node) => node.id));
  const result: DenimNodeVisibilityEntry[] = [];
  for (const id of nodeIds) {
    const node = allNodes.get(id);
    if (node) result.push({ node, onBoard: onBoard.has(id), visible: visible.has(id) });
  }
  return result;
}

/** Read Nodes for the shared visibility manager, without mutating graph data. */
export function queryDenim(db: DenimDatabase, query: DenimQuery): DenimNodeVisibilityEntry[] {
  const board = requireBoard(db, query.boardId);
  const graph = getDenimGraph(db);
  if (query.op === 'board.nodes.list') return nodeEntries(db, board, graph.nodes.map((node) => node.id));
  if (query.op === 'node.downstream.list') {
    if (!graph.nodes.some((node) => node.id === query.nodeId)) throw new Error(`Node not found: ${query.nodeId}`);
    return nodeEntries(db, board, graph.edges.filter((edge) => edge.type === 'parent-child' && edge.sourceId === query.nodeId)
      .map((edge) => edge.targetId));
  }
  if (!board.containers[query.containerNodeId]) throw new Error(`Container not found on Board: ${query.containerNodeId}`);
  return nodeEntries(db, board, graph.edges.filter((edge) => edge.type === 'contains' && edge.sourceId === query.containerNodeId)
    .map((edge) => edge.targetId));
}
