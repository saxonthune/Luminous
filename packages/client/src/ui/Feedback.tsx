import { Show, type JSX, type ParentProps } from 'solid-js';

export function StatusMessage(props: ParentProps<{ message: JSX.Element; class?: string }>): JSX.Element {
  return <Show when={props.message}>
    <div role="status" aria-live="polite" class={`lui-status-message${props.class ? ` ${props.class}` : ''}`}>
      {props.message}
    </div>
  </Show>;
}

export function ToastCard(props: ParentProps<{ message: JSX.Element; onDismiss?: () => void; role?: 'status' | 'alert' }>): JSX.Element {
  return <div class="lui-toast-card" role={props.role ?? 'status'} aria-live={props.role === 'alert' ? 'assertive' : 'polite'}>
    <span class="lui-toast-card__message">{props.message}</span>
    <Show when={props.onDismiss}>
      <button type="button" class="lui-icon-button lui-toast-card__dismiss" aria-label="Dismiss notification" onClick={props.onDismiss}>×</button>
    </Show>
  </div>;
}

export function StatusBadge(props: ParentProps<{ label: string; title?: string; class?: string }>): JSX.Element {
  return <div role="status" aria-live="polite" aria-label={props.label} title={props.title ?? props.label}
    class={`lui-status-badge${props.class ? ` ${props.class}` : ''}`}>
    {props.children}
  </div>;
}
