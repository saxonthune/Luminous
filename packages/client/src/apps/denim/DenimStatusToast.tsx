import { Show } from 'solid-js';
import { StatusMessage } from '../../ui';

export function DenimStatusToast(props: { message: () => string | null }) {
  return <Show when={props.message()}>{(message) => <StatusMessage message={message()} />}</Show>;
}
