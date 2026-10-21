import { createSignal, onCleanup, onMount, Show, splitProps, type JSX, type ParentProps } from 'solid-js';
import { Portal } from 'solid-js/web';
import { computeAnchoredPosition } from './positioning';

export interface AnchoredMenuProps extends ParentProps {
  anchor: HTMLElement | undefined;
  label: string;
  role?: 'menu' | 'dialog';
  side?: 'bottom' | 'right';
  alignRight?: boolean;
  relatedMenus?: Set<HTMLElement>;
  initialFocus?: boolean;
  class?: string;
  onClose: () => void;
}

/** A screen-space menu panel anchored to a control, with shared dismissal and placement. */
export function AnchoredMenu(props: AnchoredMenuProps): JSX.Element {
  let panel: HTMLDivElement | undefined;
  let frame = 0;
  let positionObserver: ResizeObserver | undefined;
  const [position, setPosition] = createSignal<{ left: number; top: number }>();

  function updatePosition(): void {
    if (!panel || !props.anchor) return;
    const anchor = props.anchor.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    setPosition(computeAnchoredPosition(anchor, bounds, {
      width: window.innerWidth,
      height: window.innerHeight,
    }, { side: props.side, alignRight: props.alignRight }));
  }

  function closeOnOutsidePointer(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Node && (panel?.contains(target) || props.anchor?.contains(target)
      || [...(props.relatedMenus ?? [])].some((root) => root.contains(target)))) return;
    props.onClose();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || !panel) return;
    const menuItems = [...panel.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')];
    const activeIndex = menuItems.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      if (!menuItems.length) return;
      event.preventDefault();
      event.stopPropagation();
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? menuItems.length - 1
          : event.key === 'ArrowDown' ? (activeIndex + 1) % menuItems.length
            : (activeIndex <= 0 ? menuItems.length : activeIndex) - 1;
      menuItems[nextIndex]?.focus();
      return;
    }
    if (event.key !== 'Escape' && !(props.side === 'right' && event.key === 'ArrowLeft')) return;
    event.preventDefault();
    event.stopPropagation();
    props.onClose();
    props.anchor?.focus();
  }

  onMount(() => {
    frame = requestAnimationFrame(() => {
      updatePosition();
      if (props.initialFocus) panel?.querySelector<HTMLElement>(props.role === 'dialog' ? 'button:not(:disabled)' : '[role^="menuitem"]:not(:disabled)')?.focus();
    });
    if (panel) props.relatedMenus?.add(panel);
    if (typeof ResizeObserver !== 'undefined') {
      positionObserver = new ResizeObserver(updatePosition);
      if (panel) positionObserver.observe(panel);
      if (props.anchor) positionObserver.observe(props.anchor);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
  });

  onCleanup(() => {
    cancelAnimationFrame(frame);
    if (panel) props.relatedMenus?.delete(panel);
    positionObserver?.disconnect();
    document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', updatePosition);
    document.removeEventListener('scroll', updatePosition, true);
  });

  return <Portal mount={document.body}>
    <div ref={panel} role={props.role ?? 'menu'} aria-label={props.label} class={`lui-menu-panel${props.class ? ` ${props.class}` : ''}`}
      style={{ left: `${position()?.left ?? 0}px`, top: `${position()?.top ?? 0}px`, visibility: position() ? 'visible' : 'hidden' }}
      on:pointerdown={(event) => event.stopPropagation()}>
      {props.children}
    </div>
  </Portal>;
}

type MenuItemProps = ParentProps<JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  selected?: boolean;
}>;

export function MenuItem(props: MenuItemProps): JSX.Element {
  const [local, rest] = splitProps(props, ['children', 'class', 'danger', 'selected', 'role']);
  return <button type="button" role={local.role ?? 'menuitem'}
    class={`lui-menu-item${local.danger ? ' lui-menu-item--danger' : ''}${local.selected ? ' is-selected' : ''}${local.class ? ` ${local.class}` : ''}`}
    {...rest}>{local.children}</button>;
}

export function MenuSeparator(): JSX.Element {
  return <div role="separator" class="lui-menu-separator" />;
}

export interface MenuSubmenuProps extends ParentProps {
  label: string;
  trigger: JSX.Element;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  relatedMenus?: Set<HTMLElement>;
}

/** A menu row that opens an adjacent, portalled child menu on hover or focus. */
export function MenuSubmenu(props: MenuSubmenuProps): JSX.Element {
  const [focusOnOpen, setFocusOnOpen] = createSignal(false);
  let anchor: HTMLButtonElement | undefined;
  const openFromPointerOrFocus = () => {
    setFocusOnOpen(false);
    props.onOpen();
  };
  return <>
    <MenuItem ref={anchor} aria-haspopup="menu" aria-expanded={props.open} class="lui-menu-item--submenu-trigger"
      onPointerEnter={openFromPointerOrFocus} onFocus={openFromPointerOrFocus}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight') return;
        event.preventDefault();
        setFocusOnOpen(true);
        props.onOpen();
      }}>
      {props.trigger}
    </MenuItem>
    <Show when={props.open}>
      <AnchoredMenu anchor={anchor} side="right" label={props.label} initialFocus={focusOnOpen()} relatedMenus={props.relatedMenus} onClose={props.onClose}>
        {props.children}
      </AnchoredMenu>
    </Show>
  </>;
}
