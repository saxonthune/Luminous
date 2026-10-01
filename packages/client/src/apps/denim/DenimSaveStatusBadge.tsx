import { Show } from 'solid-js';
import { Check, LoaderCircle } from 'lucide-solid';

export function DenimSaveStatusBadge(props: { saving: () => boolean; error: () => string | null }) {
  return (
    <Show when={!props.error()}>
      <div role="status" aria-live="polite" aria-label={props.saving() ? 'Saving' : 'Saved'}
        title={props.saving() ? 'Saving' : 'Saved'}
        class="pointer-events-none absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-surface/95 text-fg-muted shadow-sm backdrop-blur">
        <Show when={props.saving()} fallback={<Check size={15} strokeWidth={2} />}>
          <LoaderCircle size={15} strokeWidth={1.8} class="animate-spin" />
        </Show>
      </div>
    </Show>
  );
}
