import { createMemo, createSignal, For, Show, onMount } from "solid-js";
import {
  Canvas,
  NodeContainer,
  useCanvasContext,
  useNodeDrag,
  useGesture,
  ResizeHandle,
  type CanvasRef,
} from "@luminous/cactus";
import {
  arrangeHemp,
  hempLayout,
  hempProjection,
  hempItemContainers,
  hempNodeSize,
  HEMP_WIDTH,
  HEMP_HEIGHT,
  type HempDocument,
  type HempNode,
} from "@luminous/core/hemp";
import { hempMarkdown, MARKDOWN_STYLE } from "./markdown";
import { hempEditorLink } from "./editorLinks";
import { computeBounds, placeAdjacent } from "@luminous/cactus/layout";

const frameId = (id: string) => `crate-container:${id}`;
const CRATES = "hemp:crate-overview";
type Frame = {
  id: string;
  crate: string;
  x: number;
  y: number;
  width: number;
  height: number;
  items?: boolean;
  overview?: boolean;
};

// Color follows Rust kind, not individual identity; labels remain the redundant cue.
const ITEM_COLORS: Record<HempNode["kind"], { bg: string; ink: string; border: string }> = {
  crate: { bg: "#d6dce8", ink: "#25364d", border: "#667a99" },
  module: { bg: "#b93649", ink: "#ffffff", border: "#852537" },
  function: { bg: "#c4dffa", ink: "#173e64", border: "#4c85b9" },
  method: { bg: "#b7e3df", ink: "#174943", border: "#428d83" },
  constant: { bg: "#f5dda0", ink: "#624611", border: "#b59038" },
  static: { bg: "#f3bd92", ink: "#62371c", border: "#b67542" },
  struct: { bg: "#c6dfb0", ink: "#334e22", border: "#7a9a55" },
  enum: { bg: "#d9c5f0", ink: "#503269", border: "#9977b5" },
  variant: { bg: "#efc4e4", ink: "#693958", border: "#b2779f" },
  field: { bg: "#dfe6a5", ink: "#495020", border: "#989f52" },
  trait: { bg: "#bdc7f3", ink: "#343c73", border: "#7885bd" },
  impl: { bg: "#c6d5d5", ink: "#344c4d", border: "#799798" },
  type: { bg: "#bde6f0", ink: "#235363", border: "#68a2b5" },
  macro: { bg: "#f4c1be", ink: "#703b38", border: "#bc7b76" },
  item: { bg: "#e2d4c3", ink: "#534738", border: "#ab9477" },
  match: { bg: "#e1c5f0", ink: "#503269", border: "#9977b5" },
  branch: { bg: "#e1c5f0", ink: "#503269", border: "#9977b5" },
  arm: { bg: "#f3d6b5", ink: "#624611", border: "#b59038" },
  call: { bg: "#c4dffa", ink: "#173e64", border: "#4c85b9" },
  closure: { bg: "#b7e3df", ink: "#174943", border: "#428d83" },
};

function HempNodes(props: {
  nodes: HempNode[];
  positions: Record<string, { x: number; y: number }>;
  disabled: boolean;
  onMove: (positions: Record<string, { x: number; y: number }>) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  disclosure?: { owners: Set<string>; collapsed: Set<string>; toggle: (id: string) => void };
  frames: Frame[];
  parents: Record<string, string>;
  onResize: (crate: string, width: number, height: number) => void;
  onClose: (crate: string) => void;
}) {
  const ctx = useCanvasContext();
  const byId = createMemo(() => new Map(props.nodes.map((n) => [n.id, n])));
  const [offset, setOffset] = createSignal<Record<string, { x: number; y: number }>>({});
  let starts: Record<string, { x: number; y: number }> = {};
  const drag = useNodeDrag({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragStart: (id) => {
        const ids = new Set(ctx.isSelected(id) ? ctx.selectedIds() : [id]);
        for (const [child, parent] of Object.entries(props.parents))
          if (ids.has(parent)) ids.add(child);
        starts = Object.fromEntries(
          [...ids]
            .filter((key) => props.positions[key])
            .map((key) => [key, { ...props.positions[key] }]),
        );
      },
      onDrag: (_id, dx, dy) => {
        // A selected module group stays inside its fixed-size frame.
        let minDx = -Infinity,
          maxDx = Infinity,
          minDy = -Infinity,
          maxDy = Infinity;
        for (const [id, p] of Object.entries(starts)) {
          const parent = props.parents[id];
          if (!parent || starts[parent]) continue;
          const f = props.frames.find((f) => f.id === parent)!;
          const dimensions = hempNodeSize(byId().get(id)!);
          minDx = Math.max(minDx, f.x + 16 - p.x);
          maxDx = Math.min(maxDx, f.x + f.width - 16 - dimensions.width - p.x);
          minDy = Math.max(minDy, f.y + 48 - p.y);
          maxDy = Math.min(maxDy, f.y + f.height - 16 - dimensions.height - p.y);
        }
        dx = Math.max(minDx, Math.min(dx, maxDx));
        dy = Math.max(minDy, Math.min(dy, maxDy));
        setOffset(
          Object.fromEntries(
            Object.entries(starts).map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]),
          ),
        );
      },
      onDragEnd: () => {
        if (Object.keys(offset()).length) props.onMove(offset());
        setOffset({});
      },
    },
  });
  const [size, setSize] = createSignal<{ id: string; width: number; height: number } | null>(null);
  let resizeBase: Frame | undefined;
  const resize = useGesture({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onResizeStart: (id) => {
        resizeBase = props.frames.find((f) => f.id === id);
      },
      onResize: (id, dx, dy) => {
        if (!resizeBase) return;
        const children = Object.entries(props.parents)
          .filter(([, parent]) => parent === id)
          .map(([child]) => ({ ...props.positions[child], ...hempNodeSize(byId().get(child)!) }));
        setSize({
          id,
          width: Math.max(
            HEMP_WIDTH + 32,
            ...children.map((p) => p.x - resizeBase!.x + p.width + 16),
            resizeBase.width + dx,
          ),
          height: Math.max(
            HEMP_HEIGHT + 64,
            ...children.map((p) => p.y - resizeBase!.y + p.height + 16),
            resizeBase.height + dy,
          ),
        });
      },
      onResizeEnd: () => {
        const next = size();
        if (next && resizeBase) props.onResize(resizeBase.crate, next.width, next.height);
        setSize(null);
      },
    },
  });
  return (
    <>
      <For each={props.frames.map((f) => f.id)}>
        {(id) => {
          const frame = () => props.frames.find((f) => f.id === id)!;
          const palette = () => ITEM_COLORS[byId().get(frame().crate)?.kind ?? "crate"];
          const rect = () => ({
            ...(offset()[id] ?? frame()),
            w: size()?.id === id ? size()!.width : frame().width,
            h: size()?.id === id ? size()!.height : frame().height,
          });
          return (
            <>
              <NodeContainer
                nodeId={id}
                x={() => rect().x}
                y={() => rect().y}
                w={() => rect().w}
                h={() => rect().h}
                visualBand={() => -1}
              >
                <div
                  class="h-full rounded-lg border-2 border-border-subtle bg-surface-alt"
                  style={{
                    background: `color-mix(in srgb, ${palette().border} 25%, var(--surface))`,
                    "border-color": palette().border,
                    color: "var(--fg)",
                  }}
                >
                  <div
                    class="flex h-10 cursor-grab items-center gap-3 px-3 text-xl"
                    on:pointerdown={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      ctx.onNodePointerDown(id, e);
                      if (!frame().overview) props.onSelect(frame().crate);
                      if (!props.disabled && ctx.isSelected(id)) drag.onPointerDown(id, e);
                    }}
                  >
                    <strong class="min-w-0 flex-1 truncate">
                      {frame().overview
                        ? "Crates"
                        : `${byId().get(frame().crate)?.name ?? frame().crate} · ${frame().items ? "contents" : "modules"}`}
                    </strong>
                    <Show when={!frame().items && !frame().overview}>
                      <button
                        disabled={props.disabled}
                        aria-label={`Close crate-container ${frame().crate}`}
                        onClick={() => props.onClose(frame().crate)}
                      >
                        ×
                      </button>
                    </Show>
                    <Show when={frame().items && !frame().overview}>
                      <button
                        disabled={props.disabled}
                        aria-label={`Collapse ${byId().get(frame().crate)?.name}`}
                        onClick={() => props.disclosure?.toggle(frame().crate)}
                      >
                        Collapse
                      </button>
                    </Show>
                  </div>
                </div>
              </NodeContainer>
              <ResizeHandle
                nodeId={id}
                rect={rect}
                onResizePointerDown={(key, direction, event) => {
                  if (!props.disabled) resize.beginResize(key, direction, event);
                }}
              />
            </>
          );
        }}
      </For>
      <For each={props.nodes.map((n) => n.id)}>
        {(id) => {
          const node = () => byId().get(id)!;
          const pos = () => offset()[id] ?? props.positions[id] ?? { x: 0, y: 0 };
          return (
            <NodeContainer
              nodeId={id}
              x={() => pos().x}
              y={() => pos().y}
              w={() => hempNodeSize(node()).width}
              h={() => hempNodeSize(node()).height}
              visualBand={() => 1}
              onPointerDown={(e) => {
                ctx.onNodePointerDown(id, e);
                props.onSelect(id);
                if (!props.disabled && ctx.isSelected(id)) drag.onPointerDown(id, e);
              }}
            >
              <div
                class="h-full rounded-lg border px-2 py-1 shadow-sm"
                data-hemp-shape={hempNodeSize(node()).stadium ? "stadium" : "card"}
                style={{
                  "border-radius": hempNodeSize(node()).stadium ? "999px" : "8px",
                  padding: hempNodeSize(node()).stadium ? "5px 24px" : undefined,
                  background: ITEM_COLORS[node().kind].bg,
                  color: ITEM_COLORS[node().kind].ink,
                  "border-color": ITEM_COLORS[node().kind].border,
                  "box-shadow": ctx.isSelected(id)
                    ? "inset 0 0 0 3px #172b4d, inset 0 0 0 5px #ffffff"
                    : undefined,
                  "border-top": `3px solid ${ITEM_COLORS[node().kind].border}`,
                }}
              >
                <div
                  class="flex items-center justify-between"
                  style={{
                    "font-size": hempNodeSize(node()).stadium ? "14px" : "16px",
                    "line-height": hempNodeSize(node()).stadium ? "18px" : "24px",
                  }}
                >
                  <span>
                    {node().kind}
                    {node().targetKind ? ` · ${node().targetKind!.join(", ")}` : ""}
                  </span>
                  <Show when={node().kind === "crate"}>
                    <button
                      class="text-accent"
                      disabled={props.disabled}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => props.onOpen(id)}
                    >
                      Modules →
                    </button>
                  </Show>
                  <Show when={props.disclosure?.owners.has(id)}>
                    <button
                      disabled={props.disabled}
                      aria-expanded={!props.disclosure?.collapsed.has(id)}
                      aria-label={`${props.disclosure?.collapsed.has(id) ? "Expand" : "Collapse"} ${node().name}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => props.disclosure?.toggle(id)}
                    >
                      {props.disclosure?.collapsed.has(id) ? "Expand" : "Collapse"}
                    </button>
                  </Show>
                </div>
                <div
                  class={
                    hempNodeSize(node()).stadium
                      ? "truncate text-xl leading-7 font-semibold"
                      : "mt-1 line-clamp-2 break-all text-[22px] leading-7 font-semibold"
                  }
                  title={node().name}
                >
                  {node().name}
                </div>
              </div>
            </NodeContainer>
          );
        }}
      </For>
    </>
  );
}

export function HempCanvas(props: {
  doc: HempDocument;
  disabled: boolean;
  onChange: (doc: HempDocument) => void;
}) {
  const [selected, setSelected] = createSignal<string | null>(null);
  const [selectionCount, setSelectionCount] = createSignal(0);
  const [sidebarWidth, setSidebarWidth] = createSignal(360);
  const [sourceRootOverride, setSourceRootOverride] = createSignal<string>();
  const sourceRoot = () => sourceRootOverride() ?? props.doc.analysis.sourceRoot ?? "";
  let body: HTMLDivElement | undefined;
  let resizeStart: { x: number; width: number } | null = null;
  function resize(width: number) {
    setSidebarWidth(Math.max(240, Math.min(width, (body?.clientWidth || 1200) - 180)));
  }
  let canvas: CanvasRef | undefined;
  const document = createMemo(() => hempItemContainers(props.doc));
  const projection = createMemo(() => hempProjection(props.doc));
  const fallback = createMemo(() => hempLayout(props.doc));
  const crates = createMemo(() => projection().nodes.filter((n) => n.kind === "crate"));
  const crateIds = createMemo(() => new Set(crates().map((n) => n.id)));
  const overview = createMemo(() => {
    if (!crates().length) return [];
    const rect =
      props.doc.crateOverview ??
      computeBounds(
        crates().map((n) => ({
          ...(document().views.workspace?.[n.id] ?? fallback()[n.id]),
          ...hempNodeSize(n),
        })),
        { padding: 64 },
      );
    return [{ ...rect, id: CRATES, crate: CRATES, overview: true }];
  });
  const frames = createMemo<Frame[]>(() => [
    ...Object.entries(document().containers ?? {})
      .filter(
        ([id]) =>
          props.doc.projection !== "items" ||
          (!props.doc.collapsed?.includes(id) && projection().nodes.some((n) => n.id === id)),
      )
      .map(([crate, rect]) => ({
        ...rect,
        crate,
        id: frameId(crate),
        items: props.doc.projection === "items",
      })),
    ...overview(),
  ]);
  const modules = createMemo(() =>
    frames().flatMap((f) =>
      f.overview
        ? []
        : f.items
          ? props.doc.nodes.filter((n) => n.parent === f.crate)
          : hempProjection(props.doc, f.crate).nodes.filter((n) => n.kind === "module"),
    ),
  );
  const nodes = createMemo(() =>
    props.doc.projection === "items" ? projection().nodes : [...projection().nodes, ...modules()],
  );
  const parents = createMemo(() =>
    Object.fromEntries([
      ...crates().map((n) => [n.id, CRATES]),
      ...frames()
        .filter((f) => !f.overview)
        .flatMap((f) =>
          modules()
            .filter((n) =>
              f.items
                ? n.parent === f.crate
                : hempProjection(props.doc, f.crate).nodes.some((child) => child.id === n.id),
            )
            .map((n) => [n.id, f.id]),
        ),
    ]),
  );
  const positions = createMemo(() => {
    const result = { ...fallback(), ...document().views.workspace };
    for (const f of frames()) {
      result[f.id] = { x: f.x, y: f.y };
      if (f.overview) continue;
      const local = {
        ...(f.items ? {} : hempLayout(props.doc, f.crate)),
        ...document().views[f.crate],
      };
      for (const n of modules().filter((n) => parents()[n.id] === f.id))
        result[n.id] = { x: f.x + local[n.id].x, y: f.y + local[n.id].y };
    }
    return result;
  });
  function moved(changes: Record<string, { x: number; y: number }>) {
    const views: HempDocument["views"] = { ...document().views };
    const containers = { ...document().containers };
    for (const f of frames()) {
      if (f.overview) continue;
      const origin = changes[f.id] ?? f;
      containers[f.crate] = { x: origin.x, y: origin.y, width: f.width, height: f.height };
      views[f.crate] = { ...document().views[f.crate] };
      for (const n of modules().filter((n) => parents()[n.id] === f.id)) {
        const p = changes[n.id];
        if (p) views[f.crate][n.id] = { x: p.x - origin.x, y: p.y - origin.y };
      }
    }
    views.workspace = Object.fromEntries(
      projection()
        .nodes.filter((n) => !parents()[n.id] || parents()[n.id] === CRATES)
        .map((n) => [n.id, changes[n.id] ?? positions()[n.id]]),
    );
    const crateFrame = overview()[0];
    props.onChange({
      ...props.doc,
      views,
      containers,
      ...(crateFrame
        ? {
            crateOverview: {
              ...(changes[CRATES] ?? { x: crateFrame.x, y: crateFrame.y }),
              width: crateFrame.width,
              height: crateFrame.height,
            },
          }
        : {}),
    });
  }
  const selectedNode = createMemo(() => props.doc.nodes.find((n) => n.id === selected()));
  const relations = createMemo(() =>
    props.doc.projection === "items"
      ? projection()
          .edges.filter((e) => e.from === selected() || e.to === selected())
          .flatMap((e) => e.evidence.map((edge) => ({ edge, outgoing: e.from === selected() })))
      : props.doc.dependencies
          .filter((e) => e.from === selected() || e.to === selected())
          .map((edge) => ({ edge, outgoing: edge.from === selected() })),
  );
  const edges = createMemo(() =>
    [
      ...projection().edges,
      ...frames()
        .filter((f) => !f.items && !f.overview)
        .flatMap((f) =>
          hempProjection(props.doc, f.crate).edges.filter(
            (e) => parents()[e.from] && parents()[e.to],
          ),
        ),
    ]
      .filter((e) => crateIds().has(e.from) === crateIds().has(e.to))
      .map((e) => ({
        id: e.id,
        sourceId: e.from,
        targetId: e.to,
        styling: { arrowHead: true, curve: "bezier" as const, width: 2.25 },
      }))
      .concat(
        frames()
          .filter((f) => !f.overview)
          .map((f) => ({
            id: f.id,
            sourceId: f.crate,
            targetId: f.id,
            styling: {
              arrowHead: false,
              curve: "bezier" as const,
              dash: "dashed" as const,
              dashGap: 16,
              width: 3.5,
            },
          })),
      ),
  );
  function fit() {
    canvas?.fitView(
      [
        ...nodes().map((n) => ({
          ...positions()[n.id],
          ...hempNodeSize(n),
        })),
        ...frames(),
      ],
      60,
    );
  }
  function open(id: string) {
    if (props.disabled || props.doc.containers?.[id]) return;
    const local = hempLayout(props.doc, id);
    const children = hempProjection(props.doc, id).nodes.filter((n) => n.kind === "module");
    const minX = Math.min(0, ...children.map((n) => local[n.id].x));
    const minY = Math.min(0, ...children.map((n) => local[n.id].y));
    const modulePositions = Object.fromEntries(
      children.map((n) => [n.id, { x: local[n.id].x - minX + 16, y: local[n.id].y - minY + 48 }]),
    );
    const width = Math.max(
      480,
      ...Object.values(modulePositions).map((p) => p.x + HEMP_WIDTH + 16),
    );
    const height = Math.max(
      240,
      ...Object.values(modulePositions).map((p) => p.y + HEMP_HEIGHT + 16),
    );
    const cratePosition = positions()[id];
    const frame = placeAdjacent(
      { width, height },
      { x: cratePosition.x + HEMP_WIDTH + 80, y: cratePosition.y },
      [
        ...projection().nodes.map((n) => ({
          ...positions()[n.id],
          width: HEMP_WIDTH,
          height: HEMP_HEIGHT,
        })),
        ...frames(),
      ],
      48,
    );
    props.onChange({
      ...props.doc,
      containers: { ...props.doc.containers, [id]: frame },
      views: { ...props.doc.views, [id]: modulePositions },
    });
    requestAnimationFrame(fit);
  }
  onMount(() => requestAnimationFrame(fit));
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <style>{MARKDOWN_STYLE}</style>
      <div class="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-2 text-sm">
        <span>{props.doc.projection === "items" ? "Rust items" : "Crates"}</span>
        <button
          class="rounded bg-surface-alt px-3 py-1 disabled:opacity-40"
          disabled={props.disabled}
          onClick={() => {
            props.onChange(arrangeHemp(props.doc));
            requestAnimationFrame(fit);
          }}
        >
          Arrange LR
        </button>
        <button onClick={fit}>Fit</button>
        <span class="text-xs text-fg-muted">
          Consumer → dependency · {projection().nodes.length} nodes
          <Show when={props.doc.projection === "items"}>
            {" "}
            · Dashed: owner · Solid: dependency within crate or item layer
          </Show>
          <Show when={selectionCount() > 1}> · {selectionCount()} selected</Show>
        </span>
      </div>
      <div
        ref={(element) => {
          body = element;
        }}
        class="flex min-h-0 flex-1"
      >
        <div class="relative min-w-0 flex-1">
          <Canvas
            ref={(r) => {
              canvas = r;
            }}
            edges={edges()}
            boxSelect={{
              trigger: "drag",
              getNodeRects: () =>
                nodes().map((n) => ({
                  id: n.id,
                  ...positions()[n.id],
                  ...hempNodeSize(n),
                })),
            }}
            onSelectionChange={(ids) => {
              setSelected(ids[0] ?? null);
              setSelectionCount(ids.length);
            }}
          >
            <HempNodes
              nodes={nodes()}
              frames={frames()}
              parents={parents()}
              positions={positions()}
              disabled={props.disabled}
              onSelect={setSelected}
              onOpen={open}
              disclosure={
                props.doc.projection === "items"
                  ? {
                      owners: new Set(Object.keys(document().containers ?? {})),
                      collapsed: new Set(props.doc.collapsed),
                      toggle: (id) => {
                        const collapsed = new Set(props.doc.collapsed);
                        let next = document();
                        if (collapsed.has(id)) {
                          collapsed.delete(id);
                          // Hidden fallback coordinates may be from a much larger layout.
                          // Place a newly revealed frame near its visible owner.
                          const frame = next.containers?.[id];
                          const owner = positions()[id];
                          if (frame && owner && next.unplacedContainers?.includes(id)) {
                            const placed = placeAdjacent(
                              { width: frame.width, height: frame.height },
                              { x: owner.x + HEMP_WIDTH + 80, y: owner.y },
                              [
                                ...frames(),
                                ...nodes().map((n) => ({
                                  ...positions()[n.id],
                                  ...hempNodeSize(n),
                                })),
                              ],
                              48,
                            );
                            next = {
                              ...next,
                              containers: { ...next.containers, [id]: placed },
                              unplacedContainers: next.unplacedContainers.filter(
                                (key) => key !== id,
                              ),
                            };
                          }
                        } else collapsed.add(id);
                        props.onChange({ ...next, collapsed: [...collapsed] });
                        setSelected(id);
                        canvas?.setSelectedIds([id]);
                      },
                    }
                  : undefined
              }
              onMove={moved}
              onResize={(id, width, height) =>
                props.onChange({
                  ...document(),
                  ...(id === CRATES
                    ? { crateOverview: { x: overview()[0].x, y: overview()[0].y, width, height } }
                    : {
                        containers: {
                          ...document().containers,
                          [id]: { ...document().containers![id], width, height },
                        },
                      }),
                })
              }
              onClose={(id) => {
                const containers = { ...props.doc.containers };
                delete containers[id];
                props.onChange({ ...props.doc, containers });
              }}
            />
          </Canvas>
        </div>
        <div
          role="separator"
          aria-label="Resize description sidebar"
          aria-orientation="vertical"
          aria-valuenow={sidebarWidth()}
          aria-valuemin={240}
          tabindex="0"
          class="w-2 shrink-0 cursor-col-resize border-l border-border-subtle bg-surface-alt hover:bg-accent focus:bg-accent"
          style={{ "touch-action": "none" }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            resizeStart = { x: e.clientX, width: sidebarWidth() };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (resizeStart) resize(resizeStart.width + resizeStart.x - e.clientX);
          }}
          onPointerUp={(e) => {
            resizeStart = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            resizeStart = null;
          }}
          onLostPointerCapture={() => {
            resizeStart = null;
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              resize(sidebarWidth() + (e.key === "ArrowLeft" ? 24 : -24));
            }
          }}
        />
        <aside
          style={{ width: `${sidebarWidth()}px`, "max-width": "calc(100% - 180px)" }}
          class="min-w-0 shrink-0 overflow-y-auto bg-surface p-4 text-sm"
        >
          <details class="mb-4 text-xs">
            <summary>Source editor settings</summary>
            <label class="mt-2 block">
              Local repository root
              <input
                class="mt-1 w-full rounded border p-1"
                value={sourceRoot()}
                placeholder="/absolute/path/to/repository"
                onInput={(e) => setSourceRootOverride(e.currentTarget.value)}
              />
            </label>
            <p>
              Editor links open on this computer. Override the generated path if your checkout is
              elsewhere.
            </p>
          </details>
          <Show
            when={selectedNode()}
            fallback={
              <>
                <h2 class="font-semibold">Rust structure</h2>
                <p class="mt-3 text-fg-muted">
                  Select an item to read its documentation and inspect dependencies. Drag cards to
                  arrange them.
                </p>
                <details class="mt-6 text-xs text-fg-muted">
                  <summary>Analysis coverage</summary>
                  <p class="mt-2">{props.doc.analysis.scope}</p>
                  <For each={props.doc.analysis.warnings}>{(w) => <p class="mt-2">{w}</p>}</For>
                </details>
              </>
            }
          >
            {(node) => (
              <>
                <h2 class="break-words font-semibold">{node().name}</h2>
                <div class="mt-2 flex gap-3 text-xs">
                  <For each={["zed", "vscode"] as const}>
                    {(editor) => (
                      <Show
                        when={hempEditorLink(editor, sourceRoot(), node().source)}
                        fallback={<span>Set source root to open {editor}</span>}
                      >
                        {(href) => (
                          <a class="underline" href={href()}>
                            Open in {editor === "zed" ? "Zed" : "VS Code"}
                          </a>
                        )}
                      </Show>
                    )}
                  </For>
                </div>
                <p class="mt-3 break-all font-mono text-xs text-fg-muted">
                  {node().source.file}:{node().source.line}
                </p>
                <p class="mt-1 break-all font-mono text-xs text-fg-muted">{node().id}</p>
                <Show when={node().parent}>
                  <p class="mt-3 break-all text-xs">Contained in: {node().parent}</p>
                </Show>
                <div
                  class="hemp-markdown mt-4"
                  innerHTML={hempMarkdown(node().description || "No documentation comment.")}
                />
                <Show when={node().cfg?.length}>
                  <p class="mt-3 text-xs">Conditional: {node().cfg?.join(", ")}</p>
                </Show>
                <h3 class="mt-6 font-semibold">
                  {props.doc.projection === "items"
                    ? "Direct references and referrers"
                    : "Dependencies and dependents"}
                </h3>
                <For
                  each={relations()}
                  fallback={<p class="mt-2 text-fg-muted">No recorded direct dependencies.</p>}
                >
                  {({ edge, outgoing }) => (
                    <details class="mt-3 text-xs">
                      <summary class="cursor-pointer break-all">
                        {edge.kind === "call"
                          ? outgoing
                            ? "Calls"
                            : "Called by"
                          : outgoing
                            ? "Uses"
                            : "Used by"}{" "}
                        {outgoing ? edge.to : edge.from}
                        <Show when={props.doc.projection === "items"}>
                          {" "}
                          ({edge.from} → {edge.to})
                        </Show>
                      </summary>
                      <For each={edge.evidence}>
                        {(e) => (
                          <p class="mt-2 break-all font-mono">
                            {e.text}
                            <br />
                            {e.file}:{e.line}
                          </p>
                        )}
                      </For>
                    </details>
                  )}
                </For>
              </>
            )}
          </Show>
        </aside>
      </div>
    </div>
  );
}
