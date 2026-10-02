import { createContext, useContext, type ParentProps } from 'solid-js';
import type { DenimAction } from '@luminous/core/denim/actions';
import type { DenimSession } from './DenimSession';

export interface DenimActionApi {
  dispatch(action: DenimAction): Promise<{ ok: boolean; error?: string; nodeId?: string; tabId?: string }>;
  createJourney(text?: string): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  differentiate(parentId: string, type?: string, text?: string): Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  connectExisting(parentId: string, childId: string): Promise<{ ok: boolean; error?: string }>;
  updateNode(id: string, patch: { type?: string; text?: string }): Promise<{ ok: boolean; error?: string }>;
  deleteNode(id: string, scope: 'node' | 'subtree'): Promise<{ ok: boolean; error?: string }>;
  setEdgePriority(edgeId: string, priority: number): Promise<{ ok: boolean; error?: string }>;
  initializeSequence(parentId: string, orderedChildIds: string[]): Promise<{ ok: boolean; error?: string }>;
  clearSequence(parentId: string): Promise<{ ok: boolean; error?: string }>;
  setSequenceMode(parentId: string, mode: 'rank' | 'priority', tabId?: string): Promise<{ ok: boolean; error?: string }>;
  includeNode(nodeId: string, tabId?: string): Promise<{ ok: boolean; error?: string }>;
  moveNode(nodeId: string, position: { x: number; y: number }, tabId?: string): Promise<{ ok: boolean; error?: string }>;
  openJourney(journeyId: string): Promise<{ ok: boolean; error?: string; tabId?: string }>;
  closeView(tabId: string): Promise<{ ok: boolean; error?: string }>;
}

export function createDenimActionApi(session: DenimSession): DenimActionApi {
  const dispatch = (action: DenimAction) => session.dispatchAction(action);
  return {
    dispatch,
    createJourney: (text) => dispatch({ op: 'journey.create', text }),
    differentiate: (parentId, type, text) => dispatch({ op: 'node.differentiate', parentId, type, text }),
    connectExisting: (parentId, childId) => dispatch({ op: 'edge.connect', parentId, childId }),
    updateNode: (id, patch) => dispatch({ op: 'node.update', id, patch }),
    deleteNode: (id, scope) => dispatch({ op: 'node.delete', id, scope }),
    setEdgePriority: (edgeId, priority) => dispatch({ op: 'edge.priority.set', edgeId, priority }),
    initializeSequence: (parentId, orderedChildIds) => dispatch({ op: 'sequence.initialize', parentId, orderedChildIds }),
    clearSequence: (parentId) => dispatch({ op: 'sequence.clear', parentId }),
    setSequenceMode: (parentId, mode, tabId = session.state.activeTabId) => dispatch({ op: 'view.sequenceMode.set', tabId, parentId, mode }),
    includeNode: (nodeId, tabId = session.state.activeTabId) => dispatch({ op: 'view.includeNode', tabId, nodeId }),
    moveNode: (nodeId, position, tabId = session.state.activeTabId) => dispatch({ op: 'view.node.move', tabId, nodeId, position }),
    openJourney: (journeyId) => dispatch({ op: 'view.openJourney', journeyId }),
    closeView: (tabId) => dispatch({ op: 'view.close', tabId }),
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
