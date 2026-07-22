import type { AddNodeAction, AtlasAction, AtlasDocument, AtlasNode, ReparentAction, SetNodeAction } from './types.ts';
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
  if ('contentWidth' in action) inverse.contentWidth = node.contentWidth;
  return [inverse];
}

/** Rebuilds everything a `removeNode` cascade deleted: the node, its
 * descendants, and every edge touching any of them, all valued from `before`.
 * Nodes are emitted parents-before-children (addNode validates the parent
 * exists) and edges last (addEdge validates both endpoints). Fields addNode
 * can't carry (content, color, contentWidth, contentHeight) follow as a
 * setNode — same shape as mutations' buildDuplicateActions. */
function invertRemoveNode(before: AtlasDocument, id: string): AtlasAction[] {
  const removedIds = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of before.nodes) {
      if (n.parent !== undefined && removedIds.has(n.parent) && !removedIds.has(n.id)) {
        removedIds.add(n.id);
        grew = true;
      }
    }
  }
  const removedNodes = before.nodes.filter((n) => removedIds.has(n.id));
  const emitted = new Set<string>();
  const ordered: AtlasNode[] = [];
  while (ordered.length < removedNodes.length) {
    const sizeBefore = ordered.length;
    for (const n of removedNodes) {
      if (emitted.has(n.id)) continue;
      if (n.parent === undefined || !removedIds.has(n.parent) || emitted.has(n.parent)) {
        ordered.push(n);
        emitted.add(n.id);
      }
    }
    if (ordered.length === sizeBefore) break;
  }
  const actions: AtlasAction[] = [];
  for (const n of ordered) {
    const add: AddNodeAction = { type: 'addNode', id: n.id, name: n.name };
    if (n.parent !== undefined) add.parent = n.parent;
    if (n.x !== undefined) add.x = n.x;
    if (n.y !== undefined) add.y = n.y;
    actions.push(add);
    const patch: SetNodeAction = { type: 'setNode', id: n.id };
    let hasPatch = false;
    if (n.content !== undefined) { patch.content = n.content; hasPatch = true; }
    if (n.color !== undefined) { patch.color = n.color; hasPatch = true; }
    if (n.contentHeight !== undefined) { patch.contentHeight = n.contentHeight; hasPatch = true; }
    if (n.contentWidth !== undefined) { patch.contentWidth = n.contentWidth; hasPatch = true; }
    if (hasPatch) actions.push(patch);
  }
  for (const e of before.edges) {
    if (removedIds.has(e.from) || removedIds.has(e.to)) {
      actions.push({ type: 'addEdge', from: e.from, to: e.to });
    }
  }
  return actions;
}

/** Inverts one `AtlasAction` against `before`, the Document state immediately
 * preceding it. `removeNode` inverts into a rebuild batch (see
 * `invertRemoveNode`); undo restores the removed nodes at the end of the
 * `nodes` array, which is equivalent — projection orders by the parent links,
 * not by array position. */
export function invertAtlasAction(before: AtlasDocument, action: AtlasAction): AtlasAction[] {
  switch (action.type) {
    case 'addNode':
      return [{ type: 'removeNode', id: action.id }];
    case 'reparent': {
      const node = before.nodes.find((n) => n.id === action.id);
      const inverse: ReparentAction = { type: 'reparent', id: action.id };
      if (node?.parent !== undefined) inverse.parent = node.parent;
      // Reparenting under `action.parent` strips any edge between the two
      // (operations.ts): restore those after the reparent-back — after,
      // because addEdge refuses while the pair is still parent-child.
      const stripped =
        action.parent === undefined
          ? []
          : before.edges.filter(
              (e) =>
                (e.from === action.id && e.to === action.parent) ||
                (e.from === action.parent && e.to === action.id),
            );
      return [inverse, ...stripped.map((e): AtlasAction => ({ type: 'addEdge', from: e.from, to: e.to }))];
    }
    case 'setNode':
      return invertSetNode(before, action);
    case 'addEdge':
      return [{ type: 'removeEdge', from: action.from, to: action.to }];
    case 'removeEdge':
      return [{ type: 'addEdge', from: action.from, to: action.to }];
    case 'removeNode':
      return invertRemoveNode(before, action.id);
  }
}

/** Inverts a batch, folding forward through `before` so each action inverts
 * against the state it actually saw, and returns the per-action inverse
 * groups in reverse order — applying them undoes the batch as a unit. Groups
 * reverse as units, not flat: a multi-action inverse (removeNode's rebuild)
 * is ordered internally and must stay that way. */
export function invertAtlasBatch(before: AtlasDocument, actions: AtlasAction[]): AtlasAction[] {
  const groups: AtlasAction[][] = [];
  let current = before;
  for (const action of actions) {
    groups.push(invertAtlasAction(current, action));
    const result = applyAtlasBatch(current, [action]);
    if (!result.ok) {
      throw new Error(`invertAtlasBatch: cannot apply action "${action.type}" while computing inverse: ${result.error}`);
    }
    current = result.doc;
  }
  return groups.reverse().flat();
}
