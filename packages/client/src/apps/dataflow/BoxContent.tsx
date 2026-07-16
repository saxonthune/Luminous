import { createEffect, createSignal, on, Show, type JSX } from 'solid-js';
import { marked } from 'marked';
import type { DataflowBox } from '@luminous/core/dataflow';
import type { BoxEditForm } from './mutations';

export interface BoxContentProps {
  box: () => DataflowBox | undefined;
  selected: () => boolean;
  editing: () => boolean;
  onEnterEdit: () => void;
  onCommit: (form: BoxEditForm) => void;
  onCancel: () => void;
}

/** Renders a Box's interior: a read view (markdown description) or, while
 * editing, a plain form. Double-click enters edit mode; Ctrl+Enter or
 * blurring the whole form commits; Escape cancels.
 */
export function BoxContent(props: BoxContentProps): JSX.Element {
  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [contractFormat, setContractFormat] = createSignal('');
  const [contractText, setContractText] = createSignal('');
  let nameInput: HTMLInputElement | undefined;
  let formEl: HTMLFormElement | undefined;

  // Reset the form from the current box each time edit mode is entered, so a
  // prior cancel never leaks stale values into the next edit.
  createEffect(on(() => props.editing(), (editing) => {
    if (!editing) return;
    const box = props.box();
    setName(box?.name ?? '');
    setDescription(box?.description ?? '');
    setContractFormat(box?.contract?.format ?? '');
    setContractText(box?.contract?.text ?? '');
    queueMicrotask(() => nameInput?.focus());
  }));

  function commit() {
    props.onCommit({
      name: name(),
      description: description(),
      contractFormat: contractFormat(),
      contractText: contractText(),
    });
  }

  return (
    <div
      class={`flex h-full w-full flex-col gap-1 overflow-hidden rounded border bg-surface p-2 ${
        // Negative offset keeps the outline inside NodeContainer's overflow:hidden clip.
        props.selected() ? 'border-accent-subtle outline outline-2 -outline-offset-2 outline-accent-subtle' : 'border-border-subtle'
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
            <div class="text-sm font-semibold text-fg">{props.box()?.name}</div>
            <Show when={props.box()?.description}>
              {/* SECURITY: marked does not sanitize HTML; dataflow documents are
                  author-controlled workspace files, same trust class as graph data
                  (see InfoModal.tsx). */}
              <div
                class="dataflow-box-md text-xs text-fg-muted"
                // eslint-disable-next-line solid/no-innerhtml
                innerHTML={marked.parse(props.box()!.description!, { async: false }) as string}
              />
            </Show>
            <Show when={props.box()?.contract}>
              <div class="mt-auto">
                <div class="text-[10px] uppercase tracking-wide text-fg-subtle">
                  {props.box()?.contract?.format}
                </div>
                <pre class="max-h-16 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-alt p-1 text-[10px] text-fg-muted">
                  {props.box()?.contract?.text}
                </pre>
              </div>
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
          <input
            ref={nameInput}
            class="rounded border border-border-subtle bg-surface px-1 py-0.5 text-sm font-semibold text-fg"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <textarea
            class="flex-1 resize-none rounded border border-border-subtle bg-surface px-1 py-0.5 text-xs text-fg-muted"
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
          <input
            class="rounded border border-border-subtle bg-surface px-1 py-0.5 text-[10px] uppercase tracking-wide text-fg-subtle"
            placeholder="format"
            value={contractFormat()}
            onInput={(e) => setContractFormat(e.currentTarget.value)}
          />
          <textarea
            class="max-h-16 resize-none rounded border border-border-subtle bg-surface-alt px-1 py-0.5 font-mono text-[10px] text-fg-muted"
            placeholder="contract text"
            value={contractText()}
            onInput={(e) => setContractText(e.currentTarget.value)}
          />
        </form>
      </Show>
    </div>
  );
}
