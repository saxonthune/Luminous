import { createSignal, onMount } from 'solid-js';
import type { CanvasSource } from '../../sources';

interface RenameDialogProps {
  source: CanvasSource;
  onSubmit: (newSlug: string) => void;
  onCancel: () => void;
}

export function RenameDialog(props: RenameDialogProps) {
  const [value, setValue] = createSignal(props.source.label);
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    inputRef?.focus();
    inputRef?.select();
  });

  const trimmed = () => value().trim();
  const isValid = () =>
    trimmed().length > 0 && trimmed() !== props.source.label && !trimmed().includes('/');

  function submit() {
    if (!isValid()) return;
    props.onSubmit(trimmed());
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') props.onCancel();
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => props.onCancel()}>
      <div
        class="w-full max-w-sm rounded-lg border border-border-subtle bg-surface p-6"
        style={{ 'box-shadow': 'var(--shadow-sm)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="mb-4 text-lg font-semibold text-fg">Rename</h2>
        <div class="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value()}
            onInput={(e) => setValue(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            class="flex-1 rounded border border-border-subtle bg-canvas px-2 py-1 text-sm text-fg"
          />
          <span class="text-sm text-fg-muted">.dataflow.json</span>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button
            onClick={() => props.onCancel()}
            class="rounded px-3 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!isValid()}
            class="rounded bg-accent px-3 py-1 text-sm text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
