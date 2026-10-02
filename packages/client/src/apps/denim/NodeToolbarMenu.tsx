import { createSignal, onCleanup, onMount, type ParentProps } from 'solid-js';
import { Portal } from 'solid-js/web';

interface NodeToolbarMenuProps extends ParentProps {
  anchor: HTMLElement | undefined;
  alignRight?: boolean;
  side?: 'bottom' | 'right';
  relatedMenus?: Set<HTMLElement>;
  label: string;
  onClose: () => void;
}

export function NodeToolbarMenu(props: NodeToolbarMenuProps) {
  let menu: HTMLDivElement | undefined;
  let frame = 0;
  const [position, setPosition] = createSignal<{ left: number; top: number }>();

  function closeOnOutsidePointer(event: PointerEvent) {
    const target = event.target;
    if (target instanceof Node && (menu?.contains(target) || props.anchor?.contains(target)
      || [...(props.relatedMenus ?? [])].some((root) => root.contains(target)))) return;
    props.onClose();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    props.onClose();
    props.anchor?.focus();
  }

  onMount(() => {
    frame = requestAnimationFrame(() => {
      if (!menu || !props.anchor) return;
      const anchor = props.anchor.getBoundingClientRect();
      const bounds = menu.getBoundingClientRect();
      let left: number;
      let top: number;
      if (props.side === 'right') {
        left = anchor.right + 4;
        if (left + bounds.width > window.innerWidth - 8) left = anchor.left - bounds.width - 4;
        left = Math.max(8, left);
        top = Math.max(8, Math.min(anchor.top, window.innerHeight - bounds.height - 8));
      } else {
        left = Math.max(8, Math.min(
          props.alignRight ? anchor.right - bounds.width : anchor.left,
          window.innerWidth - bounds.width - 8,
        ));
        top = Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - bounds.height - 8));
      }
      setPosition({ left, top });
    });
    if (menu) props.relatedMenus?.add(menu);
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', onKeyDown, true);
  });

  onCleanup(() => {
    cancelAnimationFrame(frame);
    if (menu) props.relatedMenus?.delete(menu);
    document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
    document.removeEventListener('keydown', onKeyDown, true);
  });

  return <Portal mount={document.body}>
    <div ref={menu} role="menu" aria-label={props.label}
      class="fixed z-[1001] min-w-36 rounded-md border border-border-subtle bg-surface p-1 shadow-lg"
      style={{ left: `${position()?.left ?? 0}px`, top: `${position()?.top ?? 0}px`, visibility: position() ? 'visible' : 'hidden' }}
      onPointerDown={(event) => event.stopPropagation()}>
      {props.children}
    </div>
  </Portal>;
}
