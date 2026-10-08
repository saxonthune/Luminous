import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import Eye from 'lucide-solid/icons/eye';
import EyeOff from 'lucide-solid/icons/eye-off';
import X from 'lucide-solid/icons/x';
import type { DenimNodeVisibilityEntry } from '@luminous/core/denim/queries';
import type { DenimNodeType } from '@luminous/core/denim';
import { DenimNodeListRepresentation } from './DenimNodeListRepresentation';

export interface DenimNodeVisibilityMenuProps {
  title: string;
  boardTitle: string;
  boardId: string;
  position: { x: number; y: number };
  nodeTypes: () => DenimNodeType[];
  /** The caller supplies the relationship-specific or whole-Board query. */
  queryNodes: () => Promise<DenimNodeVisibilityEntry[]>;
  setNodeLoaded: (nodeId: string, loaded: boolean, boardId: string) => Promise<{ ok: boolean; error?: string }>;
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

  const loadedCount = createMemo(() => entries().filter((entry) => entry.loaded).length);
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
    const result = await props.setNodeLoaded(entry.node.id, !entry.loaded, props.boardId);
    if (!result.ok) { setError(result.error ?? 'Could not change Node visibility'); return; }
    setEntries((current) => current.map((item) => item.node.id === entry.node.id
      ? { ...item, loaded: !entry.loaded } : item));
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
          <span>{loadedCount()} of {entries().length} loaded on “{props.boardTitle}”</span>
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
            <For each={filteredEntries()}>{(entry) => <DenimNodeVisibilityItem entry={entry} nodeTypes={props.nodeTypes} onToggle={() => void toggle(entry)} />}</For>
          </Show>
        </Show>
      </div>
    </div>
  </Portal>;
}

function DenimNodeVisibilityItem(props: { entry: DenimNodeVisibilityEntry; onToggle: () => void; nodeTypes: () => DenimNodeType[] }) {
  return <div class="denim-node-visibility-item" role="listitem">
    <DenimNodeListRepresentation node={props.entry.node} nodeTypes={props.nodeTypes} class="denim-node-visibility-item__representation"
      meta={<span class="denim-node-visibility-item__state">{props.entry.loaded ? 'Loaded on Board' : 'Not on Board'}</span>}
      trailing={
      <button type="button" class="denim-node-visibility-item__toggle" aria-pressed={props.entry.loaded}
        aria-label={`${props.entry.loaded ? 'Unload' : 'Load'} ${props.entry.node.type} ${props.entry.node.text} ${props.entry.loaded ? 'from' : 'onto'} this Board`}
        title={props.entry.loaded ? 'Unload from this Board' : 'Load onto this Board'} onClick={props.onToggle}>
        {props.entry.loaded ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
      } />
  </div>;
}
