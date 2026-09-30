import { type FunctionInfo, type MapItem } from "@luminous/core/hemp";

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

/** The PCB stops at items; detailed syntax never affects its footprint. */
export function mapItemSize(_item: MapItem, _info?: FunctionInfo) {
  return { w: 420, h: 190 };
}
