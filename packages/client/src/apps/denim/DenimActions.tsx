import { createContext, useContext, type ParentProps } from 'solid-js';
import type { DenimAction } from '@luminous/core/denim/actions';
import type { DenimSession } from './DenimSession';

export interface DenimActionApi {
  dispatch(action: DenimAction): Promise<{ ok: boolean; error?: string; nodeId?: string; boardId?: string }>;
  createJourney(text?: string): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  differentiate(parentId: string, text?: string, placement?: { boardId: string; x: number; y: number }): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  connectExisting(parentId: string, childId: string): Promise<{ ok: boolean; error?: string }>;
  deleteEdge(edgeId: string): Promise<{ ok: boolean; error?: string }>;
  updateNode(id: string, patch: { type?: string; text?: string }): Promise<{ ok: boolean; error?: string }>;
  deleteNode(id: string, scope: 'node' | 'subtree'): Promise<{ ok: boolean; error?: string }>;
  setEdgePriority(edgeId: string, priority: number): Promise<{ ok: boolean; error?: string }>;
  initializeSequence(parentId: string, orderedChildIds: string[]): Promise<{ ok: boolean; error?: string }>;
  clearSequence(parentId: string): Promise<{ ok: boolean; error?: string }>;
  setSequenceMode(parentId: string, mode: 'rank' | 'priority', boardId?: string): Promise<{ ok: boolean; error?: string }>;
  includeNode(nodeId: string, boardId?: string): Promise<{ ok: boolean; error?: string }>;
  moveNode(nodeId: string, position: { x: number; y: number }, boardId?: string): Promise<{ ok: boolean; error?: string }>;
  moveNodes(positions: Record<string, { x: number; y: number }>, boardId?: string): Promise<{ ok: boolean; error?: string }>;
  openJourney(journeyId: string): Promise<{ ok: boolean; error?: string; boardId?: string }>;
  closeBoard(boardId: string): Promise<{ ok: boolean; error?: string }>;
}

export function createDenimActionApi(session: DenimSession): DenimActionApi {
  const dispatch = (action: DenimAction) => session.dispatchAction(action);
  return {
    dispatch,
    createJourney: (text) => dispatch({ op: 'journey.create', text }),
    differentiate: (parentId, text, placement) => dispatch({ op: 'node.differentiate', parentId, text, placement }),
    connectExisting: (parentId, childId) => dispatch({ op: 'edge.connect', parentId, childId }),
    deleteEdge: (edgeId) => dispatch({ op: 'edge.delete', edgeId }),
    updateNode: (id, patch) => dispatch({ op: 'node.update', id, patch }),
    deleteNode: (id, scope) => dispatch({ op: 'node.delete', id, scope }),
    setEdgePriority: (edgeId, priority) => dispatch({ op: 'edge.priority.set', edgeId, priority }),
    initializeSequence: (parentId, orderedChildIds) => dispatch({ op: 'sequence.initialize', parentId, orderedChildIds }),
    clearSequence: (parentId) => dispatch({ op: 'sequence.clear', parentId }),
    setSequenceMode: (parentId, mode, boardId = session.state.activeBoardId) => dispatch({ op: 'board.sequenceMode.set', boardId, parentId, mode }),
    includeNode: (nodeId, boardId = session.state.activeBoardId) => dispatch({ op: 'board.includeNode', boardId, nodeId }),
    moveNode: (nodeId, position, boardId = session.state.activeBoardId) => dispatch({ op: 'board.node.move', boardId, nodeId, position }),
    moveNodes: (positions, boardId = session.state.activeBoardId) => dispatch({ op: 'board.nodes.move', boardId, positions }),
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
