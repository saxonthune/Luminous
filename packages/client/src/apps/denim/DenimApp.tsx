import { createEffect, createMemo, createSignal, For, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { ChevronLeft, ChevronRight, Ellipsis, ExternalLink, GitBranchPlus, GripHorizontal, Link2, Plus, X, Zap } from 'lucide-solid';
import { Canvas, NodeContainer, dagLayout, useCanvasContext, useNodeDrag } from '@luminous/cactus';
import type { CanvasRef, TidyNode } from '@luminous/cactus';
import { openDenimDatabase, type DenimDatabase, type DenimGraph, type DenimNode } from '@luminous/core/denim';
import { DocumentPicker } from '../../DocumentPicker';
import { fetchServerSources, fetchStaticSources, type CanvasSource } from '../../sources';
import { SourceConflictError } from '../../sources/CanvasSource';
import { readParam, writeParam } from '../../urlState';
import {
  createDenimSession,
  DenimSessionContext,
  DenimPersistenceConflict,
  useDenimSession,
  type DenimSession,
} from './DenimSession';
import { DenimSaveStatusBadge } from './DenimSaveStatusBadge';

const NODE_W = 232;
const NODE_H = 142;
const ICON_SIZE = 15;
const NODE_THEME_SLOT: Record<string, number> = {
  Journey: 1,
  Action: 2,
  Capability: 5,
  Resource: 4,
  Organization: 6,
  Contract: 8,
};

type PickerState = { mode: 'include' | 'connect'; parentId?: string; x: number; y: number };

function GraphCanvas(props: {
  selectedId: () => string | null;
  openPicker: (mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent) => void;
}) {
  const session = useDenimSession();
  const graph = () => session.state.graph;
  const layoutNodes = createMemo(() => {
    const parents = new Map<string, string>();
    for (const edge of graph().edges) {
      if (edge.type === 'parent-child' && !parents.has(edge.targetId)) parents.set(edge.targetId, edge.sourceId);
    }
    return graph().nodes.map((node): TidyNode => ({
      id: node.id,
      w: NODE_W,
      h: NODE_H,
      parentId: parents.get(node.id) ?? null,
    }));
  });
  const layoutEdges = createMemo(() => graph().edges
    .filter((edge) => edge.type === 'parent-child')
    .map((edge) => ({ source: edge.sourceId, target: edge.targetId })));
  const activeTab = () => session.state.tabs.find((tab) => tab.id === session.state.activeTabId)!;
  let canvasRef: CanvasRef | undefined;
  let previousTabId = activeTab().id;
  const positions = createMemo(() => {
    const positions = dagLayout(layoutNodes(), layoutEdges());
    for (const [id, position] of Object.entries(activeTab().positions)) positions.set(id, position);
    return positions;
  });

  createEffect(() => {
    const tab = activeTab();
    if (tab.id === previousTabId) return;
    previousTabId = tab.id;
    const camera = session.state.cameras[tab.id];
    if (camera) canvasRef?.setView(camera, false);
    else requestFit();
  });

  let pendingFit = 0;
  function requestFit(): void {
    cancelAnimationFrame(pendingFit);
    pendingFit = requestAnimationFrame(() => {
      const rects = graph().nodes.flatMap((node) => {
        const position = positions().get(node.id);
        return position ? [{ x: position.x, y: position.y, width: NODE_W, height: NODE_H }] : [];
      });
      if (rects.length > 0) canvasRef?.fitView(rects, 72, false);
    });
  }

  onMount(() => {
    if (!session.state.cameras[activeTab().id]) requestFit();
  });
  onCleanup(() => cancelAnimationFrame(pendingFit));

  return (
    <Canvas ref={(handle) => { canvasRef = handle; }}
      viewportOptions={{
        initialTransform: session.state.cameras[activeTab().id] ?? { x: 0, y: 0, k: 1 },
        onTransformChange: (camera) => session.setCamera(activeTab().id, camera),
      }}
      edges={graph().edges.filter((edge) => edge.type === 'parent-child').map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      styling: { arrowHead: true, dash: 'solid' as const },
    }))}>
      <CanvasNodes
        graph={graph()}
        positions={positions}
        tabId={() => activeTab().id}
        selectedId={props.selectedId}
        onSelect={session.selectNode}
        openPicker={props.openPicker}
      />
    </Canvas>
  );
}

function CanvasNodes(props: {
  graph: DenimGraph;
  positions: () => ReadonlyMap<string, { x: number; y: number }>;
  tabId: () => string;
  selectedId: () => string | null;
  onSelect: (id: string | null) => void;
  openPicker: (mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent) => void;
}) {
  const session = useDenimSession();
  const ctx = useCanvasContext();
  const [dragOffset, setDragOffset] = createSignal<{ id: string; dx: number; dy: number } | null>(null);
  let releaseFrame = 0;
  const drag = useNodeDrag({
    zoomScale: () => ctx.transform().k,
    handleSelector: '[data-denim-drag-handle]',
    callbacks: {
      onDrag: (id, dx, dy) => {
        cancelAnimationFrame(releaseFrame);
        setDragOffset({ id, dx, dy });
      },
      onDragEnd: (id) => {
        const offset = dragOffset();
        const position = props.positions().get(id);
        if (offset && position) {
          void session.moveNode(id, { x: position.x + offset.dx, y: position.y + offset.dy }, props.tabId());
          // Keep the visual drag position through the pointer-up render. The
          // saved per-tab position is updated synchronously, but its derived
          // layout can settle on the next frame; clearing both in one event
          // briefly exposes the old position and makes the node jump.
          releaseFrame = requestAnimationFrame(() => {
            releaseFrame = 0;
            setDragOffset(null);
          });
        } else {
          setDragOffset(null);
        }
      },
    },
  });
  onCleanup(() => cancelAnimationFrame(releaseFrame));

  async function differentiateNode(parentId: string): Promise<void> {
    const childId = await session.differentiate(parentId);
    if (childId) placeDifferentiatedNode(parentId, childId);
  }

  function placeDifferentiatedNode(parentId: string, childId: string): void {
    const parent = props.positions().get(parentId);
    if (!parent) return;
    void session.moveNode(childId, { x: parent.x, y: parent.y + NODE_H + 80 }, props.tabId());
  }

  return <For each={props.graph.nodes}>{(node) => {
    const basePosition = () => props.positions().get(node.id) ?? { x: 0, y: 0 };
    const pos = () => {
      const offset = dragOffset();
      const base = basePosition();
      return offset?.id === node.id ? { x: base.x + offset.dx, y: base.y + offset.dy } : base;
    };
    return <NodeContainer nodeId={node.id} x={() => pos().x} y={() => pos().y} w={() => NODE_W} h={() => NODE_H}
      onPointerDown={(event) => {
        ctx.onNodePointerDown(node.id, event);
        props.onSelect(node.id);
        drag.onPointerDown(node.id, event);
      }}>
      <NodeCard node={node} selected={props.selectedId() === node.id} onOpenJourney={() => void session.openJourney(node.id)}
        onDifferentiate={() => void differentiateNode(node.id)}
        onConnect={(event) => props.openPicker('connect', node.id, event)} />
    </NodeContainer>;
  }}</For>;
}

function NodeCard(props: {
  node: DenimNode;
  selected: boolean;
  onOpenJourney: () => void;
  onDifferentiate: () => void;
  onConnect: (event: MouseEvent) => void;
}) {
  const session = useDenimSession();
  const types = createMemo(() => [...new Set([
    'Journey', 'Action', 'Capability', 'Resource', 'Organization', 'Contract', props.node.type,
  ])]);
  return <article class="group relative flex h-full flex-col gap-2 rounded-lg p-3 transition-shadow"
    style={{
      background: `var(--theme-bg-${NODE_THEME_SLOT[props.node.type] ?? 1})`,
      border: '1px solid var(--theme-node-border)',
    }}
    classList={{ 'ring-2 ring-accent': props.selected }}>
    <div data-denim-drag-handle data-no-pan="true" aria-hidden="true"
      class="absolute inset-x-0 top-0 z-10 h-3 cursor-grab active:cursor-grabbing" />
    <div class="flex w-full shrink-0 items-center justify-between gap-2">
      <select aria-label="Node type" value={props.node.type}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === '__other__') {
            const custom = window.prompt('Type name', props.node.type);
            if (custom?.trim()) void session.updateNode(props.node.id, { type: custom.trim() });
            event.currentTarget.value = props.node.type;
          } else void session.updateNode(props.node.id, { type: value });
        }}
        class="w-[86%] cursor-pointer appearance-none bg-transparent pr-1 text-xs text-fg-muted outline-none focus-visible:text-fg">
        <For each={types()}>{(type) => <option value={type}>{type}</option>}</For>
        <option value="__other__">Other…</option>
      </select>
      <div data-denim-drag-handle data-no-pan="true" aria-label="Drag node" title="Drag node"
        class="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted hover:bg-surface/60 active:cursor-grabbing">
        <GripHorizontal size={ICON_SIZE} strokeWidth={1.8} />
      </div>
    </div>
    <textarea aria-label="Node text" value={props.node.text}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => void session.updateNode(props.node.id, { text: event.currentTarget.value })}
      class="min-h-0 flex-1 resize-none bg-transparent text-sm leading-5 text-fg outline-none focus-visible:ring-1 focus-visible:ring-accent/50" />
    <div class="absolute bottom-2 left-2 flex h-7 items-center gap-1" data-node-toolbar
      onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Differentiate node" title="Differentiate node"
      class="flex h-7 w-7 items-center justify-center rounded text-fg-muted opacity-0 transition-opacity hover:bg-surface/70 hover:text-fg focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100"
        onClick={props.onDifferentiate}><GitBranchPlus size={ICON_SIZE} strokeWidth={1.7} /></button>
      <button type="button" aria-label="Differentiate using an existing node" title="Differentiate using an existing node"
        class="flex h-7 w-7 items-center justify-center rounded text-fg-muted opacity-0 transition-opacity hover:bg-surface/70 hover:text-fg focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100"
        onClick={(event) => { event.stopPropagation(); props.onConnect(event); }}><Link2 size={ICON_SIZE} strokeWidth={1.7} /></button>
      <span class="pointer-events-none absolute left-0 flex h-7 w-7 items-center justify-center text-fg-muted group-hover:hidden">
        <Ellipsis size={ICON_SIZE} strokeWidth={1.7} />
      </span>
      <Show when={props.node.type === 'Journey'}>
        <button type="button" aria-label="Open Journey in a new tab" title="Open Journey in a new tab"
          class="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-surface/70 hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
          onClick={(event) => { event.stopPropagation(); props.onOpenJourney(); }}>
          <ExternalLink size={ICON_SIZE} strokeWidth={1.7} />
        </button>
      </Show>
    </div>
  </article>;
}

function DenimAppToolbar() {
  const session = useDenimSession();
  const [quickSelectOpen, setQuickSelectOpen] = createSignal(false);
  const [overflow, setOverflow] = createSignal(false);
  let strip: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  const refreshOverflow = () => setOverflow(Boolean(strip && strip.scrollWidth > strip.clientWidth + 1));
  const tabs = () => session.state.tabs;
  const activate = (id: string) => {
    session.activateTab(id);
    setQuickSelectOpen(false);
  };

  onMount(() => {
    if (strip) {
      resizeObserver = new ResizeObserver(refreshOverflow);
      resizeObserver.observe(strip);
      refreshOverflow();
    }
  });
  createEffect(() => {
    tabs();
    queueMicrotask(refreshOverflow);
  });
  onCleanup(() => resizeObserver?.disconnect());

  function tabKey(event: KeyboardEvent, index: number): void {
    const to = event.key === 'ArrowRight' ? Math.min(index + 1, tabs().length - 1)
      : event.key === 'ArrowLeft' ? Math.max(index - 1, 0)
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs().length - 1 : -1;
    if (to < 0) return;
    event.preventDefault();
    const next = tabs()[to];
    activate(next.id);
    strip?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  }

  return <div class="relative z-20 flex h-11 shrink-0 items-center border-b border-border-subtle bg-surface px-2">
    <div class="relative flex h-full shrink-0 items-center border-r border-border-subtle pr-2">
      <button type="button" aria-label="Quick Select" title="Quick Select" aria-expanded={quickSelectOpen()}
        class="flex h-8 w-8 items-center justify-center rounded text-fg-muted hover:bg-surface-alt hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        onClick={() => setQuickSelectOpen((open) => !open)}><Zap size={17} strokeWidth={1.8} /></button>
      <Show when={quickSelectOpen()}>
        <>
          <button class="fixed inset-0 z-30 cursor-default" aria-label="Close Quick Select" onClick={() => setQuickSelectOpen(false)} />
          <div role="menu" aria-label="Saved views" class="absolute left-0 top-10 z-40 min-w-44 rounded-md border border-border-subtle bg-surface p-1 shadow-lg">
            <For each={tabs().filter((tab) => tab.kind === 'pinned')}>
              {(tab) => <button role="menuitem" class="flex w-full items-center rounded px-3 py-2 text-left text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
                onClick={() => activate(tab.id)}>{tab.title}</button>}
            </For>
          </div>
        </>
      </Show>
    </div>
    <div class="flex min-w-0 flex-1 items-center">
      <Show when={overflow()}>
        <button type="button" aria-label="Scroll tabs left" title="Scroll tabs left"
          class="flex h-8 w-7 shrink-0 items-center justify-center text-fg-muted hover:text-fg"
          onClick={() => strip?.scrollBy({ left: -180, behavior: 'smooth' })}><ChevronLeft size={16} /></button>
      </Show>
      <div ref={strip} role="tablist" aria-label="Denim views" class="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            if (strip) strip.scrollLeft += event.deltaY;
          }
        }}>
        <For each={tabs()}>{(tab, index) => <div class="flex shrink-0 items-center border-r border-border-subtle"
          classList={{ 'bg-surface-alt': session.state.activeTabId === tab.id }}>
          <button type="button" role="tab" aria-selected={session.state.activeTabId === tab.id}
            tabIndex={session.state.activeTabId === tab.id ? 0 : -1} title={tab.title}
            class="max-w-52 truncate px-3 py-2 text-sm text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            onClick={() => activate(tab.id)} onKeyDown={(event) => tabKey(event, index())}>{tab.title}</button>
          <Show when={tab.kind === 'workspace'}>
            <button type="button" aria-label={`Close ${tab.title}`} title="Close tab"
              class="mr-1 flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
              onClick={() => void session.closeTab(tab.id)}><X size={13} /></button>
          </Show>
        </div>}</For>
      </div>
      <Show when={overflow()}>
        <button type="button" aria-label="Scroll tabs right" title="Scroll tabs right"
          class="flex h-8 w-7 shrink-0 items-center justify-center text-fg-muted hover:text-fg"
          onClick={() => strip?.scrollBy({ left: 180, behavior: 'smooth' })}><ChevronRight size={16} /></button>
      </Show>
    </div>
  </div>;
}

function DenimWorkspace(props: { onReload: () => void }) {
  const session = useDenimSession();
  const [picker, setPicker] = createSignal<PickerState | null>(null);
  const [query, setQuery] = createSignal('');
  const activeTab = () => session.state.tabs.find((tab) => tab.id === session.state.activeTabId)!;
  const journeysView = () => activeTab().id === 'pinned:journeys';
  const results = createMemo(() => session.findNodesToConnect(query()));

  function openPicker(mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setQuery('');
    setPicker({ mode, parentId, x: Math.min(rect.left, window.innerWidth - 300), y: Math.min(rect.bottom + 6, window.innerHeight - 340) });
  }

  function chooseNode(node: DenimNode): void {
    const current = picker();
    if (!current) return;
    const task = current.mode === 'connect' && current.parentId
      ? session.connectExisting(current.parentId, node.id)
      : session.includeNode(node.id);
    void task;
    setPicker(null);
  }

  return <div class="flex min-h-0 flex-1 flex-col">
    <Show when={session.state.error}>
      {(message) => <div role="alert" class="flex items-center gap-3 px-4 py-2 text-sm text-red-700">
        <span>{message()}</span>
        <Show when={session.state.conflict}>
          <button class="underline" onClick={props.onReload}>Discard edits and reload</button>
        </Show>
        <Show when={session.state.dirty && !session.state.conflict}>
          <button class="underline" onClick={() => void session.retrySave()}>Retry save</button>
        </Show>
      </div>}
    </Show>
    <DenimAppToolbar />
    <div class="relative min-h-0 flex-1">
      <div class="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border-subtle bg-surface/95 p-1 shadow-sm backdrop-blur">
        <Show when={journeysView()}>
          <button type="button" aria-label="Add a Journey" title="Add a Journey"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-alt hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            onClick={() => void session.createJourney()}><Plus size={16} strokeWidth={1.8} /></button>
        </Show>
        <button type="button" aria-label="Add a node to this view" title="Add a node to this view"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-alt hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
          onClick={(event) => openPicker('include', undefined, event)}><Plus size={16} strokeWidth={1.8} /></button>
      </div>
      <GraphCanvas selectedId={() => session.state.selectedId} openPicker={openPicker} />
      <DenimSaveStatusBadge saving={() => session.state.saving} error={() => session.state.error} />
    </div>
    <Show when={picker()}>
      {(current) => <Portal mount={document.body}>
        <div role="dialog" aria-label={current().mode === 'include' ? 'Add node to view' : 'Choose node to connect'}
          class="fixed z-50 w-72 rounded-lg border border-border-subtle bg-surface p-2 shadow-xl"
          style={{ left: `${current().x}px`, top: `${current().y}px` }}>
          <div class="flex items-center gap-1">
            <input autofocus value={query()} onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setPicker(null); }}
              placeholder="Find a node" aria-label="Find a node"
              class="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-fg outline-none placeholder:text-fg-muted" />
            <button type="button" aria-label="Close" class="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-surface-alt hover:text-fg"
              onClick={() => setPicker(null)}><X size={14} /></button>
          </div>
          <div class="max-h-64 overflow-y-auto">
            <Show when={results().length > 0} fallback={<p class="px-2 py-3 text-xs text-fg-muted">No matching nodes</p>}>
              <For each={results()}>{(node) => <button type="button"
                class="flex w-full flex-col rounded px-2 py-2 text-left hover:bg-surface-alt focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                onClick={() => chooseNode(node)}>
                <span class="text-sm text-fg">{node.text || 'Untitled'}</span>
                <span class="text-xs text-fg-muted">{node.type}</span>
              </button>}</For>
            </Show>
          </div>
        </div>
      </Portal>}
    </Show>
  </div>;
}

export function DenimApp() {
  const [sources, setSources] = createSignal<CanvasSource[]>([]);
  const [source, setSource] = createSignal<CanvasSource | null>(null);
  const [session, setSession] = createSignal<DenimSession | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const initialSrc = readParam('src');

  async function openSource(item: CanvasSource): Promise<void> {
    setLoading(true);
    setError(null);
    let database: DenimDatabase | undefined;
    try {
      if (!item.loadBytes || !item.saveBytes) throw new Error('This source cannot read and save SQLite databases');
      const loaded = await item.loadBytes();
      database = await openDenimDatabase(loaded.bytes, `${import.meta.env.BASE_URL}sql-wasm-browser.wasm`);
      const previous = session();
      if (previous) await previous.dispose();
      setSource(item);
      setSession(createDenimSession(database, async (bytes, revision) => {
        try {
          return await item.saveBytes!(bytes, revision);
        } catch (cause) {
          if (cause instanceof SourceConflictError) throw new DenimPersistenceConflict(cause.message);
          throw cause;
        }
      }, loaded.revision, item.id));
      writeParam('src', item.id);
    } catch (cause) {
      database?.close();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function reloadSource(): Promise<void> {
    const current = session();
    const item = source();
    if (!current || !item) return;
    await current.discard();
    setSession(null);
    await openSource(item);
  }

  async function closeSource(): Promise<void> {
    const current = session();
    if (current) {
      try {
        await current.dispose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
    }
    setSession(null);
    setSource(null);
    writeParam('src', null);
  }

  onMount(async () => {
    try {
      const list = await (__STATIC__ ? fetchStaticSources('.denim.sqlite') : fetchServerSources('.denim.sqlite'));
      setSources(list);
      const initial = initialSrc && list.find((item) => item.id === initialSrc);
      if (initial) await openSource(initial);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  });

  onCleanup(() => {
    const current = session();
    if (current) void current.dispose().catch((cause: unknown) => console.error('[Denim] session closed with unsaved changes', cause));
  });

  return <>
    <Portal mount={document.getElementById('app-header-left')!}>
      <Show when={source()}>{(file) => <>
        <button onClick={() => void closeSource()}
          class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg" title="Choose another database">
          ← Databases
        </button>
        <span class="text-sm text-fg-muted">{file().label}</span>
      </>}</Show>
    </Portal>
    <div class="flex min-h-0 flex-1 flex-col">
      <Show when={error()}>{(message) => <div role="alert" class="px-4 py-2 text-sm text-red-700">{message()}</div>}</Show>
      <Show when={session()} fallback={<Switch>
        <Match when={loading()}><div class="flex flex-1 items-center justify-center text-sm text-fg-muted">Loading…</div></Match>
        <Match when={!loading()}><DocumentPicker heading="Denim databases" sources={sources()} onSelect={(item) => void openSource(item)} /></Match>
      </Switch>}>
        {(active) => <DenimSessionContext.Provider value={active()}><DenimWorkspace onReload={() => void reloadSource()} /></DenimSessionContext.Provider>}
      </Show>
    </div>
  </>;
}
