import { createEffect, createSignal, For, on, Show, type JSX } from 'solid-js';
import { marked } from 'marked';
import type { AtlasColorToken, AtlasContentMode, AtlasNode } from '@luminous/core/atlas';
import type { NodeEditForm } from './mutations.ts';

export interface AtlasNodeContentProps {
  node: () => AtlasNode | undefined;
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

  // The Color overrides bg-surface/border-border-subtle via inline style
  // (which always wins over the classes) rather than a dynamic Tailwind
  // class, since a `bg-atlas-${token}` string built at runtime is invisible
  // to Tailwind's static content scan.
  const colorStyle = (): JSX.CSSProperties => {
    const token = props.color();
    if (!token) return {};
    const solid = `var(--color-atlas-${token})`;
    return { 'background-color': solid, 'border-color': solid };
  };

  return (
    <div
      class={`flex h-full w-full flex-col gap-1 overflow-hidden rounded border bg-surface p-2 ${
        // Negative offset keeps the outline inside NodeContainer's overflow:hidden clip.
        props.selected() ? 'border-accent-subtle outline outline-2 -outline-offset-2 outline-accent-subtle' : 'border-border-subtle'
      }`}
      style={colorStyle()}
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
                <pre class="max-h-16 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-alt p-1 font-mono text-[10px] text-fg-muted">
                  {content().text}
                </pre>
              )}
            </Show>
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
