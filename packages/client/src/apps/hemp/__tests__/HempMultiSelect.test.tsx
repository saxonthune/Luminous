import { afterEach, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { HempCanvas } from "../HempCanvas";
import type { HempDocument } from "@luminous/core/hemp";

let dispose: (() => void) | undefined;
it("projects item containment into movable frames with distinct kind fills", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const [doc, setDoc] = createSignal<HempDocument>({
    version: 1,
    projection: "items",
    name: "items",
    analysis: { method: "fixture", scope: "", warnings: [] },
    views: {},
    nodes: [
      {
        id: "m",
        name: "module",
        kind: "module",
        description: "",
        source: { file: "m.rs", line: 1 },
      },
      {
        id: "f",
        name: "function",
        kind: "function",
        parent: "m",
        description: "",
        source: { file: "m.rs", line: 2 },
      },
      {
        id: "c",
        name: "constant",
        kind: "constant",
        parent: "m",
        description: "",
        source: { file: "m.rs", line: 3 },
      },
    ],
    dependencies: [{ from: "f", to: "c", kind: "reference", evidence: [] }],
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <HempCanvas doc={doc()} disabled={false} onChange={setDoc} />, host);
  const frame = host.querySelector<HTMLElement>('[data-node-id="crate-container:m"]')!;
  const fn = host.querySelector<HTMLElement>('[data-node-id="f"]')!;
  expect(frame.textContent).toContain("module · contents");
  expect(parseFloat(fn.style.left)).toBeGreaterThan(parseFloat(frame.style.left));
  const fill = (id: string) =>
    host.querySelector<HTMLElement>(`[data-node-id="${id}"] .shadow-sm`)!.style.background;
  expect(new Set([fill("m"), fill("f"), fill("c")]).size).toBe(3);
  const constant = host.querySelector<HTMLElement>('[data-node-id="c"]')!;
  expect(constant.querySelector('[data-hemp-shape="stadium"]')).not.toBeNull();
  expect(fn.querySelector('[data-hemp-shape="card"]')).not.toBeNull();
  expect(parseFloat(constant.style.width)).toBeLessThan(parseFloat(fn.style.width));
  expect(parseFloat(constant.style.height)).toBeLessThan(parseFloat(fn.style.height));
  const edgeLayer = host.querySelector<SVGElement>('[data-cactus-edge-route-band="0"]')!;
  expect(Number(frame.style.zIndex)).toBeLessThan(Number(edgeLayer.style.zIndex));
  expect(Number(fn.style.zIndex)).toBeGreaterThan(Number(edgeLayer.style.zIndex));
  // One reference arrow; the owner-to-container dashed tether is undirected.
  expect(edgeLayer.querySelectorAll('path[fill]:not([fill="none"])')).toHaveLength(1);
  frame
    .querySelector("strong")!
    .parentElement!.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
    );
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: 140, clientY: 120 }));
  window.dispatchEvent(new MouseEvent("pointerup"));
  expect(doc().containers!.m).toBeDefined();
  expect(Object.keys(doc().views.workspace)).toEqual(["m"]);
  expect(Object.keys(doc().views.m).sort()).toEqual(["c", "f"]);
  const saved = structuredClone({ views: doc().views, containers: doc().containers });
  host
    .querySelector('[data-node-id="m"] button[aria-label="Collapse module"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(doc().collapsed).toEqual(["m"]);
  expect(host.querySelector('[data-node-id="f"]')).toBeNull();
  expect(host.querySelector('[data-node-id="crate-container:m"]')).toBeNull();
  host
    .querySelector('button[aria-label="Expand module"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(host.querySelector('[data-node-id="f"]')).not.toBeNull();
  expect({ views: doc().views, containers: doc().containers }).toEqual(saved);
});
afterEach(() => {
  dispose?.();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("opens a peer crate-container and saves module drag, frame drag, and manual resize independently", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    toJSON() {},
  });
  const [doc, setDoc] = createSignal<HempDocument>({
    version: 1,
    name: "fixture",
    analysis: { method: "fixture", scope: "", warnings: [] },
    nodes: [
      {
        id: "a",
        name: "a",
        kind: "crate",
        description: "Crate description",
        source: { file: "a", line: 1 },
      },
      {
        id: "a::m",
        name: "m",
        kind: "module",
        parent: "a",
        description: "Module description",
        source: { file: "m", line: 1 },
      },
    ],
    dependencies: [{ from: "a::m", to: "a", kind: "import", evidence: [] }],
    views: { workspace: { a: { x: 100, y: 100 } } },
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <HempCanvas doc={doc()} disabled={false} onChange={setDoc} />, host);
  expect(host.querySelector('[data-node-id="a"]')!.textContent).not.toContain("Crate description");
  host
    .querySelector('[data-node-id="a"] button')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(host.querySelector('[data-node-id="a"]')).not.toBeNull();
  expect(host.querySelector('[data-node-id="a::m"]')).not.toBeNull();
  const initial = structuredClone(doc().containers!.a);
  function drag(element: Element, dx: number, dy: number) {
    element.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
    );
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 + dx, clientY: 100 + dy }));
    window.dispatchEvent(new MouseEvent("pointerup"));
  }
  drag(host.querySelector('[data-node-id="a::m"]')!, 10000, 10000);
  expect(doc().containers!.a).toEqual(initial);
  expect(doc().views.a["a::m"].x + 280).toBeLessThanOrEqual(initial.width);
  expect(doc().views.a["a::m"].y + 76).toBeLessThanOrEqual(initial.height);
  expect(host.querySelector("aside")!.textContent).toContain("Module description");
  const modulePosition = { ...doc().views.a["a::m"] };
  drag(host.querySelector('[data-node-id="crate-container:a"] strong')!.parentElement!, 50, 30);
  expect(doc().containers!.a.x).toBeGreaterThan(initial.x);
  expect(doc().views.a["a::m"].x).toBeCloseTo(modulePosition.x);
  expect(doc().views.a["a::m"].y).toBeCloseTo(modulePosition.y);
  const beforeResize = structuredClone(doc());
  drag(host.querySelector("[data-cactus-resize-handle]")!, 100, 80);
  expect(doc().containers!.a.width).toBeGreaterThan(beforeResize.containers!.a.width);
  expect(doc().containers!.a.height).toBeGreaterThan(beforeResize.containers!.a.height);
  expect(doc().views).toEqual(beforeResize.views);
  const overview = host.querySelector('[data-node-id="hemp:crate-overview"]')!;
  expect(overview.textContent).toBe("Crates");
  // Cross-level dependency is hidden; the owner tether is still present.
  const edges = host.querySelector('[data-cactus-edge-route-band="0"]')!;
  expect(edges.querySelectorAll('path[fill]:not([fill="none"])')).toHaveLength(0);
  expect(edges.querySelector("[stroke-dasharray]")).not.toBeNull();
  const crateBefore = { ...doc().views.workspace.a };
  const contentsBefore = structuredClone(doc().containers);
  drag(overview.querySelector("strong")!.parentElement!, 50, 30);
  expect(doc().views.workspace.a.x).toBeGreaterThan(crateBefore.x);
  expect(doc().containers).toEqual(contentsBefore);
  expect(doc().crateOverview).toBeDefined();
});

it("box selects cards and moves the selection together in one document update", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    toJSON() {},
  });
  const doc: HempDocument = {
    version: 1,
    name: "fixture",
    analysis: { method: "fixture", scope: "", warnings: [] },
    nodes: ["a", "b"].map((id) => ({
      id,
      name: id,
      kind: "crate",
      description: "",
      source: { file: id, line: 1 },
    })),
    dependencies: [],
    views: { workspace: { a: { x: 100, y: 100 }, b: { x: 100, y: 300 } } },
  };
  const change = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <HempCanvas doc={doc} disabled={false} onChange={change} />, host);
  const pan = host.querySelector<HTMLElement>("[data-cactus-pan-surface]")!;
  const t = (pan.parentElement as HTMLElement & { __zoom: { x: number; y: number; k: number } })
    .__zoom;
  pan.dispatchEvent(
    new MouseEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: t.x + 90 * t.k,
      clientY: t.y + 90 * t.k,
    }),
  );
  window.dispatchEvent(
    new MouseEvent("pointermove", { clientX: t.x + 390 * t.k, clientY: t.y + 440 * t.k }),
  );
  window.dispatchEvent(new MouseEvent("pointerup"));
  expect(host.textContent).toContain("2 selected");
  const card = host.querySelector<HTMLElement>('[data-node-id="a"]')!;
  card.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
  );
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: 140, clientY: 120 }));
  window.dispatchEvent(new MouseEvent("pointerup"));
  expect(change).toHaveBeenCalledTimes(1);
  const next = change.mock.calls[0][0] as HempDocument;
  expect(next.views.workspace.a.x - doc.views.workspace.a.x).toBeCloseTo(40 / t.k);
  expect(next.views.workspace.b.x - doc.views.workspace.b.x).toBeCloseTo(40 / t.k);
  expect(next.views.workspace.b.y - next.views.workspace.a.y).toBe(200);
});
