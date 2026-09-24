import { functionParts, type FunctionInfo, type MapItem } from "@luminous/core/hemp";

/** Only this stage chooses what the facts say and look like on the canvas. */
export function presentMapItem(item: MapItem) {
  const colors: Record<string, string> = {
    crate: "#d5dce8",
    module: "#e5c5ce",
    function: "#c4dffa",
    method: "#c4dffa",
    struct: "#c9e7d5",
    enum: "#eddfb3",
    variant: "#f4e8c8",
    constant: "#e3d6f2",
    static: "#dacbec",
    trait: "#cce6e8",
    impl: "#d8e9df",
    field: "#e2edcf",
  };
  return { title: item.name, subtitle: item.kind, color: colors[item.kind] ?? "#e5e1da" };
}

/** Conservative reserved footprint, independent of whether the body is loaded. */
export function mapItemSize(item: MapItem, info?: FunctionInfo) {
  if (!info) return { w: 420, h: 160 };
  const rows = functionParts(info.body);
  return {
    w: 1380,
    h: 220 + rows.reduce((sum, p) => sum + 100 + Math.ceil(p.label.length / 60) * 24, 0),
  };
}
