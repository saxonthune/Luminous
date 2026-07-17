import { createEffect, createSignal, For, on, Show, type JSX } from 'solid-js';
import { marked } from 'marked';
import type { AtlasColorToken, AtlasContentMode, AtlasNode } from '@luminous/core/atlas';
import type { NodeEditForm } from './mutations.ts';
import { containerHeaderHeight, leafHeight, MIN_CONTENT_HEIGHT } from './projection.ts';

export interface AtlasNodeContentProps {
  node: () => AtlasNode | undefined;
  /** Whether this Node has children — a container's own content is clamped
   * to the header band so it never bleeds behind the child area (a leaf
   * fills its whole box). */
  hasChildren: () => boolean;
  /** The Color to draw this Node in — the live preview when hovering a
   * swatch, else its own `node.color`. `undefined` draws the unchanged
   * bg-surface/border-border-subtle look. */
  color: () => AtlasColorToken | undefined;
  selected: () => boolean;
  editing: () => boolean;
  onEnterEdit: () => void;
  onCommit: (form: NodeEditForm) => void;
  onCancel: () => void;
  onModeChange: (mode: AtlasContentMode) => void;
  /** The live drag preview for this Node's content height — `undefined`
   * outside of a drag. Owned by AtlasCanvas, same pattern as color preview. */
  previewHeight: () => number | undefined;
  /** Canvas zoom scale, so a screen-pixel drag maps to a canvas-space height. */
  zoomScale: () => number;
  /** Fires with a live height while dragging the resize handle, and
   * `undefined` once the drag ends (including a cancelled drag). */
  onResizePreview: (height: number | undefined) => void;
  /** Fires once, on release, with the final height to persist. */
  onResizeCommit: (height: number) => void;
}

const MODES: Array<{ value: AtlasContentMode; label: string }> = [
  { value: 'markdown', label: 'MD' },
  { value: 'code', label: 'Code' },
];

/** A quiet two-segment toggle for `content.mode`, present in read and edit
 * views alike so a reader sees a Node's declared intention without entering
 * edit mode. Writes immediately — it is not part of the edit form's commit. */
function ModeSwitcher(props: { mode: AtlasContentMode | undefined; onChange: (mode: AtlasContentMode) => void }): JSX.Element {
  return (
    <div
      class="flex w-fit shrink-0 overflow-hidden rounded border border-border-subtle text-[10px]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <For each={MODES}>
        {(m) => (
          <button
            type="button"
            class={`px-1.5 py-0.5 ${
              props.mode === m.value
                ? 'bg-accent-subtle text-fg'
                : 'bg-surface text-fg-subtle hover:bg-surface-alt'
            }`}
            onClick={() => props.onChange(m.value)}
          >
            {m.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Renders a Node's interior: a read view (name, switcher, Content drawn per
 * Mode) or, while editing, a name input and a raw text area. Double-click
 * enters edit mode; Ctrl+Enter or blurring the whole form commits; Escape
 * cancels. */
export function AtlasNodeContent(props: AtlasNodeContentProps): JSX.Element {
  const [name, setName] = createSignal('');
  const [text, setText] = createSignal('');
  let nameInput: HTMLInputElement | undefined;
  let formEl: HTMLFormElement | undefined;

  // Reset the form from the current node each time edit mode is entered, so a
  // prior cancel never leaks stale values into the next edit.
  createEffect(on(() => props.editing(), (editing) => {
    if (!editing) return;
    const node = props.node();
    setName(node?.name ?? '');
    setText(node?.content?.text ?? '');
    queueMicrotask(() => nameInput?.focus());
  }));

  function commit() {
    props.onCommit({ name: name(), text: text() });
  }

  // The value this Node's box is currently sized to: the live drag preview
  // while resizing, else the committed height (stored override, or the
  // fixed constant for this Node's kind).
  const committedHeight = () =>
    props.hasChildren() ? containerHeaderHeight(props.node()) : leafHeight(props.node());
  const effectiveHeight = () => props.previewHeight() ?? committedHeight();

  // Drags the header/body divider (container) or a leaf's bottom edge.
  // Raw pointer events, not cactus's useGesture drag — this is the
  // Node's own content band, not the whole-Node move/resize gesture.
  function beginResize(e: PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = effectiveHeight();

    const handleMove = (ev: PointerEvent) => {
      const dy = (ev.clientY - startY) / props.zoomScale();
      props.onResizePreview(Math.max(MIN_CONTENT_HEIGHT, startHeight + dy));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      const finalHeight = props.previewHeight();
      props.onResizePreview(undefined);
      if (finalHeight !== undefined) props.onResizeCommit(finalHeight);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  // The Color overrides bg-surface/border-border-subtle via inline style
  // (which always wins over the classes) rather than a dynamic Tailwind
  // class, since a `bg-atlas-${token}` string built at runtime is invisible
  // to Tailwind's static content scan.
  //
  // Fill with the muted `-container` tint (a mix toward --surface) and reserve
  // the saturated solid for the border accent — the container role/on-container
  // pattern. The tint stays near --surface, so the existing --fg/--fg-muted text
  // keeps its contrast in every theme; the solid at full saturation would blend.
  const colorStyle = (): JSX.CSSProperties => {
    const token = props.color();
    if (!token) return {};
    return {
      'background-color': `var(--color-atlas-${token}-container)`,
      'border-color': `var(--color-atlas-${token})`,
    };
  };

  return (
    <div
      class={`relative flex h-full w-full flex-col gap-1 overflow-hidden rounded border bg-surface p-2 ${
        // Negative offset keeps the outline inside NodeContainer's overflow:hidden clip.
        props.selected() ? 'border-accent-subtle outline outline-2 -outline-offset-2 outline-accent-subtle' : 'border-border-subtle'
      }`}
      style={{
        ...colorStyle(),
        // A container's own content stops at the header band — its children
        // draw below, in the space this clamp reserves for them. The bound
        // tracks the live resize preview, else the committed height.
        ...(props.hasChildren() ? { 'max-height': `${effectiveHeight()}px` } : {}),
      }}
      onDblClick={(e) => {
        if (props.editing()) return;
        e.stopPropagation();
        props.onEnterEdit();
      }}
    >
      <Show
        when={props.editing()}
        fallback={
          <>
            <div class="flex items-center justify-between gap-1">
              <div class="truncate text-sm font-semibold text-fg">{props.node()?.name}</div>
              <ModeSwitcher mode={props.node()?.content?.mode} onChange={props.onModeChange} />
            </div>
            {/* Bounded to whatever's left of the box (the header clamp for a
                container, the whole box for a leaf) and scrolls rather than
                bleeding — generalizes the code view's existing clamp. */}
            <div class="min-h-0 flex-1 overflow-auto">
              <Show when={props.node()?.content?.mode === 'markdown' ? props.node()?.content : undefined}>
                {(content) => (
                  // SECURITY: marked does not sanitize HTML; atlas documents are
                  // author-controlled workspace files, same trust class as graph data
                  // (see InfoModal.tsx).
                  <div
                    class="atlas-node-md text-xs text-fg-muted"
                    // eslint-disable-next-line solid/no-innerhtml
                    innerHTML={marked.parse(content().text, { async: false }) as string}
                  />
                )}
              </Show>
              <Show when={props.node()?.content?.mode === 'code' ? props.node()?.content : undefined}>
                {(content) => (
                  <pre class="whitespace-pre-wrap break-words rounded bg-surface-alt p-1 font-mono text-[10px] text-fg-muted">
                    {content().text}
                  </pre>
                )}
              </Show>
            </div>
          </>
        }
      >
        <form
          ref={formEl}
          data-no-pan="true"
          class="flex h-full w-full flex-col gap-1"
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              props.onCancel();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              commit();
            }
          }}
          onFocusOut={(e) => {
            const related = e.relatedTarget as Node | null;
            if (related && formEl?.contains(related)) return;
            commit();
          }}
        >
          <div class="flex items-center justify-between gap-1">
            <input
              ref={nameInput}
              class="min-w-0 flex-1 rounded border border-border-subtle bg-surface px-1 py-0.5 text-sm font-semibold text-fg"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
            <ModeSwitcher mode={props.node()?.content?.mode} onChange={props.onModeChange} />
          </div>
          <textarea
            class="flex-1 resize-none rounded border border-border-subtle bg-surface px-1 py-0.5 font-mono text-xs text-fg-muted"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </form>
      </Show>
      {/* The content-band resize handle: sits exactly at the header/body
          divider for a container, or the leaf's own bottom edge — both are
          the effective bottom of this div, since its rendered height is
          already clamped (container) or fills the box (leaf) to that value.
          stopPropagation keeps a drag here from reaching the Node's own
          move gesture (see the task's Do NOT list). */}
      <Show when={!props.editing()}>
        <div
          class="absolute inset-x-0 bottom-0 h-1.5 cursor-row-resize"
          data-no-pan="true"
          onPointerDown={(e) => beginResize(e)}
          onDblClick={(e) => e.stopPropagation()}
        />
      </Show>
    </div>
  );
}
