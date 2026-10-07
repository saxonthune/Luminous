import { getDenimGraph, type DenimDatabase, type DenimNode } from './database.ts';
import { readDenimBoards, type DenimBoard } from './board.ts';

export interface DenimNodeVisibilityEntry {
  node: DenimNode;
  /** True when the Node is loaded onto the Board. */
  loaded: boolean;
}

export type DenimQuery =
  | { op: 'board.nodes.list'; boardId: string }
  | { op: 'node.downstream.list'; boardId: string; nodeId: string }
  | { op: 'node.upstream.list'; boardId: string; nodeId: string }
  | { op: 'container.members.list'; boardId: string; containerNodeId: string };

export const DENIM_QUERY_CATALOG = [
  { op: 'board.nodes.list', required: ['boardId'], purpose: 'List all Nodes and whether each is loaded onto a Board.' },
  { op: 'node.downstream.list', required: ['boardId', 'nodeId'], purpose: 'List direct downstream Nodes and whether each is loaded onto a Board.' },
  { op: 'node.upstream.list', required: ['boardId', 'nodeId'], purpose: 'List direct upstream Nodes and whether each is loaded onto a Board.' },
  { op: 'container.members.list', required: ['boardId', 'containerNodeId'], purpose: 'List Nodes directly linked to a Container by contains Edges and whether each is loaded onto a Board.' },
] as const;

function requireBoard(db: DenimDatabase, boardId: string): DenimBoard {
  const board = readDenimBoards(db).find((item) => item.id === boardId);
  if (!board) throw new Error(`Board not found: ${boardId}`);
  return board;
}

function nodeEntries(db: DenimDatabase, board: DenimBoard, nodeIds: Iterable<string>): DenimNodeVisibilityEntry[] {
  const allNodes = new Map(getDenimGraph(db).nodes.map((node) => [node.id, node]));
  const loaded = new Set(board.loadedNodeIds);
  const result: DenimNodeVisibilityEntry[] = [];
  for (const id of nodeIds) {
    const node = allNodes.get(id);
    if (node) result.push({ node, loaded: loaded.has(id) });
  }
  return result;
}

/** Read Nodes for the shared Board loader, without mutating graph data. */
export function queryDenim(db: DenimDatabase, query: DenimQuery): DenimNodeVisibilityEntry[] {
  const board = requireBoard(db, query.boardId);
  const graph = getDenimGraph(db);
  if (query.op === 'board.nodes.list') return nodeEntries(db, board, graph.nodes.map((node) => node.id));
  if (query.op === 'node.downstream.list') {
    if (!graph.nodes.some((node) => node.id === query.nodeId)) throw new Error(`Node not found: ${query.nodeId}`);
    return nodeEntries(db, board, graph.edges.filter((edge) => edge.type === 'parent-child' && edge.sourceId === query.nodeId)
      .map((edge) => edge.targetId));
  }
  if (query.op === 'node.upstream.list') {
    if (!graph.nodes.some((node) => node.id === query.nodeId)) throw new Error(`Node not found: ${query.nodeId}`);
    return nodeEntries(db, board, graph.edges.filter((edge) => edge.type === 'parent-child' && edge.targetId === query.nodeId)
      .map((edge) => edge.sourceId));
  }
  if (!board.containers[query.containerNodeId]) throw new Error(`Container not found on Board: ${query.containerNodeId}`);
  return nodeEntries(db, board, graph.edges.filter((edge) => edge.type === 'contains' && edge.sourceId === query.containerNodeId)
    .map((edge) => edge.targetId));
}
