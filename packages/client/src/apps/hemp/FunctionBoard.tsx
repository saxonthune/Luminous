import { For, Show, createMemo, onMount } from "solid-js";
import { Canvas, type CanvasRef } from "@luminous/cactus";
import { type FunctionInfo, type FunctionPart, type HempDocument } from "@luminous/core/hemp";
import "./functionBoard.css";

export function Part(props: {
  part: FunctionPart;
  info: FunctionInfo;
  doc: Pick<HempDocument, "nodes">;
  onReference?: (id: string) => void;
}) {
  const links = createMemo(() => props.info.connections.filter((c) => c.partId === props.part.id));
  return (
    <section class="hemp-part" data-kind={props.part.kind} data-part-id={props.part.id}>
      <header>
        <span class="hemp-part-kind">{props.part.kind}</span>
        <code>{props.part.label}</code>
        <span class="hemp-part-line">L{props.part.start.line}</span>
      </header>
      <Show when={links().length}>
        <div class="hemp-part-links">
          <For each={links()}>
            {(link) => {
              const target = () => props.doc.nodes.find((n) => n.id === link.targetId);
              return (
                <Show
                  when={props.onReference}
                  fallback={
                    <span title={`References ${target()?.name}`}>
                      {target()?.name ?? link.targetId}
                    </span>
                  }
                >
                  <button
                    title={`References ${target()?.name}`}
                    onClick={() => props.onReference?.(link.targetId)}
                  >
                    {target()?.name ?? link.targetId}
                  </button>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
      <Show when={props.part.children.length}>
        <div class="hemp-part-children">
          <For each={props.part.children}>
            {(part) => (
              <Part part={part} info={props.info} doc={props.doc} onReference={props.onReference} />
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

/** A fixed source-order board: camera movement only, no disclosure or item dragging. */
export function FunctionBoard(props: { doc: HempDocument; info: FunctionInfo }) {
  let canvas: CanvasRef | undefined;
  let board!: HTMLElement;
  const targets = createMemo(() => [...new Set(props.info.connections.map((c) => c.targetId))]);
  const bounds = () => ({ x: 0, y: 0, width: board.offsetWidth, height: board.offsetHeight });
  const fit = () => canvas?.fitView([bounds()], 40);
  onMount(() => requestAnimationFrame(() => canvas?.setView({ x: 32, y: 32, k: 0.8 })));
  return (
    <div class="hemp-function-view flex min-h-0 flex-1 flex-col">
      <nav
        aria-label="Function view"
        class="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-4 py-2 text-sm"
      >
        <strong>{props.info.name}</strong>
        <button onClick={fit}>Fit function</button>
        <button onClick={() => canvas?.focusView(bounds(), 1, false)}>100%</button>
        <span class="text-fg-muted">
          Fixed structure · pan and zoom to read · source order, not a CFG
        </span>
      </nav>
      <div class="relative min-h-0 flex-1">
        <Canvas
          ref={(value) => {
            canvas = value;
          }}
        >
          <article
            ref={(element) => {
              board = element;
            }}
            class="hemp-function-board"
          >
            <header class="hemp-function-heading">
              <p>{props.info.namespace}</p>
              <h1>{props.info.name}</h1>
              <code>{props.info.signature}</code>
              <p>
                {props.info.lineCount} source lines · bindings, expressions and branches in source
                order
              </p>
            </header>
            <div class="hemp-function-body">
              <For each={props.info.body}>
                {(part) => <Part part={part} info={props.info} doc={props.doc} />}
              </For>
            </div>
            <footer class="hemp-function-connections">
              <h2>Connections to items</h2>
              <p>Resolved references in this function. Local value flow is not included.</p>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Kind</th>
                    <th>Use locations</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={targets()}>
                    {(id) => {
                      const node = () => props.doc.nodes.find((n) => n.id === id);
                      return (
                        <tr id={`connection-${encodeURIComponent(id)}`}>
                          <td>{node()?.name}</td>
                          <td>{node()?.kind}</td>
                          <td>
                            {props.info.connections
                              .filter((c) => c.targetId === id)
                              .map((c) => `L${c.line}`)
                              .join(", ")}
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </footer>
          </article>
        </Canvas>
      </div>
    </div>
  );
}
