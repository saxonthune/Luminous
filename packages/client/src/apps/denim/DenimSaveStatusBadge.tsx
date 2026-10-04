import { Show } from 'solid-js';
import Check from 'lucide-solid/icons/check';
import LoaderCircle from 'lucide-solid/icons/loader-circle';
import { StatusBadge } from '../../ui';

export function DenimSaveStatusBadge(props: { saving: () => boolean; error: () => string | null }) {
  return (
    <Show when={!props.error()}>
      <StatusBadge label={props.saving() ? 'Saving' : 'Saved'} class="is-passive">
        <Show when={props.saving()} fallback={<Check size={15} strokeWidth={2} />}>
          <LoaderCircle size={15} strokeWidth={1.8} class="lui-save-spinner" />
        </Show>
      </StatusBadge>
    </Show>
  );
}
