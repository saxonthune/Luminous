import { createSignal, Show } from 'solid-js';
import { ToolbarSurface } from '@luminous/cactus/runtime';
import ChevronDown from 'lucide-solid/icons/chevron-down';
import ChevronRight from 'lucide-solid/icons/chevron-right';
import ChevronsDownUp from 'lucide-solid/icons/chevrons-down-up';
import ListTree from 'lucide-solid/icons/list-tree';

/** The wrapper and its padded bridge form one continuous hover/focus region. */
export function VisibilityToolbar(props: {
  title: string;
  collapsed: boolean;
  descendantCount: number;
  onToggle: () => void;
  onChildrenOnly: () => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const [dismissed, setDismissed] = createSignal(false);
  let trigger!: HTMLButtonElement;
  const actionLabel = () => props.collapsed ? 'Reveal Children' : 'Hide Grandchildren';
  function chooseAction() {
    props.onChildrenOnly();
    trigger.focus({ preventScroll: true });
    setDismissed(true);
    props.onActiveChange?.(false);
  }
  return <div class="portable-visibility-controls" data-dismissed={dismissed() ? 'true' : undefined}
    onPointerEnter={() => { setDismissed(false); props.onActiveChange?.(true); }}
    onPointerLeave={event => props.onActiveChange?.(!dismissed() && event.currentTarget.contains(document.activeElement))}
    onFocusIn={event => { if ((event.target as HTMLElement).matches(':focus-visible')) setDismissed(false); props.onActiveChange?.(!dismissed()); }} onFocusOut={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) props.onActiveChange?.(event.currentTarget.matches(':hover'));
    }} onPointerDown={event => event.stopPropagation()}>
    <button ref={trigger} type="button" class="portable-visibility-button" aria-expanded={!props.collapsed}
      aria-label={`Visibility Button: ${props.collapsed ? 'reveal' : 'hide'} ${props.descendantCount} descendants of ${props.title}`}
      title={`${props.descendantCount} descendant nodes`}
      onClick={event => { event.stopPropagation(); props.onToggle(); }}>
      <Show when={props.collapsed} fallback={<ChevronDown size={16} aria-hidden="true" />}><ChevronRight size={16} aria-hidden="true" /></Show>
      <Show when={props.collapsed}><span>{props.descendantCount}</span></Show>
    </button>
    <div class="portable-visibility-toolbar-bridge">
      <ToolbarSurface variant="node" class="portable-visibility-toolbar" role="toolbar" aria-label="Visibility Toolbar">
        <button type="button" aria-label={actionLabel()} title={actionLabel()} onClick={event => { event.stopPropagation(); chooseAction(); }}>
          <Show when={props.collapsed} fallback={<ChevronsDownUp size={20} aria-hidden="true" />}><ListTree size={20} aria-hidden="true" /></Show>
        </button>
      </ToolbarSurface>
    </div>
  </div>;
}
