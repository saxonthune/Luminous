import {
  For,
  Show,
  createMemo,
  createSignal,
  createResource,
  createEffect,
  onMount,
  onCleanup,
} from "solid-js";
import {
  Canvas,
  useCanvasContext,
  resolveAbsolutePositionByParentOf,
  visibleRects,
  type CanvasRef,
  type EdgeDeclaration,
} from "@luminous/cactus";
import {
  indexHempMap,
  validateFunctionInfo,
  type HempMap as MapDocument,
  type MapItem,
  type FunctionChunk,
} from "@luminous/core/hemp";
import { presentMapItem } from "./mapPresentation";
import { Part } from "./FunctionBoard";
import { MapDetails } from "./MapDetails";
import "./hempMap.css";

function FunctionContents(props: {
  item: MapItem;
  doc: MapDocument;
  load: (name: string) => Promise<FunctionChunk>;
  focus: (id: string) => void;
}) {
  const [chunk, { refetch }] = createResource(() => props.item.functionFile, props.load);
  return (
    <Show
      when={!chunk.error}
      fallback={
        <p role="alert">
          Function load failed. <button onClick={() => void refetch()}>Retry</button>
        </p>
      }
    >
      <Show when={chunk()} fallback={<p role="status">Loading function…</p>} keyed>
        {(value) => (
          <>
            <code class="hemp-map-signature">{value.info.signature}</code>
            <div class="hemp-function-body">
              <For each={value.info.body}>
                {(part) => (
                  <Part
                    part={part}
                    info={value.info}
                    doc={{ nodes: props.doc.items }}
                    onReference={props.focus}
                  />
                )}
              </For>
            </div>
          </>
        )}
      </Show>
    </Show>
  );
}

export function HempMapView(props: { doc: MapDocument; sourceId: string }) {
  // Parent mounts this view keyed by artifact snapshot.
  const index = indexHempMap(props.doc);
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal<string>();
  const [direction, setDirection] = createSignal<"dependencies" | "usages">("dependencies");
  const [size, setSize] = createSignal({ width: 1200, height: 800 });
  const [edges, setEdges] = createSignal<EdgeDeclaration[]>([]);
  let host!: HTMLDivElement;
  let canvas: CanvasRef | undefined;
  const positions = new Map(Object.entries(props.doc.layout));
  const parents = new Map(props.doc.items.filter((n) => n.parent).map((n) => [n.id, n.parent!]));
  const rects = props.doc.items.map((item) => ({
    id: item.id,
    ...props.doc.layout[item.id],
    ...resolveAbsolutePositionByParentOf(item.id, positions, parents),
  }));
  const rectById = new Map(rects.map((r) => [r.id, r]));
  const containerIds = new Set(parents.values());
  const results = createMemo(() => index.search(query()));
  const neighborhood = createMemo(() =>
    selected() ? index.neighborhood(selected()!, direction()) : undefined,
  );
  const lit = createMemo(() => {
    const ids = new Set(neighborhood()?.ids);
    for (const id of ids) {
      const parent = parents.get(id);
      if (parent) ids.add(parent);
    }
    return ids;
  });
  const selectItem = (id: string) => {
    setSelected(id);
    const item = index.byId.get(id)!;
    setDirection(["function", "method"].includes(item.kind) ? "dependencies" : "usages");
  };
  const focus = (id: string) => {
    selectItem(id);
    setQuery("");
    const rect = rectById.get(id)!;
    canvas?.focusView({ ...rect, height: Math.min(rect.height, 850) }, 0.65, false);
  };
  const fit = () =>
    canvas?.fitView(
      rects.filter((r) => !parents.has(r.id)),
      50,
    );
  const fitConnections = () =>
    canvas?.fitView(
      [...neighborhood()!.ids].map((id) => ({ ...rectById.get(id)!, height: 160 })),
      60,
    );
  // Content-addressed chunks are immutable; bound the body cache independently of the index.
  const cache = new Map<string, Promise<FunctionChunk>>();
  const itemIds = new Set(index.byId.keys());
  async function load(name: string): Promise<FunctionChunk> {
    if (cache.has(name)) {
      const hit = cache.get(name)!;
      cache.delete(name);
      cache.set(name, hit);
      return hit;
    }
    const path = props.sourceId.slice(0, props.sourceId.lastIndexOf("/") + 1) + name;
    const pending = fetch(
      __STATIC__
        ? `${import.meta.env.BASE_URL}canvases/${path}`
        : `/api/document/${encodeURIComponent(path)}`,
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const chunk = (await response.json()) as FunctionChunk;
        if (chunk.format !== "hemp2-function") throw new Error("Invalid function chunk");
        validateFunctionInfo(chunk.info, itemIds);
        return chunk;
      })
      .catch((error) => {
        cache.delete(name);
        throw error;
      });
    cache.set(name, pending);
    if (cache.size > 32) cache.delete(cache.keys().next().value!);
    return pending;
  }
  onMount(() => {
    const observer = new ResizeObserver(() =>
      setSize({ width: host.clientWidth, height: host.clientHeight }),
    );
    observer.observe(host);
    onCleanup(() => observer.disconnect());
    const frame = requestAnimationFrame(fit);
    onCleanup(() => cancelAnimationFrame(frame));
  });
  function Scene() {
    const ctx = useCanvasContext();
    // Register lightweight rectangles, not a DOM subtree for every item.
    for (const r of rects)
      ctx.registerNodeRect(r.id, { x: r.x, y: r.y, w: r.width, h: Math.min(r.height, 100) });
    onCleanup(() => {
      for (const r of rects) ctx.unregisterNodeRect(r.id);
    });
    const visible = createMemo(() => visibleRects(rects, ctx.transform(), size()), undefined, {
      equals: (a, b) => a.length === b.length && a.every((r, i) => r === b[i]),
    });
    const visibleIds = createMemo(() => new Set(visible().map((r) => r.id)));
    const projectedEdges = createMemo(() => {
      const candidates =
        neighborhood()?.edges ??
        props.doc.references.filter((e) => visibleIds().has(e.from) && visibleIds().has(e.to));
      return candidates.map((e, i) => ({
        id: `reference:${i}`,
        sourceId: e.from,
        targetId: e.to,
        styling: { arrowHead: true, width: selected() ? 3 : 1.5, curve: "bezier" as const },
      }));
    });
    // Bridge the child's viewport-dependent projection into Canvas's edge declarations.
    createEffect(() => setEdges(projectedEdges()));
    return (
      <For each={visible()}>
        {(rect) => {
          const item = index.byId.get(rect.id)!;
          const presentation = presentMapItem(item);
          const container = containerIds.has(item.id);
          return (
            <article
              class="hemp-map-item"
              classList={{
                "hemp-map-container": container,
                "hemp-map-dim": !!selected() && !lit().has(item.id),
                "hemp-map-selected": selected() === item.id,
              }}
              data-map-item={item.id}
              data-kind={item.kind}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest("button, a")) selectItem(item.id);
              }}
              style={{
                left: `${rect.x}px`,
                top: `${rect.y}px`,
                width: `${rect.width}px`,
                "min-height": `${rect.height}px`,
                "background-color": presentation.color,
                "z-index": container ? -1 : 1,
              }}
            >
              <header>
                <button onClick={() => focus(item.id)} title={item.namespace}>
                  {presentation.title}
                </button>
                <span>{presentation.subtitle}</span>
              </header>
              <Show when={item.functionFile}>
                <FunctionContents item={item} doc={props.doc} load={load} focus={focus} />
              </Show>
            </article>
          );
        }}
      </For>
    );
  }
  return (
    <div class="hemp-map flex min-h-0 flex-1 flex-col">
      <nav aria-label="Code map" class="hemp-map-toolbar">
        <div class="hemp-map-search">
          <input
            type="search"
            aria-label="Search symbols"
            placeholder="Search symbols…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results()[0]) focus(results()[0].id);
              if (e.key === "Escape") setQuery("");
            }}
          />
          <Show when={query().trim()}>
            <div class="hemp-map-results">
              <For each={results()} fallback={<p>No matching symbols</p>}>
                {(item) => (
                  <button onClick={() => focus(item.id)}>
                    <strong>{item.name}</strong>
                    <small>
                      {item.kind} · {item.namespace}
                    </small>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
        <button onClick={fit}>Fit map</button>
        <Show when={selected()}>
          <strong>{index.byId.get(selected()!)?.name}</strong>
          <select
            aria-label="Relationships"
            value={direction()}
            onChange={(e) => setDirection(e.currentTarget.value as "dependencies" | "usages")}
          >
            <option value="dependencies">Dependencies</option>
            <option value="usages">Usages</option>
          </select>
          <button onClick={fitConnections}>Fit connections</button>
          <button onClick={() => setSelected(undefined)}>Clear focus</button>
          <span>{neighborhood()?.edges.length} direct references</span>
        </Show>
      </nav>
      <div class="flex min-h-0 flex-1">
        <div
          ref={(element) => {
            host = element;
          }}
          class="relative min-h-0 flex-1"
        >
          <Canvas
            ref={(value) => {
              canvas = value;
            }}
            viewportOptions={{ minZoom: 0.005, maxZoom: 2 }}
            edges={edges()}
          >
            <Scene />
          </Canvas>
        </div>
        <MapDetails doc={props.doc} item={selected() ? index.byId.get(selected()!) : undefined} />
      </div>
    </div>
  );
}
