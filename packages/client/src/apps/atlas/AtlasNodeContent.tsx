import { createEffect, createSignal, For, on, Show, type JSX } from 'solid-js';
import { marked } from 'marked';
import type { AtlasColorToken, AtlasContentMode, AtlasNode } from '@luminous/core/atlas';
import type { NodeEditForm } from './mutations.ts';
import { containerHeaderHeight, leafHeight, leafWidth, MIN_CONTENT_HEIGHT, MIN_CONTENT_WIDTH } from './projection.ts';

/** Mirrors cactus's `ResizeDirection` shape (`useGesture.ts`) — the domain
 * only ever drags right/bottom (the Do NOT list defers origin-shifting
 * left/top resize), so each axis is a plain boolean instead of the full
 * left/right/top/bottom/none union. */
export interface ContentResizeDirection {
  horizontal: boolean;
  vertical: boolean;
}

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
  /** The live drag preview for this Node's content size — `undefined`
   * outside of a drag. Owned by AtlasCanvas, same pattern as color preview.
   * Either dimension may be absent: an edge grip drags one, the corner
   * grip drags both. */
  previewSize: () => { width?: number; height?: number } | undefined;
  /** Canvas zoom scale, so a screen-pixel drag maps to canvas-space size. */
  zoomScale: () => number;
  /** Fires with a live size while dragging a resize handle, and `undefined`
   * once the drag ends (including a cancelled drag). */
  onResizePreview: (size: { width?: number; height?: number } | undefined) => void;
  /** Fires once, on release, with the final size to persist. */
  onResizeCommit: (size: { width?: number; height?: number }) => void;
}

const MODES: Array<{ value: AtlasContentMode; label: string }> = [
  { value: 'markdown', label: 'MD' },
  { value: 'code', label: 'Code' },
];

/** Whether a wheel event should scroll the content element (true) rather
 * than bubble to d3-zoom for canvas zoom (false): the element must overflow
 * and have room left to scroll in the wheel's direction. */
export function shouldConsumeWheel(
  el: { scrollHeight: number; clientHeight: number; scrollTop: number },
  deltaY: number,
): boolean {
  if (el.scrollHeight <= el.clientHeight) return false;
  if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight;
  if (deltaY < 0) return el.scrollTop > 0;
  return false;
}

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
  // while resizing, else the committed size (stored override, or the fixed
  // constant for this Node's kind).
  const committedHeight = () =>
    props.hasChildren() ? containerHeaderHeight(props.node()) : leafHeight(props.node());
  const effectiveHeight = () => props.previewSize()?.height ?? committedHeight();
  const committedWidth = () => leafWidth(props.node());

  // Drags the header/body divider (container) or a leaf's bottom edge,
  // right edge, or corner, per `dir`. Raw pointer events, not cactus's
  // useGesture drag — this is the Node's own content band, not the
  // whole-Node move/resize gesture.
  function beginResize(e: PointerEvent, dir: ContentResizeDirection) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = props.previewSize()?.width ?? committedWidth();
    const startHeight = effectiveHeight();

    const handleMove = (ev: PointerEvent) => {
      const next: { width?: number; height?: number } = {};
      if (dir.horizontal) {
        const dx = (ev.clientX - startX) / props.zoomScale();
        next.width = Math.max(MIN_CONTENT_WIDTH, startWidth + dx);
      }
      if (dir.vertical) {
        const dy = (ev.clientY - startY) / props.zoomScale();
        next.height = Math.max(MIN_CONTENT_HEIGHT, startHeight + dy);
      }
      props.onResizePreview(next);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      const finalSize = props.previewSize();
      props.onResizePreview(undefined);
      if (finalSize !== undefined) props.onResizeCommit(finalSize);
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
      class={`relative flex h-full w-full flex-col gap-1 overflow-hidden rounded p-2 ${
        // Negative offset keeps the outline inside NodeContainer's overflow:hidden clip.
        props.selected() ? 'outline outline-2 -outline-offset-2 outline-accent-subtle' : ''
      }`}
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
            {/* The Content itself: a visually distinct bordered section beneath
                the title/switcher row. For a container this is the header
                band and stops there — its children draw below, in the space
                this clamp reserves for them. For a leaf it fills the rest of
                the box. The bound tracks the live resize preview, else the
                committed height. */}
            <div
              class="relative min-h-0 flex-1 overflow-hidden rounded border border-border-subtle bg-surface"
              style={{
                ...colorStyle(),
                ...(props.hasChildren() ? { 'max-height': `${effectiveHeight()}px` } : {}),
              }}
            >
              <div
                class="h-full overflow-auto p-1 pb-3"
                style={{ 'overscroll-behavior': 'contain' }}
                on:wheel={(e) => {
                  if (shouldConsumeWheel(e.currentTarget, e.deltaY)) e.stopPropagation();
                }}
              >
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
              {/* The content resize handle, a visible grip at the section's
                  bottom edge — native pointerdown so its stopPropagation
                  (beginResize) genuinely blocks NodeContainer's native
                  pointerdown during bubbling, instead of losing the race to
                  it (see the task's Do NOT list). */}
              <div
                class="absolute inset-x-0 bottom-0 flex h-3 cursor-row-resize items-end justify-center"
                data-no-pan="true"
                on:pointerdown={(e) => beginResize(e, { horizontal: false, vertical: true })}
                onDblClick={(e) => e.stopPropagation()}
              >
                <div class="mb-0.5 h-1 w-8 rounded-full bg-border-subtle" />
              </div>
            </div>
            {/* Width/diagonal grips, on the whole Node box (not the content
                band): a right-edge grip for width alone, a corner grip for
                both at once. Same native-pointerdown pattern as the height
                grip above. */}
            <div
              class="absolute inset-y-0 right-0 flex w-3 cursor-col-resize items-center justify-end"
              data-no-pan="true"
              on:pointerdown={(e) => beginResize(e, { horizontal: true, vertical: false })}
              onDblClick={(e) => e.stopPropagation()}
            >
              <div class="mr-0.5 h-8 w-1 rounded-full bg-border-subtle" />
            </div>
            <div
              class="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
              data-no-pan="true"
              on:pointerdown={(e) => beginResize(e, { horizontal: true, vertical: true })}
              onDblClick={(e) => e.stopPropagation()}
            >
              <div class="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-border-subtle" />
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
    </div>
  );
}
