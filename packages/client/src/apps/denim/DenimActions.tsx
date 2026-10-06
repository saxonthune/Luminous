import { createContext, useContext, type ParentProps } from 'solid-js';
import type { DenimAction } from '@luminous/core/denim/actions';
import type { DenimSession } from './DenimSession';
import type { DenimBoard, DenimBoardContainer } from '@luminous/core/denim/actions';
import type { DenimGraph } from '@luminous/core/denim';
import type { DenimQuery, DenimNodeVisibilityEntry } from '@luminous/core/denim/queries';

export interface DenimActionApi {
  dispatch(action: DenimAction): Promise<{ ok: boolean; error?: string; nodeId?: string; nodeIds?: string[]; boardId?: string; board?: DenimBoard; graph?: DenimGraph; changed?: boolean }>;
  readBoard(boardId: string): Promise<{ ok: boolean; error?: string; board?: DenimBoard; graph?: DenimGraph }>;
  queryNodes(query: DenimQuery): Promise<DenimNodeVisibilityEntry[]>;
  createJourney(text?: string): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  createNode(type: string, text: string, placement?: { boardId: string; x: number; y: number }, id?: string): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  differentiate(parentId: string, text?: string, placement?: { boardId: string; x: number; y: number }): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  connectExisting(parentId: string, childId: string): Promise<{ ok: boolean; error?: string }>;
  deleteEdge(edgeId: string): Promise<{ ok: boolean; error?: string }>;
  attachContainerNode(containerNodeId: string, nodeId: string, position: { x: number; y: number }, boardId?: string): Promise<{ ok: boolean; error?: string }>;
  detachContainerNode(containerNodeId: string, nodeId: string): Promise<{ ok: boolean; error?: string }>;
  updateNode(id: string, patch: { type?: string; text?: string }): Promise<{ ok: boolean; error?: string }>;
  deleteNode(id: string, scope: 'node' | 'subtree'): Promise<{ ok: boolean; error?: string }>;
  setEdgePriority(edgeId: string, priority: number): Promise<{ ok: boolean; error?: string }>;
  initializeSequence(parentId: string, orderedChildIds: string[]): Promise<{ ok: boolean; error?: string }>;
  clearSequence(parentId: string): Promise<{ ok: boolean; error?: string }>;
  setSequenceMode(parentId: string, mode: 'rank' | 'priority', boardId?: string): Promise<{ ok: boolean; error?: string }>;
  setNodeLoaded(nodeId: string, loaded: boolean, boardId?: string): Promise<{ ok: boolean; error?: string }>;
  moveNode(nodeId: string, position: { x: number; y: number }, boardId?: string): Promise<{ ok: boolean; error?: string }>;
  moveNodes(positions: Record<string, { x: number; y: number }>, boardId?: string): Promise<{ ok: boolean; error?: string }>;
  spawnContainer(headNodeId: string, container: DenimBoardContainer, boardId?: string): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  moveContainer(headNodeId: string, position: { x: number; y: number }, boardId?: string, carriedPositions?: Record<string, { x: number; y: number }>, carriedContainers?: Record<string, { x: number; y: number }>): Promise<{ ok: boolean; error?: string }>;
  resizeContainer(headNodeId: string, size: { width: number; height: number }, boardId?: string): Promise<{ ok: boolean; error?: string }>;
  createContainerNode(headNodeId: string, boardId?: string): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  createContainerNodes(headNodeId: string, nodes: Array<{ id: string; type: string; text: string; position: { x: number; y: number }; edgeId?: string }>, boardId?: string): Promise<{ ok: boolean; error?: string; nodeIds?: string[] }>;
  openJourney(journeyId: string): Promise<{ ok: boolean; error?: string; boardId?: string }>;
  closeBoard(boardId: string): Promise<{ ok: boolean; error?: string }>;
}

export function createDenimActionApi(session: DenimSession): DenimActionApi {
  const dispatch = (action: DenimAction) => session.dispatchAction(action);
  return {
    dispatch,
    readBoard: (boardId) => dispatch({ op: 'board.read', boardId }),
    queryNodes: (query) => session.queryNodes(query),
    createJourney: (text) => dispatch({ op: 'journey.create', text }),
    createNode: (type, text, placement, id) => dispatch({ op: 'node.create', type, text, placement, id }),
    differentiate: (parentId, text, placement) => dispatch({ op: 'node.differentiate', parentId, text, placement }),
    connectExisting: (parentId, childId) => dispatch({ op: 'edge.connect', parentId, childId }),
    deleteEdge: (edgeId) => dispatch({ op: 'edge.delete', edgeId }),
    attachContainerNode: (containerNodeId, nodeId, position, boardId = session.state.activeBoardId) =>
      dispatch({ op: 'container.attach', boardId, containerNodeId, nodeId, position }),
    detachContainerNode: (containerNodeId, nodeId) => dispatch({ op: 'container.detach', containerNodeId, nodeId }),
    updateNode: (id, patch) => dispatch({ op: 'node.update', id, patch }),
    deleteNode: (id, scope) => dispatch({ op: 'node.delete', id, scope }),
    setEdgePriority: (edgeId, priority) => dispatch({ op: 'edge.priority.set', edgeId, priority }),
    initializeSequence: (parentId, orderedChildIds) => dispatch({ op: 'sequence.initialize', parentId, orderedChildIds }),
    clearSequence: (parentId) => dispatch({ op: 'sequence.clear', parentId }),
    setSequenceMode: (parentId, mode, boardId = session.state.activeBoardId) => dispatch({ op: 'board.sequenceMode.set', boardId, parentId, mode }),
    setNodeLoaded: (nodeId, loaded, boardId = session.state.activeBoardId) => dispatch({ op: 'board.node.load.set', boardId, nodeId, loaded }),
    moveNode: (nodeId, position, boardId = session.state.activeBoardId) => dispatch({ op: 'board.node.move', boardId, nodeId, position }),
    moveNodes: (positions, boardId = session.state.activeBoardId) => dispatch({ op: 'board.nodes.move', boardId, positions }),
    spawnContainer: (headNodeId, container, boardId = session.state.activeBoardId) =>
      dispatch({ op: 'board.container.spawn', boardId, headNodeId, container }),
    moveContainer: (headNodeId, position, boardId = session.state.activeBoardId, carriedPositions, carriedContainers) =>
      dispatch({ op: 'board.container.move', boardId, headNodeId, position, carriedPositions, carriedContainers }),
    resizeContainer: (headNodeId, size, boardId = session.state.activeBoardId) =>
      dispatch({ op: 'board.container.resize', boardId, headNodeId, size }),
    createContainerNode: (headNodeId, boardId = session.state.activeBoardId) =>
      dispatch({ op: 'container.node.create', boardId, headNodeId }),
    createContainerNodes: (headNodeId, nodes, boardId = session.state.activeBoardId) =>
      dispatch({ op: 'container.nodes.create', boardId, headNodeId, nodes }),
    openJourney: (journeyId) => dispatch({ op: 'board.openJourney', journeyId }),
    closeBoard: (boardId) => dispatch({ op: 'board.close', boardId }),
  };
}

const DenimActionsContext = createContext<DenimActionApi>();

export function DenimActionsProvider(props: ParentProps<{ session: DenimSession }>) {
  const actions = createDenimActionApi(props.session);
  return <DenimActionsContext.Provider value={actions}>{props.children}</DenimActionsContext.Provider>;
}

export function useDenimActions(): DenimActionApi {
  const actions = useContext(DenimActionsContext);
  if (!actions) throw new Error('Denim action API is unavailable outside DenimActionsProvider');
  return actions;
}
