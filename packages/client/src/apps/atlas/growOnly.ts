// Grow-only Containers (doc01.07.04 R95): shrink-wrap (projection.ts sizeOf)
// recomputes a Container's size from its Children on every projection, so a
// Child moving inward, shrinking, or leaving would shrink the box. The
// dispatch seam calls this after each batch and appends the returned floors
// in the same undoable batch, so a Container's box only ever grows. The fit
// command (R73) clears the stored size explicitly — its Node is exempted via
// `sizeTouchedIds`, keeping it the one way back to the computed size.
import type { AtlasAction, AtlasDocument, SetNodeAction } from '@luminous/core/atlas';
import { projectAtlasNodes } from './projection.ts';

/** Nodes whose size a batch sets or clears on purpose — exempt from the
 * ratchet, else a deliberate shrink (resize handle, fit command) would be
 * immediately re-floored. */
export function sizeTouchedIds(actions: AtlasAction[]): Set<string> {
  const ids = new Set<string>();
  for (const action of actions) {
    if (action.type === 'setNode' && ('contentWidth' in action || 'contentHeight' in action)) {
      ids.add(action.id);
    }
  }
  return ids;
}

/**
 * Size floors for every Container whose projected box `after` shrank below
 * `before`, as `setNode` writes of the before-size (`contentWidth`/
 * `contentHeight` are floors in `shrinkWrapSize`, never ceilings). A Node
 * that stopped being a Container is skipped — a leaf collapses to leaf size
 * rather than keeping its old box.
 */
export function buildGrowOnlyActions(
  before: AtlasDocument,
  after: AtlasDocument,
  exempt: ReadonlySet<string>,
): SetNodeAction[] {
  const beforeById = new Map(projectAtlasNodes(before).map((rn) => [rn.node.id, rn]));
  const actions: SetNodeAction[] = [];
  for (const rn of projectAtlasNodes(after)) {
    if (!rn.hasChildren || exempt.has(rn.node.id)) continue;
    const prev = beforeById.get(rn.node.id);
    if (!prev || !prev.hasChildren) continue;
    const action: SetNodeAction = { type: 'setNode', id: rn.node.id };
    if (rn.w < prev.w) action.contentWidth = prev.w;
    if (rn.h < prev.h) action.contentHeight = prev.h;
    if (action.contentWidth !== undefined || action.contentHeight !== undefined) actions.push(action);
  }
  return actions;
}
