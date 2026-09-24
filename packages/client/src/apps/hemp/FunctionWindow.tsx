import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { useGesture } from "@luminous/cactus";
import {
  functionResources,
  type FunctionChunk,
  type FunctionPart,
  type HempMap,
  type MapItem,
} from "@luminous/core/hemp";
import { presentMapItem } from "./mapPresentation";
import "./functionBoard.css";

/** Screen-space inspector: moving it never moves the soldered item on the map. */
export function FunctionWindow(props: {
  item: MapItem;
  doc: HempMap;
  load: (name: string) => Promise<FunctionChunk>;
  focus: (id: string) => void;
  close: () => void;
}) {
  const [position, setPosition] = createSignal({ x: 24, y: 24 });
  let start = position();
  const move = (_: string, dx: number, dy: number) =>
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 120, start.x + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 160, start.y + dy)),
    });
  const gesture = useGesture({
    zoomScale: () => 1,
    callbacks: {
      onDragStart: () => {
        start = position();
      },
      onDrag: move,
      onDragEnd: move,
    },
  });
  const [chunk, { refetch }] = createResource(() => props.item.functionFile, props.load);
  const groups = createMemo(() =>
    chunk() ? functionResources(chunk()!.info) : new Map<string, string[]>(),
  );
  const items = new Map(props.doc.items.map((item) => [item.id, item]));
  function Resources(p: { owner: string }) {
    return (
      <Show when={groups().get(p.owner)?.length}>
        <div class="hemp-resource-block" data-resource-owner={p.owner}>
          <small>
            {p.owner === props.item.id ? "Function / shared resources" : "Branch resources"}
          </small>
          <div>
            <For each={groups().get(p.owner)}>
              {(id) => {
                const item = items.get(id)!;
                return (
                  <button
                    style={{ "background-color": presentMapItem(item).color }}
                    title={item.namespace}
                    onClick={() => props.focus(id)}
                  >
                    {item.name} <small>{item.kind}</small>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    );
  }
  function OrderedPart(p: { part: FunctionPart }) {
    return (
      <section class="hemp-part" data-kind={p.part.kind} data-part-id={p.part.id}>
        <header>
          <span class="hemp-part-kind">{p.part.kind}</span>
          <code>{p.part.label}</code>
          <small>L{p.part.start.line}</small>
        </header>
        <Resources owner={p.part.id} />
        <Show when={p.part.children.length}>
          <div class="hemp-part-children">
            <For each={p.part.children}>{(part) => <OrderedPart part={part} />}</For>
          </div>
        </Show>
      </section>
    );
  }
  return (
    <section
      class="hemp-function-window"
      role="dialog"
      aria-label={`Control flow: ${props.item.name}`}
      style={{ left: `${position().x}px`, top: `${position().y}px` }}
    >
      <header
        class="hemp-window-handle"
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest("button")) gesture.beginPress(props.item.id, e);
        }}
      >
        <strong>{props.item.name} · control flow</strong>
        <button aria-label="Close control flow" onClick={props.close}>
          ×
        </button>
      </header>
      <div class="hemp-window-content">
        <p>
          Ordered syntax · resolved item references only; local-variable usage is not yet extracted.
        </p>
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
                <Resources owner={props.item.id} />
                <div class="hemp-function-body">
                  <For each={value.info.body}>{(part) => <OrderedPart part={part} />}</For>
                </div>
              </>
            )}
          </Show>
        </Show>
      </div>
    </section>
  );
}
