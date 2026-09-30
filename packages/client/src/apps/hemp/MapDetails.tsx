import { For, Show, createSignal } from "solid-js";
import type { HempMap, MapItem } from "@luminous/core/hemp";
import { hempEditorLink } from "./editorLinks";
import { hempMarkdown, MARKDOWN_STYLE } from "./markdown";

/** Screen-space details; independent of the canvas's camera and rendering budget. */
export function MapDetails(props: { doc: HempMap; item?: MapItem }) {
  const [width, setWidth] = createSignal(360);
  const [rootOverride, setRootOverride] = createSignal<string>();
  const root = () => rootOverride() ?? props.doc.analysis.sourceRoot;
  let drag: { x: number; width: number } | undefined;
  const resize = (value: number) =>
    setWidth(Math.max(240, Math.min(window.innerWidth - 180, value)));
  return (
    <>
      <style>{MARKDOWN_STYLE}</style>
      <div
        role="separator"
        aria-label="Resize description sidebar"
        aria-orientation="vertical"
        aria-valuenow={width()}
        aria-valuemin={240}
        tabindex="0"
        class="hemp-map-divider"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          drag = { x: e.clientX, width: width() };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag) resize(drag.width + drag.x - e.clientX);
        }}
        onPointerUp={(e) => {
          drag = undefined;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag = undefined;
        }}
        onLostPointerCapture={() => {
          drag = undefined;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            resize(width() + (e.key === "ArrowLeft" ? 24 : -24));
          }
        }}
      />
      <aside aria-label="Item details" class="hemp-map-details" style={{ width: `${width()}px` }}>
        <Show
          when={props.item}
          fallback={
            <>
              <h2>Item details</h2>
              <p>Select an item to read its documentation and open its source.</p>
            </>
          }
        >
          {(item) => (
            <>
              <h2>{item().name}</h2>
              <div class="hemp-map-editor-links">
                <For each={["vscode", "zed"] as const}>
                  {(editor) => (
                    <Show
                      when={hempEditorLink(editor, root(), item().source)}
                      fallback={<span>Set a local source root to open {editor}.</span>}
                    >
                      {(href) => (
                        <a href={href()}>Open in {editor === "zed" ? "Zed" : "VS Code"}</a>
                      )}
                    </Show>
                  )}
                </For>
              </div>
              <p>
                {item().kind}
                {item().lineCount !== undefined ? ` · ${item().lineCount} source lines` : ""}
              </p>
              <p class="font-mono text-xs">{item().namespace}</p>
              <p class="font-mono text-xs">
                {item().source.file}:{item().source.line}:{item().source.column ?? 1}
              </p>
              <div
                class="hemp-markdown"
                innerHTML={hempMarkdown(item().description || "No documentation comment.")}
              />
              <Show when={item().cfg?.length}>
                <p>Conditional: {item().cfg?.join(", ")}</p>
              </Show>
            </>
          )}
        </Show>
        <details>
          <summary>Source editor settings</summary>
          <label>
            Local repository root
            <input value={root()} onInput={(e) => setRootOverride(e.currentTarget.value)} />
          </label>
          <p>Use your local checkout path if it differs from the generated source root.</p>
        </details>
        <details>
          <summary>Analysis coverage</summary>
          <For each={props.doc.analysis.warnings}>{(warning) => <p>{warning}</p>}</For>
        </details>
      </aside>
    </>
  );
}
