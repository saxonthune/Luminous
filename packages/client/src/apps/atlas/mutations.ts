import type { AtlasColorToken, AtlasContent, AtlasContentMode, AtlasDocument, AtlasNode } from '@luminous/core/atlas';
import { reparent, type AtlasResult } from '@luminous/core/atlas';

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
 * R6 preview text for a pending drop — what `resolveDrop` would do, phrased
 * for a toast. `null` when the drop is a plain move (no membership change).
 * Deliberately does not predict a refusal (self/descendant): the hit-test
 * excludes the dragged Node's own subtree, so a drag rarely resolves there,
 * and if it does, the drop attempt itself is the source of truth.
 */
export function describePendingDrop(doc: AtlasDocument, nodeId: string, hitContainerId: string | null): string | null {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const targetParent = hitContainerId ?? undefined;
  const currentParent = node.parent;
  if (targetParent === currentParent) return null;
  const nameOf = (id: string) => doc.nodes.find((n) => n.id === id)?.name ?? id;
  if (targetParent && currentParent) {
    return `Move "${node.name}" from "${nameOf(currentParent)}" to "${nameOf(targetParent)}"`;
  }
  if (targetParent) {
    return `Add "${node.name}" to "${nameOf(targetParent)}"`;
  }
  return `Remove "${node.name}" from "${nameOf(currentParent!)}"`;
}
