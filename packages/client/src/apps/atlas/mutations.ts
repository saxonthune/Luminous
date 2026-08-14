import type { AtlasAction, AtlasColorToken, AtlasContent, AtlasContentMode, AtlasDocument, AtlasNode } from '@luminous/core/atlas';
import { edgeAllowed, isAncestor, reparent, setNode, type AtlasResult } from '@luminous/core/atlas';
import { childAreaOrigin } from './projection.ts';

/** Raw values collected from the Node edit form. */
export interface NodeEditForm {
  name: string;
  text: string;
}

/**
 * Builds the `setNode` patch from a submitted edit form. An empty name falls
 * back to `previousName` (a Node always has a Name); the Mode is preserved
 * from the Node's current Content, defaulting to `markdown` for a Node that
 * had none — the switcher, not the edit form, is what changes the Mode.
 */
export function buildContentEditPatch(
  form: NodeEditForm,
  previousName: string,
  currentMode: AtlasContentMode | undefined,
): { name: string; content: AtlasContent } {
  return {
    name: form.name.trim() === '' ? previousName : form.name,
    content: { text: form.text, mode: currentMode ?? 'markdown' },
  };
}

/**
 * Builds the `setNode` patch for a switcher click: keeps the Node's existing
 * text (empty if it had no Content yet) and sets only the Mode.
 */
export function buildModePatch(
  currentContent: AtlasContent | undefined,
  mode: AtlasContentMode,
): { content: AtlasContent } {
  return { content: { text: currentContent?.text ?? '', mode } };
}

/**
 * Builds the `setNode` patch for a Color swatch pick. The `color` key is
 * always present (even when `undefined`) because `setNode` reads `'color' in
 * patch` to decide whether to clear the field, not just its value.
 */
export function buildColorPatch(color: AtlasColorToken | undefined): { color?: AtlasColorToken } {
  return { color };
}

/** Appends `-2`, `-3`, … to `base` until it is absent from `taken`. Mirrors
 * dataflow/mutations.ts's `uniqueId`. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/**
 * Duplicates Node `id`: fresh non-colliding id, same name/Content/parent.
 * Descendants and Edges are not copied — Atlas has no equivalent of
 * Dataflow's R8 "duplicate with flows".
 */
export function duplicateNode(doc: AtlasDocument, id: string): AtlasDocument {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node) return doc;
  const existingIds = new Set(doc.nodes.map((n) => n.id));
  const newId = uniqueId(`${id}-copy`, existingIds);
  const copy: AtlasNode = { id: newId, name: node.name };
  if (node.parent !== undefined) copy.parent = node.parent;
  if (node.content !== undefined) copy.content = node.content;
  return { ...doc, nodes: [...doc.nodes, copy] };
}

/**
 * The `AtlasAction`s that produce `duplicateNode`'s result: an `addNode` for
 * the copy, plus a trailing `setNode` carrying its Content (`AddNodeAction`
 * has no content field). Derived by diffing against `duplicateNode` rather
 * than reimplementing its id/field logic — stays correct if duplication ever
 * grows to cover descendants.
 */
export function buildDuplicateActions(doc: AtlasDocument, id: string): AtlasAction[] {
  const existingIds = new Set(doc.nodes.map((n) => n.id));
  const next = duplicateNode(doc, id);
  const added = next.nodes.find((n) => !existingIds.has(n.id));
  if (!added) return [];
  const actions: AtlasAction[] = [
    {
      type: 'addNode',
      id: added.id,
      name: added.name,
      ...(added.parent !== undefined ? { parent: added.parent } : {}),
      ...(added.x !== undefined ? { x: added.x } : {}),
      ...(added.y !== undefined ? { y: added.y } : {}),
    },
  ];
  if (added.content !== undefined) {
    actions.push({ type: 'setNode', id: added.id, content: added.content });
  }
  return actions;
}

/**
 * The selection's Roots: the ids in `ids` that have no ancestor also in
 * `ids`. A drag moves the Roots — a selected descendant travels with its
 * Root's subtree, so moving it separately would shift it twice (R69).
 */
export function selectionRoots(doc: AtlasDocument, ids: string[]): string[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const idSet = new Set(ids);
  return ids.filter((id) => {
    let parent = byId.get(id)?.parent;
    while (parent !== undefined) {
      if (idSet.has(parent)) return false;
      parent = byId.get(parent)?.parent;
    }
    return true;
  });
}

/** The Children of `id` — depth 1 only, in Document order. */
export function childrenOf(doc: AtlasDocument, id: string): string[] {
  return doc.nodes.filter((n) => n.parent === id).map((n) => n.id);
}

/** Every node reachable from `id` by following child -> parent links, plus `id` itself. */
export function selfAndDescendantIds(doc: AtlasDocument, id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of doc.nodes) {
    if (n.parent !== undefined) {
      const list = children.get(n.parent) ?? [];
      list.push(n.id);
      children.set(n.parent, list);
    }
  }
  const result = new Set<string>([id]);
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of children.get(current) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        stack.push(child);
      }
    }
  }
  return result;
}

/** Every selected Node and every descendant of each selection, at any depth.
 * This is a visual/command projection only: descendants are not themselves
 * added to the canvas selection. */
export function selectionSubtreeIds(doc: AtlasDocument, ids: ReadonlyArray<string>): string[] {
  const result = new Set<string>();
  for (const id of ids) {
    for (const subtreeId of selfAndDescendantIds(doc, id)) result.add(subtreeId);
  }
  return [...result];
}

/**
 * The pure drop decision behind a Node drag: given the deepest Container id
 * under the pointer (or `null` for the background), does dropping here write
 * anything? A target equal to the Node's current parent is a plain move, not
 * an edit. Otherwise this defers to core's `reparent`, which is the single
 * source of truth for refusing a drop onto the Node itself or a descendant —
 * see reparent's cycle check in operations.ts.
 */
export type DropOutcome = { changed: false } | { changed: true; result: AtlasResult };

export function resolveDrop(doc: AtlasDocument, nodeId: string, hitContainerId: string | null): DropOutcome {
  const node = doc.nodes.find((n) => n.id === nodeId);
  const targetParent = hitContainerId ?? undefined;
  if (targetParent === node?.parent) return { changed: false };
  return { changed: true, result: reparent(doc, nodeId, targetParent) };
}

/**
 * Composes a drag-drop into a single result: reparent (via `resolveDrop`) then
 * persist the dropped Node's parent-relative position, so a move never snaps
 * back (doc01.07.04 R24-R26). `droppedAbs` and `parentAbs` are canvas-space
 * absolute positions the caller reads from its current projection —
 * `parentAbs` is `undefined` for a root-level drop (relative to the origin).
 * A refused reparent short-circuits: no position is written either, so the
 * whole drop snaps back together.
 */
export function applyDrop(
  doc: AtlasDocument,
  nodeId: string,
  hitContainerId: string | null,
  droppedAbs: { x: number; y: number },
  parentAbs: { x: number; y: number } | undefined,
): AtlasResult {
  const outcome = resolveDrop(doc, nodeId, hitContainerId);
  if (outcome.changed && !outcome.result.ok) return outcome.result;
  const workingDoc = outcome.changed && outcome.result.ok ? outcome.result.doc : doc;
  // A dropped Node's stored position is relative to its parent's child-area
  // origin, not the parent's top-left corner — see childAreaOrigin. The
  // parent's own header override (if any) governs that origin.
  const parentNode = hitContainerId !== null ? doc.nodes.find((n) => n.id === hitContainerId) : undefined;
  const origin = parentAbs ? childAreaOrigin(parentNode) : { x: 0, y: 0 };
  const relX = droppedAbs.x - (parentAbs?.x ?? 0) - origin.x;
  const relY = droppedAbs.y - (parentAbs?.y ?? 0) - origin.y;
  return setNode(workingDoc, nodeId, { x: relX, y: relY });
}

/**
 * Whether an Edge from `source` to `target` may be created: not a self edge,
 * and not a duplicate of one already in the Document. Core's `addEdge`
 * treats a duplicate as ok-with-no-change (operations.ts), so recording one
 * in history would push an inverse that removes the pre-existing edge on
 * undo — this must be checked before dispatch, not after.
 */
export function canConnect(doc: AtlasDocument, source: string, target: string): boolean {
  if (source === target) return false;
  // R55: no edge within an ancestor chain — core's addEdge refuses the pair
  // (edgeAllowed is the one rule function), so the UI must not offer it.
  if (!edgeAllowed(doc, source, target)) return false;
  return !doc.edges.some((e) => e.from === source && e.to === target);
}

/**
 * Whether a Ctrl-drop into `parentId` completes the Edge into the new Node.
 * A drop inside the source's own subtree makes the new Node the source's
 * descendant — containment carries the relation, so no edge (R55). The toast
 * and `buildConnectDropActions` both read this, so they cannot disagree.
 */
export function connectDropAddsEdge(doc: AtlasDocument, sourceId: string, parentId: string | null): boolean {
  if (parentId === null) return true;
  return parentId !== sourceId && !isAncestor(doc, sourceId, parentId);
}

/**
 * The `AtlasAction`s for a Ctrl-drop edge completion (R52): a fresh Node
 * under the pointer, parented by the Container under the pointer (or
 * top-level when `parentId` is `null`), plus the Edge from `sourceId` into
 * it. Position math mirrors `endDrag`'s drop-position write above — parent-
 * relative, via the parent's child-area origin.
 */
export function buildConnectDropActions(
  doc: AtlasDocument,
  sourceId: string,
  parentId: string | null,
  droppedAbs: { x: number; y: number },
  parentAbs: { x: number; y: number } | undefined,
): AtlasAction[] {
  const existingIds = new Set(doc.nodes.map((n) => n.id));
  const id = uniqueId('new-node', existingIds);
  const parentNode = parentId !== null ? doc.nodes.find((n) => n.id === parentId) : undefined;
  const origin = parentAbs ? childAreaOrigin(parentNode) : { x: 0, y: 0 };
  const x = droppedAbs.x - (parentAbs?.x ?? 0) - origin.x;
  const y = droppedAbs.y - (parentAbs?.y ?? 0) - origin.y;
  const addNodeAction: AtlasAction = {
    type: 'addNode',
    id,
    name: 'New Node',
    ...(parentId !== null ? { parent: parentId } : {}),
    x,
    y,
  };
  if (!connectDropAddsEdge(doc, sourceId, parentId)) return [addNodeAction];
  return [addNodeAction, { type: 'addEdge', from: sourceId, to: id }];
}

/**
 * R6 preview text for a pending drop — what `resolveDrop` would do, phrased
 * for a toast. `null` when the drop is a plain move (no membership change).
 * Deliberately does not predict a refusal (self/descendant): the hit-test
 * excludes the dragged Node's own subtree, so a drag rarely resolves there,
 * and if it does, the drop attempt itself is the source of truth.
 */
export function describePendingDrop(doc: AtlasDocument, nodeIds: string[], hitContainerId: string | null): string | null {
  const moving = nodeIds
    .map((id) => doc.nodes.find((n) => n.id === id))
    .filter((n): n is AtlasNode => n !== undefined);
  if (moving.length === 0) return null;
  const targetParent = hitContainerId ?? undefined;
  // A group drag is same-parent by construction (doc01.07.04 R69), so the
  // first node's parent stands for the whole group.
  const currentParent = moving[0].parent;
  if (targetParent === currentParent) return null;
  const nameOf = (id: string) => doc.nodes.find((n) => n.id === id)?.name ?? id;
  const subject = moving.length === 1 ? `"${moving[0].name}"` : `${moving.length} Nodes`;
  if (targetParent && currentParent) {
    return `Move ${subject} from "${nameOf(currentParent)}" to "${nameOf(targetParent)}"`;
  }
  if (targetParent) {
    return `Add ${subject} to "${nameOf(targetParent)}"`;
  }
  return `Remove ${subject} from "${nameOf(currentParent!)}"`;
}
