import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import { NylonCanvas, type NylonCanvasProps } from './NylonCanvas.tsx';
import { readNylonTabSession, writeNylonTabSession, type NylonTab } from './tabSession.ts';

/** Tabs retain local navigation; all canvases use the same Document and actions. */
export function NylonTabs(props: NylonCanvasProps & { sourceId: string }): JSX.Element {
  const source = untrack(() => props.sourceId);
  const restored = readNylonTabSession(source);
  const continuous: NylonTab = restored?.tabs[0] ?? { key: 'continuous', view: { kind: 'continuous' } };
  const root: NylonTab = { key: JSON.stringify(['standard', null]), view: { kind: 'standard', focusId: null } };
  const [tabs, setTabs] = createSignal<NylonTab[]>(restored?.tabs ?? [continuous, root]);
  const [active, setActive] = createSignal(restored?.tabs.find((tab) => tab.key === restored.activeKey) ?? root);
  const [closed, setClosed] = createSignal<NylonTab[]>(restored?.closed ?? []);
  const transformations = createMemo(() => new Map(props.doc.transformations.map((item) => [item.id, item])));
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  function save(): void {
    clearTimeout(saveTimer);
    writeNylonTabSession(source, { tabs: tabs(), closed: closed(), activeKey: active().key });
  }
  function scheduleSave(): void {
    clearTimeout(saveTimer);
    if (disposed) save();
    else saveTimer = setTimeout(save, 150);
  }
  createEffect(() => { tabs(); active(); closed(); save(); });
  onMount(() => {
    window.addEventListener('pagehide', save);
    const onVisibility = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onVisibility);
    onCleanup(() => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  });
  onCleanup(() => { disposed = true; save(); });

  function open(focusId: string | null): void {
    const key = JSON.stringify(['standard', focusId]);
    let tab = tabs().find((item) => item.key === key);
    if (!tab) {
      tab = closed().find((item) => item.key === key)
        ?? { key, view: { kind: 'standard', focusId } };
      setClosed((items) => items.filter((item) => item.key !== key));
      setTabs((items) => [...items, tab!]);
    }
    setActive(tab);
  }

  function close(tab: NylonTab): void {
    if (tab === continuous) return;
    const index = tabs().indexOf(tab);
    const remaining = tabs().filter((item) => item !== tab);
    if (active() === tab) setActive(remaining[Math.max(0, index - 1)]);
    setTabs(remaining);
    setClosed((items) => [...items.filter((item) => item.key !== tab.key), tab]);
  }

  function reopen(): void {
    const tab = closed().at(-1);
    if (tab?.view.kind === 'standard') open(tab.view.focusId);
  }

  function label(tab: NylonTab): string {
    if (tab.view.kind === 'continuous') return 'Continuous View (deprecated)';
    if (tab.view.focusId === null) return 'Document root';
    return transformations().get(tab.view.focusId)?.name ?? `Missing: ${tab.view.focusId}`;
  }

  function title(tab: NylonTab): string {
    if (tab.view.kind === 'continuous') return label(tab);
    const names = ['Document root'];
    const ancestors: string[] = [];
    let id = tab.view.focusId;
    const seen = new Set<string>();
    while (id !== null && !seen.has(id)) {
      seen.add(id);
      ancestors.unshift(transformations().get(id)?.name ?? id);
      id = transformations().get(id)?.parent ?? null;
    }
    return `${[...names, ...ancestors].join(' › ')} — Standard View${tab.view.focusId === null ? '' : ` (${tab.view.focusId})`}`;
  }

  function tabKey(event: KeyboardEvent, tab: NylonTab): void {
    const index = tabs().indexOf(tab);
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs().length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs().length) % tabs().length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs().length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    setActive(tabs()[target]);
    const strip = (event.currentTarget as HTMLElement).closest('[role="tablist"]');
    (strip?.querySelectorAll<HTMLElement>('[role="tab"]')[target])?.focus();
  }

  const missing = (tab: NylonTab) => tab.view.kind === 'standard'
    && tab.view.focusId !== null && !transformations().has(tab.view.focusId);

  return (
    <>
      <div class="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-surface px-1 text-xs">
        <div role="tablist" aria-label="Nylon views" class="flex min-w-0 flex-1 overflow-x-auto">
          <For each={tabs()}>{(tab) => (
            <div class="flex shrink-0 items-center border-r border-border-subtle"
              classList={{ 'bg-surface-alt': active() === tab }}>
              <button type="button" role="tab" aria-selected={active() === tab}
                aria-controls="nylon-view-panel" tabIndex={active() === tab ? 0 : -1}
                title={title(tab)} class="max-w-64 truncate px-2 py-2 text-fg"
                onClick={() => setActive(tab)} onKeyDown={(event) => tabKey(event, tab)}>
                {label(tab)}
              </button>
              <Show when={tab !== continuous}>
                <button type="button" aria-label={`Close ${label(tab)}`} title="Close tab"
                  class="px-1 text-fg-muted hover:text-fg" onClick={() => close(tab)}>×</button>
              </Show>
            </div>
          )}</For>
        </div>
        <button type="button" class="shrink-0 px-2 py-1 text-fg" onClick={() => open(null)}>Document root</button>
        <button type="button" class="shrink-0 px-2 py-1 text-fg disabled:opacity-40"
          disabled={closed().length === 0} onClick={reopen}>Reopen closed tab</button>
      </div>
      <div id="nylon-view-panel" role="tabpanel" aria-label={title(active())}
        style={{ display: 'flex', 'flex-direction': 'column', flex: '1 1 auto', 'min-height': 0 }}>
        <Show when={active()} keyed>{(tab) => (
          <Show when={!missing(tab)} fallback={
            <div class="flex flex-1 flex-col items-center justify-center gap-3 text-fg">
              <p>This Transformation no longer exists in the Document.</p>
              <button type="button" onClick={() => open(null)}>Open Document root</button>
            </div>
          }>
            <NylonCanvas doc={props.doc} revision={props.revision} blocked={props.blocked}
              onAction={props.onAction} view={tab.view} initialState={tab.state}
              onState={(state) => { tab.state = state; scheduleSave(); }} onOpenView={open} />
          </Show>
        )}</Show>
      </div>
    </>
  );
}
