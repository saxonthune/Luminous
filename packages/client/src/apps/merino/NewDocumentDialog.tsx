import { createSignal, onMount } from 'solid-js';

interface NewDocumentDialogProps {
  dir: string;
  existingLabels: string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NewDocumentDialog(props: NewDocumentDialogProps) {
  const [value, setValue] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    inputRef?.focus();
  });

  const trimmed = () => value().trim();
  const isValid = () =>
    trimmed().length > 0 && !trimmed().includes('/') && !props.existingLabels.includes(trimmed());

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
        <h2 class="text-lg font-semibold text-fg">New Merino Document</h2>
        <p class="mb-4 truncate text-xs italic text-fg-muted" title={props.dir}>
          {props.dir}
        </p>
        <div class="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value()}
            onInput={(e) => setValue(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="name"
            class="flex-1 rounded border border-border-subtle bg-canvas px-2 py-1 text-sm text-fg"
          />
          <span class="text-sm text-fg-muted">.merino.json</span>
        </div>
        {trimmed().length > 0 && props.existingLabels.includes(trimmed()) && (
          <p class="mt-2 text-xs text-red-500">A document named "{trimmed()}" already exists.</p>
        )}
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
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
