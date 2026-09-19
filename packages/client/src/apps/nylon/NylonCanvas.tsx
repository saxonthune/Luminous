import { createNylonPips } from './createNylonPips.ts';
import { NylonPip } from './NylonPip.tsx';
import { pipNodeId, type NylonPipSession } from './pipSession.ts';
import { NylonViewContent } from './NylonViewContent.tsx';
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import type { NylonContract, NylonDocument, NylonTransformation } from '@luminous/core/nylon';
import type { NylonAction } from '@luminous/core/nylon/actions';
import {
  Canvas,
  type CanvasRef,
  type Transform,
} from '@luminous/cactus';
import {
  projectNylon,
  type NylonRenderNode,
  type NylonContainerState,
  type NylonViewDefinition,
} from '@luminous/core/nylon/projection';
import type { NylonDagDirection } from '@luminous/core/nylon/dagArrange';
import { nylonSelectionRoots } from '@luminous/core/nylon/dragSelection';
import { NylonViewportChrome } from './NylonViewportChrome.tsx';
import {
  NYLON_VIEW_POLICY,
  type ViewportSize,
} from './viewportPolicy.ts';

export interface NylonCanvasProps {
  doc: NylonDocument;
  revision: string;
  blocked: boolean;
  onAction: (action: NylonAction, viewRevision?: string) => boolean;
  view?: NylonViewDefinition;
  initialState?: NylonCanvasState;
  onState?: (state: NylonCanvasState) => void;
  onOpenView?: (focusId: string | null) => void;
}

export interface NylonCanvasState {
  camera: Transform;
  selection: string[];
  containerStates: ReadonlyMap<string, NylonContainerState>;
  pips?: NylonPipSession;
}

export function NylonCanvas(props: NylonCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  let hostEl!: HTMLDivElement;
  const initial = untrack(() => props.initialState);
  const [selectedId, setSelectedId] = createSignal<string | null>(initial?.selection[0] ?? null);
  const [selectedRenderIds, setSelectedRenderIds] = createSignal<ReadonlyArray<string>>(initial?.selection ?? []);
  const [containerStates, setContainerStates] = createSignal<ReadonlyMap<string, NylonContainerState>>(initial?.containerStates ?? new Map());
  const standard = () => props.view?.kind === 'standard';
  const focusId = () => props.view?.kind === 'standard' ? props.view.focusId : null;
  const focus = () => props.doc.transformations.find((item) => item.id === focusId());
  const collapsedIds = createMemo(() => {
    if (!standard()) return new Set([...containerStates()].filter(([, state]) => state === 'collapsed').map(([id]) => id));
    // The action executor sees the same compact Children, with ancestors open
    // so the Focus Transformation remains available for shared layout actions.
    const transformations = new Map(props.doc.transformations.map((item) => [item.id, item]));
    const expanded = new Set<string>();
    let id = focusId();
    while (id !== null && !expanded.has(id)) {
      expanded.add(id);
      id = transformations.get(id)?.parent ?? null;
    }
    return new Set([...props.doc.transformations, ...props.doc.contracts]
      .flatMap((item) => item.parent && !expanded.has(item.parent) ? [item.parent] : []));
  });
  const coveredIds = createMemo(() => standard() ? new Set<string>()
    : new Set([...containerStates()].filter(([, state]) => state === 'covered').map(([id]) => id)));
  const [camera, setCamera] = createSignal<Transform>(initial?.camera ?? { x: 0, y: 0, k: 1 });
  const [viewportSize, setViewportSize] = createSignal<ViewportSize>({ width: 1, height: 1 });
  const baseProjection = createMemo(() => projectNylon(props.doc, collapsedIds(), undefined, undefined, coveredIds(), props.view));
  const canvasViewport = createMemo(() => {
    const transform = camera();
    const viewport = viewportSize();
    return {
      x: -transform.x / transform.k,
      y: -transform.y / transform.k,
      width: viewport.width / transform.k,
      height: viewport.height / transform.k,
    };
  });
  const mainProjection = createMemo(() => projectNylon(
    props.doc,
    collapsedIds(),
    new Set(selectedRenderIds()),
    canvasViewport(),
    coveredIds(),
    props.view,
  ));

  const pips = createNylonPips(() => props.doc, () => mainProjection(), initial?.pips,
    (rect) => canvasRef?.fitView([rect], 72, false), selectedRenderIds);
  const projection = pips.projection;
  const workspaceBounds = () => [
    ...baseProjection().nodes.map((node) => ({ x: node.x, y: node.y, width: node.w, height: node.h })),
    ...pips.views().map((view) => view.frame),
  ];
  const openPip = (focus: string, renderId: string) => pips.open(focus, renderId);

  onMount(() => {
    const nodes = baseProjection().nodes;
    if (!canvasRef) return;
    if (initial) canvasRef.setView(initial.camera, false);
    else if (standard()) frameReadable();
    else if (nodes.length > 0) canvasRef.fitView(nodes.map((node) => ({ x: node.x, y: node.y, width: node.w, height: node.h })), 72);
    const visible = new Set(projection().nodes.map((node) => node.renderId));
    const selected = (initial?.selection ?? []).filter((id) => visible.has(id));
    canvasRef.setSelectedIds(selected);
    selectionChanged(selected);
  });

  createEffect(() => props.onState?.({
    camera: camera(), selection: [...selectedRenderIds()], containerStates: containerStates(), pips: pips.session(),
  }));

  onMount(() => {
    const measure = () => {
      const rect = hostEl.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(hostEl);
    onCleanup(() => observer.disconnect());
  });

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  function clearSelection(): void {
    canvasRef?.clearSelection();
    setSelectedRenderIds([]);
    setSelectedId(null);
  }

  function semanticNodeId(renderId: string): string {
    return projection().nodes.find((node) => node.renderId === renderId)?.item.id ?? renderId;
  }

  function selectionChanged(ids: ReadonlyArray<string>): void {
    setSelectedRenderIds(ids);
    setSelectedId(ids[0] ? semanticNodeId(ids[0]) : null);
  }

  createEffect(on(() => props.revision, () => {
    const visible = new Set(projection().nodes.map((node) => node.renderId));
    const selected = selectedRenderIds().filter((id) => visible.has(id));
    canvasRef?.setSelectedIds(selected);
    selectionChanged(selected);
  }));

  function differentiate(id: string): void {
    if (props.onAction({ op: 'differentiate', id })) setSelectedId(id);
  }

  function dragRoots(id: string): string[] {
    const selected = canvasRef?.getSelectedIds() ?? [];
    const pair = projection().contractFrames.find((frame) => frame.id === id);
    const pressed = pair ? [pair.inputRenderId, pair.outputRenderId] : [id];
    const semanticIds = (pressed.every((nodeId) => selected.includes(nodeId)) ? selected : pressed)
      .filter(canMove).map(semanticNodeId);
    return nylonSelectionRoots(props.doc, [...new Set(semanticIds)]);
  }

  function canMove(id: string): boolean {
    if (!standard()) return true;
    const node = projection().nodes.find((item) => item.renderId === id);
    const owner = pips.owner(id);
    const viewFocus = owner === 'main' ? focusId() : pips.views().find((v) => v.pip.id === owner)?.pip.focusId;
    return !!node && !node.context && node.item.id !== viewFocus;
  }

  function dragGroup(id: string): string[] {
    const pressedNode = projection().nodes.find((node) => node.renderId === id);
    if (pressedNode?.kind === 'contract' && pressedNode.boundaryContainerId) return [id];

    const roots = new Set(dragRoots(id));
    const transformations = new Map(props.doc.transformations.map((item) => [item.id, item]));
    return projection().nodes
      .filter((node) => {
        if (!canMove(node.renderId) || node.context || (node.kind === 'contract' && node.boundaryContainerId)) return false;
        if (roots.has(node.item.id)) return true;
        const seen = new Set<string>();
        let parent = node.item.parent;
        const owner = pips.owner(node.renderId);
        const viewFocus = owner === 'main' ? focusId() : pips.views().find((v) => v.pip.id === owner)?.pip.focusId;
        while (parent !== undefined && !seen.has(parent)) {
          if (standard() && parent === viewFocus) return false;
          if (roots.has(parent)) return true;
          seen.add(parent);
          parent = transformations.get(parent)?.parent;
        }
        return false;
      })
      .map((node) => node.renderId);
  }

  let dragRequest: { revision: string; action: NylonAction } | undefined;
  function startDrag(id: string): void {
    dragRequest = { revision: props.revision,
      action: { op: 'selection.move', ids: dragRoots(id), dx: 0, dy: 0 } };
  }

  function endDrag(_id: string, dx: number, dy: number): void {
    const request = dragRequest;
    dragRequest = undefined;
    if (request && 'dx' in request.action) {
      void props.onAction({ ...request.action, dx, dy }, request.revision);
    }
  }

  const layoutContext = () => ({ collapsed: [...collapsedIds()], covered: [...coveredIds()] });
  function arrange(id: string, direction: NylonDagDirection): void {
    void props.onAction({ op: 'layout.dag', id, direction, context: layoutContext() });
  }
  function space(id: string): void {
    void props.onAction({ op: 'layout.space', id, context: layoutContext() });
  }

  function expand(id: string): void {
    const state = containerStates().get(id) ?? 'expanded';
    if (state === 'expanded') return;
    if (state === 'collapsed' && !props.onAction({ op: 'container.expand', id, context: layoutContext() })) return;
    setContainerState(id, 'expanded');
  }

  function setContainerState(id: string, state: NylonContainerState): void {
    setContainerStates((current) => {
      const next = new Map(current);
      if (state === 'expanded') next.delete(id);
      else next.set(id, state);
      return next;
    });
    // Hidden descendants must not remain in a later multi-node drag selection.
    if (state !== 'expanded') {
      const visibleIds = new Set(projection().nodes.map((node) => node.renderId));
      const selected = selectedRenderIds().filter((renderId) => visibleIds.has(renderId));
      canvasRef?.setSelectedIds(selected);
      selectionChanged(selected);
    }
  }

  function cover(id: string): void {
    if (props.blocked) return;
    if ((containerStates().get(id) ?? 'expanded') !== 'expanded') return;
    setContainerState(id, 'covered');
  }

  function collapse(id: string): void {
    if (props.blocked) return;
    setContainerState(id, 'collapsed');
  }

  function navigateMinimap(x: number, y: number): void {
    const current = camera();
    const viewport = viewportSize();
    canvasRef?.setView({
      x: viewport.width / 2 - x * current.k,
      y: viewport.height / 2 - y * current.k,
      k: current.k,
    }, false);
  }

  function navigateNode(node: NylonRenderNode): void {
    canvasRef?.centerView({ x: node.x, y: node.y, width: node.w, height: node.h });
  }

  function frameReadable(): void {
    const nodes = baseProjection().nodes;
    if (!canvasRef || nodes.length === 0) return;
    const bounds = hostEl.getBoundingClientRect();
    const left = Math.min(...nodes.map((node) => node.x));
    const top = Math.min(...nodes.map((node) => node.y));
    const width = Math.max(...nodes.map((node) => node.x + node.w)) - left;
    const height = Math.max(...nodes.map((node) => node.y + node.h)) - top;
    const fit = Math.min(1, (bounds.width - 144) / width, (bounds.height - 144) / height);
    const k = Math.max(NYLON_VIEW_POLICY.standardMinReadableZoom, fit);
    const first = nodes.find((node) => !node.context && !(node.kind === 'container' && node.expanded)) ?? nodes[0];
    const center = fit < NYLON_VIEW_POLICY.standardMinReadableZoom ? { x: first.x + first.w / 2, y: first.y + first.h / 2 }
      : { x: left + width / 2, y: top + height / 2 };
    canvasRef.setView({ x: bounds.width / 2 - center.x * k, y: bounds.height / 2 - center.y * k, k }, false);
  }

  function arrangeChildren(): void {
    if (props.onAction({ op: 'layout.standard', focusId: focusId() })) frameReadable();
  }

  return (
    <>
      <Show when={standard()}>
        <div class="flex shrink-0 items-center gap-4 border-b border-border-subtle bg-surface px-3 py-2 text-fg">
          <div class="min-w-0 flex-1">
            <strong class="text-base">{focus()?.name ?? props.doc.title ?? 'Document root'}</strong>
            <Show when={focus()?.prose}><p class="m-0 line-clamp-2 text-sm text-fg-muted">{focus()?.prose}</p></Show>
          </div>
          <Show when={focus()}><button type="button" class="text-xs" onClick={() => setSelectedId(focusId())}>Inspect</button></Show>
          <button type="button" class="shrink-0 rounded border border-border-subtle px-2 py-1 text-sm disabled:opacity-40"
            disabled={props.blocked} onClick={arrangeChildren}>Arrange children</button>
          <button type="button" class="shrink-0 text-xs" onClick={() => canvasRef?.fitView(
            workspaceBounds(), 72,
          )}>Fit view</button>
          <button type="button" class="shrink-0 text-xs" onClick={frameReadable}>Readable zoom</button>
          <button type="button" class="shrink-0 text-xs disabled:opacity-40" disabled={!pips.session().closed.length}
            onClick={pips.reopen}>Reopen closed PIP</button>
        </div>
      </Show>
    <div ref={hostEl} style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
      <Canvas
        ref={(ref) => { canvasRef = ref; }}
        viewportOptions={{ initialTransform: initial?.camera, onTransformChange: setCamera }}
        edges={projection().edges}
        edgeEmphasis={{ dimUnselected: false, selectedWidthMultiplier: 1.5 }}
        boxSelect={{ trigger: 'drag' }}
        onSelectionChange={selectionChanged}
      >
        <For each={pips.ids()}>{(id) => {
          const view = () => pips.views().find((v) => v.pip.id === id)!;
          return <NylonPip pip={view().pip} frame={view().frame}
            name={props.doc.transformations.find((n) => n.id === view().pip.focusId)?.name ?? view().pip.focusId}
            missing={!view().exists}
            sourceMissing={!projection().nodes.some((n) => n.renderId === pipNodeId(view().pip.sourceView, view().pip.sourceNode))}
            onToggleContext={() => pips.toggleContext(id)}
            onMove={pips.move} onClose={() => { pips.close(id); clearSelection(); }}
            onOpenTab={() => props.onOpenView?.(view().pip.focusId)}
            onArrange={() => props.onAction({ op: 'layout.standard', focusId: view().pip.focusId })}
            blocked={props.blocked} />;
        }}</For>
        <NylonViewContent
          doc={props.doc}
          nodes={() => projection().nodes}
          contractFrames={() => projection().contractFrames}
          viewportSize={viewportSize}
          dragGroup={dragGroup}
          onDragEnd={endDrag}
          onDragStart={startDrag}
          blocked={props.blocked}
          onExpand={expand}
          onCollapse={collapse}
          onCover={cover}
          onArrange={arrange}
          onSpace={space}
          standard={standard()}
          canMove={canMove}
          onOpenView={props.onOpenView}
          onOpenPip={standard() ? openPip : undefined}
        />
      </Canvas>
      <NylonViewportChrome
        doc={props.doc}
        projection={projection()}
        selectedId={selectedId()}
        camera={camera()}
        viewport={viewportSize()}
        onNavigate={navigateMinimap}
        onNavigateNode={navigateNode}
        view={props.view}
        onOpenView={props.onOpenView}
      />
      <NylonInspector
        doc={props.doc}
        selectedId={selectedId()}
        onClose={clearSelection}
        onDifferentiate={differentiate}
        onOpenView={props.onOpenView}
        onOpenPip={standard() ? (id) => openPip(id,
          selectedRenderIds().find((renderId) => semanticNodeId(renderId) === id) ?? id) : undefined}
      />
    </div>
    </>
  );
}

function NylonInspector(props: {
  doc: NylonDocument;
  selectedId: string | null;
  onClose: () => void;
  onDifferentiate: (id: string) => void;
  onOpenView?: (id: string | null) => void;
  onOpenPip?: (id: string) => void;
}): JSX.Element {
  const selected = createMemo(() => {
    if (props.selectedId === null) return null;
    const transformation = props.doc.transformations.find((item) => item.id === props.selectedId);
    if (transformation) return { kind: 'transformation' as const, item: transformation };
    const contract = props.doc.contracts.find((item) => item.id === props.selectedId);
    return contract ? { kind: 'contract' as const, item: contract } : null;
  });
  const hasChildren = (id: string) => [...props.doc.transformations, ...props.doc.contracts].some((item) => item.parent === id);
  const controlContracts = createMemo(() => props.doc.arcs.filter((arc) => arc.controlContract
    && [arc.from, arc.to, arc.controlContract.input, arc.controlContract.output].includes(props.selectedId ?? '')));
  const connections = createMemo(() => {
    const id = props.selectedId;
    if (!id) return [];
    const items = new Map([...props.doc.transformations, ...props.doc.contracts].map((item) => [item.id, item]));
    const inside = (nodeId: string) => {
      let current: string | undefined = nodeId;
      const seen = new Set<string>();
      while (current !== undefined && !seen.has(current)) {
        if (current === id) return true;
        seen.add(current);
        current = items.get(current)?.parent;
      }
      return false;
    };
    return props.doc.arcs.filter((arc) => inside(arc.from) !== inside(arc.to)).map((arc) => ({
      from: `${items.get(arc.from)?.name ?? arc.from} (${arc.from})`,
      to: `${items.get(arc.to)?.name ?? arc.to} (${arc.to})`,
    }));
  });

  return (
    <Show when={selected()}>
      {(selection) => (
        <aside class="absolute right-3 top-12 bottom-3 z-40 flex w-80 flex-col gap-3 overflow-auto rounded-lg border border-border-subtle bg-surface p-4 text-sm shadow-md">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-fg-muted">{selection().kind}</div>
              <div class="font-semibold text-fg">{selection().item.name}</div>
              <div class="text-xs text-fg-muted">{selection().item.id}</div>
            </div>
            <button
              type="button"
              aria-label="Close node inspector"
              title="Close"
              onClick={props.onClose}
              class="grid size-7 shrink-0 place-items-center rounded text-lg leading-none text-fg-muted hover:bg-surface-alt hover:text-fg"
            >
              ×
            </button>
          </div>
          <Show
            when={selection().kind === 'transformation'
              ? selection().item as NylonTransformation
              : null}
          >
            {(transformation) => (
              <>
                <Show when={props.onOpenView}>
                  <button type="button" class="rounded border border-border-subtle px-2 py-1 text-xs text-fg"
                    onClick={() => props.onOpenView?.(transformation().id)}>Open in new tab</button>
                </Show>
                <Show when={props.onOpenPip}>
                  <button type="button" class="rounded border border-border-subtle px-2 py-1 text-xs text-fg"
                    onClick={() => props.onOpenPip?.(transformation().id)}>Open in PIP</button>
                </Show>
                <p class="whitespace-pre-wrap text-xs leading-5 text-fg">{transformation().prose}</p>
                <div>
                  <div class="mb-1 text-[10px] uppercase tracking-wider text-fg-muted">Data needed</div>
                  <Show when={transformation().needs?.length} fallback={<div class="text-xs text-fg-muted">None listed</div>}>
                    <ul class="list-disc space-y-1 pl-5 text-xs text-fg">
                      <For each={transformation().needs}>{(need) => <li>{need}</li>}</For>
                    </ul>
                  </Show>
                </div>
                <Show when={!hasChildren(transformation().id)}>
                  <button
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => props.onDifferentiate(transformation().id)}
                    class="rounded bg-accent px-3 py-2 text-xs font-medium text-on-accent hover:bg-accent-hover"
                  >
                    Differentiate
                  </button>
                </Show>
                <Show when={transformation().contractPair}>
                  {(boundary) => (
                    <div>
                      <div class="mb-1 text-[10px] uppercase tracking-wider text-fg-muted">Control Contracts</div>
                      <div class="text-xs text-fg">Input: {boundary().input}</div>
                      <div class="text-xs text-fg">Output: {boundary().output}</div>
                    </div>
                  )}
                </Show>
              </>
            )}
          </Show>
          <Show
            when={selection().kind === 'contract' ? selection().item as NylonContract : null}
          >
            {(contract) => (
              <>
                <Show when={contract().kind}>
                  <div class="text-[10px] uppercase tracking-wider text-fg-muted">Kind: {contract().kind}</div>
                </Show>
                <pre class="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-surface-alt p-3 text-xs text-fg">{contract().text}</pre>
              </>
            )}
          </Show>
          <Show when={controlContracts().length}>
            <div class="text-xs text-fg">
              <div class="mb-1 text-[10px] uppercase tracking-wider text-fg-muted">Control Contracts</div>
              <For each={controlContracts()}>{(arc) => (
                <div class="mb-2 rounded bg-surface-alt p-2">
                  <div>Invocation: {arc.id}</div>
                  <div>Input: {arc.controlContract!.input}</div>
                  <div>Output: {arc.controlContract!.output}</div>
                </div>
              )}</For>
            </div>
          </Show>
          <Show when={connections().length}>
            <div class="flex flex-col gap-2 text-xs text-fg">
              <strong>Connections · declared endpoints</strong>
              <For each={connections()}>{(arc) => (
                <div class="break-words rounded bg-surface-alt p-2">{arc.from} → {arc.to}</div>
              )}</For>
            </div>
          </Show>
        </aside>
      )}
    </Show>
  );
}
