import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import Eye from 'lucide-solid/icons/eye';
import EyeOff from 'lucide-solid/icons/eye-off';
import X from 'lucide-solid/icons/x';
import type { DenimNodeVisibilityEntry } from '@luminous/core/denim/queries';

const NODE_THEME_SLOT: Record<string, number> = {
  Journey: 1,
  Action: 2,
  Capability: 5,
  Instance: 4,
  Organization: 6,
  Contract: 8,
};

export interface DenimNodeVisibilityMenuProps {
  title: string;
  boardTitle: string;
  boardId: string;
  position: { x: number; y: number };
  /** The caller supplies the relationship-specific or whole-Board query. */
  queryNodes: () => Promise<DenimNodeVisibilityEntry[]>;
  setNodeVisibility: (nodeId: string, visible: boolean, boardId: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export function DenimNodeVisibilityMenu(props: DenimNodeVisibilityMenuProps) {
  const [entries, setEntries] = createSignal<DenimNodeVisibilityEntry[]>([]);
  const [filter, setFilter] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [position, setPosition] = createSignal({ left: props.position.x, top: props.position.y });
  let panel: HTMLDivElement | undefined;
  let search: HTMLInputElement | undefined;
  let positionFrame = 0;

  const shownCount = createMemo(() => entries().filter((entry) => entry.visible).length);
  const filteredEntries = createMemo(() => {
    const query = filter().trim().toLocaleLowerCase();
    const nodes = entries();
    if (!query) return nodes;
    return nodes.filter((entry) => entry.node.text.toLocaleLowerCase().includes(query));
  });

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try { setEntries(await props.queryNodes()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }

  async function toggle(entry: DenimNodeVisibilityEntry): Promise<void> {
    const result = await props.setNodeVisibility(entry.node.id, !entry.visible, props.boardId);
    if (!result.ok) { setError(result.error ?? 'Could not change Node visibility'); return; }
    setEntries((current) => current.map((item) => item.node.id === entry.node.id
      ? { ...item, onBoard: true, visible: !entry.visible } : item));
  }

  function updatePosition(): void {
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    const gap = 8;
    setPosition({
      left: Math.max(gap, Math.min(props.position.x, window.innerWidth - bounds.width - gap)),
      top: Math.max(gap, Math.min(props.position.y, window.innerHeight - bounds.height - gap)),
    });
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    if (event.target instanceof Node && panel?.contains(event.target)) return;
    props.onClose();
  }

  function onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    props.onClose();
  }

  onMount(() => {
    void refresh();
    search?.focus();
    positionFrame = requestAnimationFrame(updatePosition);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onDocumentKeyDown, true);
    window.addEventListener('resize', updatePosition);
  });
  onCleanup(() => {
    cancelAnimationFrame(positionFrame);
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    window.removeEventListener('resize', updatePosition);
  });

  return <Portal mount={document.body}>
    <div ref={panel} class="denim-node-visibility-menu" role="dialog" aria-label={props.title}
      style={{ left: `${position().left}px`, top: `${position().top}px` }} onPointerDown={(event) => event.stopPropagation()}>
      <header class="denim-node-visibility-menu__header">
        <div class="denim-node-visibility-menu__heading">
          <strong>{props.title}</strong>
          <span>{shownCount()} of {entries().length} shown on “{props.boardTitle}”</span>
        </div>
        <button type="button" class="denim-node-visibility-menu__close" aria-label="Close Node Visibility Menu" onClick={props.onClose}>
          <X size={15} />
        </button>
      </header>
      <div class="denim-node-visibility-menu__filter">
        <input ref={search} type="text" aria-label="Filter nodes by content" placeholder="Filter nodes…" value={filter()}
          onInput={(event) => setFilter(event.currentTarget.value)} />
      </div>
      <Show when={error()}>{(message) => <div class="denim-node-visibility-menu__error" role="alert">{message()}</div>}</Show>
      <div class="denim-node-visibility-menu__list" role="list" aria-label="Nodes">
        <Show when={!loading()} fallback={<div class="denim-node-visibility-menu__empty">Loading Nodes…</div>}>
          <Show when={filteredEntries().length > 0} fallback={<div class="denim-node-visibility-menu__empty">No Nodes match this filter.</div>}>
            <For each={filteredEntries()}>{(entry) => <DenimNodeVisibilityItem entry={entry} onToggle={() => void toggle(entry)} />}</For>
          </Show>
        </Show>
      </div>
    </div>
  </Portal>;
}

function DenimNodeVisibilityItem(props: { entry: DenimNodeVisibilityEntry; onToggle: () => void }) {
  const slot = () => NODE_THEME_SLOT[props.entry.node.type] ?? 1;
  return <div class="denim-node-visibility-item" role="listitem"
    style={{ background: `var(--theme-bg-${slot()})` }}>
    <div class="denim-node-visibility-item__content">
      <span class="denim-node-visibility-item__type">{props.entry.node.type}</span>
      <span class="denim-node-visibility-item__text">{props.entry.node.text || '(untitled)'}</span>
      <Show when={!props.entry.onBoard}><span class="denim-node-visibility-item__state">Not on Board</span></Show>
      <Show when={props.entry.onBoard && !props.entry.visible}><span class="denim-node-visibility-item__state">Hidden</span></Show>
    </div>
    <button type="button" class="denim-node-visibility-item__toggle" aria-pressed={props.entry.visible}
      aria-label={`${props.entry.visible ? 'Hide' : 'Show'} ${props.entry.node.type} ${props.entry.node.text} on this Board`}
      title={props.entry.visible ? 'Hide on this Board' : 'Show on this Board'} onClick={props.onToggle}>
      {props.entry.visible ? <Eye size={16} /> : <EyeOff size={16} />}
    </button>
  </div>;
}
