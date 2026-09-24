import type { Rect } from "./containment.js";

/** Preserve saved anchors. New siblings are appended without moving old nodes. */
export function retainLayout(
  nodes: { id: string; parent?: string }[],
  proposed: Record<string, Rect>,
  saved: Record<string, Rect>,
) {
  const layout: Record<string, Rect> = {};
  const changed: string[] = [];
  const siblings = new Map<string | undefined, string[]>();
  for (const n of nodes) {
    const list = siblings.get(n.parent) ?? [];
    list.push(n.id);
    siblings.set(n.parent, list);
    const old = saved[n.id],
      next = proposed[n.id];
    layout[n.id] = old
      ? {
          ...old,
          width: Math.max(old.width, next.width),
          height: Math.max(old.height, next.height),
        }
      : { ...next };
    if (old && (next.width > old.width || next.height > old.height)) changed.push(n.id);
  }
  for (const group of siblings.values()) {
    const existing = group.filter((id) => saved[id]);
    if (!existing.length) continue;
    let right = Math.max(...existing.map((id) => layout[id].x + layout[id].width)) + 120;
    for (const id of group.filter((id) => !saved[id])) {
      layout[id].x = right;
      layout[id].y = 100;
      right += layout[id].width + 120;
      changed.push(id);
    }
  }
  // Fit ancestors around retained child positions without changing any anchor.
  const grow = (id: string) => {
    for (const child of siblings.get(id) ?? []) {
      grow(child);
      layout[id].width = Math.max(layout[id].width, layout[child].x + layout[child].width + 60);
      layout[id].height = Math.max(layout[id].height, layout[child].y + layout[child].height + 60);
    }
  };
  for (const id of siblings.get(undefined) ?? []) grow(id);
  return { layout, changed };
}
