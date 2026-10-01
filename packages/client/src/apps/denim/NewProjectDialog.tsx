import { createSignal, onMount } from 'solid-js';

interface NewProjectDialogProps {
  root: string;
  existingNames: string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NewProjectDialog(props: NewProjectDialogProps) {
  const [name, setName] = createSignal('');
  let input: HTMLInputElement | undefined;
  onMount(() => input?.focus());
  const value = () => name().trim();
  const duplicate = () => props.existingNames.includes(`${value()}.denim.sqlite`);
  const valid = () => value().length > 0 && !/[\\/]/.test(value()) && !duplicate();

  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && valid()) props.onSubmit(value());
    if (event.key === 'Escape') props.onCancel();
  }

  return <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onCancel}>
    <div class="w-full max-w-sm rounded-lg border border-border-subtle bg-surface p-6 shadow-lg" onClick={(event) => event.stopPropagation()}>
      <h2 class="mb-4 text-lg font-semibold text-fg">New Denim project</h2>
      <div class="flex items-center gap-2">
        <input ref={input} value={name()} onInput={(event) => setName(event.currentTarget.value)} onKeyDown={keyDown}
          placeholder="Project name" aria-label="Project name"
          class="min-w-0 flex-1 rounded border border-border-subtle bg-canvas px-2 py-1.5 text-sm text-fg" />
        <span class="text-xs text-fg-muted">.denim.sqlite</span>
      </div>
      <p class="mt-2 truncate text-xs text-fg-muted" title={props.root}>{props.root}</p>
      {duplicate() && <p class="mt-2 text-xs text-red-500">A project with that name already exists.</p>}
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" onClick={props.onCancel} class="rounded px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-alt">Cancel</button>
        <button type="button" disabled={!valid()} onClick={() => props.onSubmit(value())}
          class="rounded bg-accent px-3 py-1.5 text-sm text-on-accent hover:bg-accent-hover disabled:opacity-50">Create</button>
      </div>
    </div>
  </div>;
}
