import { createUniqueId, onCleanup, onMount, type JSX, type ParentProps } from 'solid-js';

export interface DialogShellProps extends ParentProps {
  label: string;
  title?: string;
  initialFocus?: () => HTMLElement | undefined;
  closeOnBackdrop?: boolean;
  onDismiss?: () => void;
}

export function DialogShell(props: DialogShellProps): JSX.Element {
  const titleId = createUniqueId();
  let backdrop: HTMLDivElement | undefined;
  let frame = 0;
  let previousFocus: HTMLElement | null = null;

  function onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && props.onDismiss) {
      event.preventDefault();
      event.stopPropagation();
      props.onDismiss();
      return;
    }
    if (event.key !== 'Tab' || !backdrop) return;
    const focusable = [...backdrop.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )];
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !backdrop.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !backdrop.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    frame = requestAnimationFrame(() => {
      (props.initialFocus?.() ?? backdrop?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))?.focus();
    });
    document.addEventListener('keydown', onKeyDown, true);
  });

  onCleanup(() => {
    cancelAnimationFrame(frame);
    document.removeEventListener('keydown', onKeyDown, true);
    previousFocus?.focus();
  });

  return <div ref={backdrop} class="lui-dialog-backdrop" role="presentation"
    onClick={(event) => {
      if (event.target === event.currentTarget && props.closeOnBackdrop !== false) props.onDismiss?.();
    }}>
    <section role="dialog" tabIndex={-1} aria-modal="true" aria-label={props.title ? undefined : props.label}
      aria-labelledby={props.title ? titleId : undefined} class="lui-dialog-panel">
      {props.title && <h2 id={titleId} class="lui-dialog-title">{props.title}</h2>}
      {props.children}
    </section>
  </div>;
}
