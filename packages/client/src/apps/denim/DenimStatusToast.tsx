import { Show } from 'solid-js';

export function DenimStatusToast(props: { message: () => string | null }) {
  return <Show when={props.message()}>
    {(message) => <div role="status" aria-live="polite"
      class="whitespace-nowrap rounded-full border border-border-subtle bg-surface/95 px-3 py-1.5 text-xs text-fg-muted shadow-sm backdrop-blur">
      {message()}
    </div>}
  </Show>;
}
