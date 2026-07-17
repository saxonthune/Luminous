import type { AtlasAction, AtlasDocument, ReparentAction, SetNodeAction } from './types.ts';
import { applyAtlasBatch } from './operations.ts';

function invertSetNode(before: AtlasDocument, action: SetNodeAction): AtlasAction[] {
  const node = before.nodes.find((n) => n.id === action.id);
  if (!node) return [];
  const inverse: SetNodeAction = { type: 'setNode', id: action.id };
  if ('name' in action) inverse.name = node.name;
  if ('content' in action) inverse.content = node.content;
  if ('x' in action) inverse.x = node.x;
  if ('y' in action) inverse.y = node.y;
  if ('color' in action) inverse.color = node.color;
  if ('contentHeight' in action) inverse.contentHeight = node.contentHeight;
  return [inverse];
}

/** Inverts one `AtlasAction` against `before`, the Document state immediately
 * preceding it. `removeNode` has no inverse: its cascade deletes edges that no
 * `AtlasAction` can recreate (there is no `addEdge`). No current UI issues a
 * user-initiated `removeNode`, so this is deliberately unsupported — a future
 * delete-Node feature needs an `addEdge` action or a snapshot-based inverse. */
export function invertAtlasAction(before: AtlasDocument, action: AtlasAction): AtlasAction[] {
  switch (action.type) {
    case 'addNode':
      return [{ type: 'removeNode', id: action.id }];
    case 'reparent': {
      const node = before.nodes.find((n) => n.id === action.id);
      const inverse: ReparentAction = { type: 'reparent', id: action.id };
      if (node?.parent !== undefined) inverse.parent = node.parent;
      return [inverse];
    }
    case 'setNode':
      return invertSetNode(before, action);
    case 'removeNode':
      throw new Error(
        `invertAtlasAction: cannot invert removeNode for "${action.id}" — its cascade ` +
          'deletes edges that no AtlasAction can recreate. See atlas-undo-redo-history plan.',
      );
  }
}

/** Inverts a batch, folding forward through `before` so each action inverts
 * against the state it actually saw, and returns the inverses in reverse
 * order — applying them undoes the batch as a unit. */
export function invertAtlasBatch(before: AtlasDocument, actions: AtlasAction[]): AtlasAction[] {
  const inverses: AtlasAction[] = [];
  let current = before;
  for (const action of actions) {
    inverses.push(...invertAtlasAction(current, action));
    const result = applyAtlasBatch(current, [action]);
    if (!result.ok) {
      throw new Error(`invertAtlasBatch: cannot apply action "${action.type}" while computing inverse: ${result.error}`);
    }
    current = result.doc;
  }
  return inverses.reverse();
}
