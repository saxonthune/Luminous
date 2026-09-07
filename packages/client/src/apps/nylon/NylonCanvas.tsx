import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { NylonContract, NylonDocument, NylonTransformation } from '@luminous/core/nylon';
import type { NylonAction } from '@luminous/core/nylon/actions';
import {
  Canvas,
  MenuRoot,
  NodeContainer,
  isOverContainerInterior,
  useCanvasContext,
  useGesture,
  type CanvasRef,
  type MenuSchema,
  type Transform,
} from '@luminous/cactus';
import {
  CONTRACT_FRAME_VISUAL_BAND,
  LEAF_VISUAL_BAND,
  projectNylon,
  type NylonContractFrame,
  type NylonRenderNode,
  type NylonContainerState,
} from '@luminous/core/nylon/projection';
import type { NylonDagDirection } from '@luminous/core/nylon/dagArrange';
import { nylonSelectionRoots } from '@luminous/core/nylon/dragSelection';
import { NylonViewportChrome } from './NylonViewportChrome.tsx';
import {
  containerDragLocked,
  showsSecondaryNodeContent,
  type ViewportSize,
} from './viewportPolicy.ts';

export interface NylonCanvasProps {
  doc: NylonDocument;
  revision: string;
  blocked: boolean;
  onAction: (action: NylonAction, viewRevision?: string) => boolean;
}

const containerButtonStyle: JSX.CSSProperties = {
  height: '20px', padding: '0 3px', display: 'flex',
  'align-items': 'center', 'justify-content': 'center', gap: '2px',
  'flex-shrink': 0, 'font-size': '15px', 'font-weight': 650, 'line-height': 1,
  border: '1px solid var(--border-strong)', 'border-radius': '4px',
  background: 'var(--surface)', color: 'var(--fg)', cursor: 'pointer',
};

export function NylonCanvas(props: NylonCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  let hostEl!: HTMLDivElement;
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [selectedRenderIds, setSelectedRenderIds] = createSignal<ReadonlyArray<string>>([]);
  const [containerStates, setContainerStates] = createSignal<ReadonlyMap<string, NylonContainerState>>(new Map());
  const collapsedIds = createMemo(() => new Set([...containerStates()].filter(([, state]) => state === 'collapsed').map(([id]) => id)));
  const coveredIds = createMemo(() => new Set([...containerStates()].filter(([, state]) => state === 'covered').map(([id]) => id)));
  const [camera, setCamera] = createSignal<Transform>({ x: 0, y: 0, k: 1 });
  const [viewportSize, setViewportSize] = createSignal<ViewportSize>({ width: 1, height: 1 });
  const baseProjection = createMemo(() => projectNylon(props.doc, collapsedIds(), undefined, undefined, coveredIds()));
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
  const projection = createMemo(() => projectNylon(
    props.doc,
    collapsedIds(),
    new Set(selectedRenderIds()),
    canvasViewport(),
    coveredIds(),
  ));

  onMount(() => {
    const nodes = baseProjection().nodes;
    if (!canvasRef || nodes.length === 0) return;
    canvasRef.fitView(nodes.map((node) => ({ x: node.x, y: node.y, width: node.w, height: node.h })), 72);
  });

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
    const semanticIds = (selected.includes(id) ? selected : [id]).map(semanticNodeId);
    return nylonSelectionRoots(props.doc, [...new Set(semanticIds)]);
  }

  function dragGroup(id: string): string[] {
    const pair = projection().contractFrames.find((frame) => frame.id === id);
    if (pair) return [pair.inputRenderId, pair.outputRenderId];

    const pressedNode = projection().nodes.find((node) => node.renderId === id);
    if (pressedNode?.kind === 'contract' && pressedNode.boundaryContainerId) return [id];

    const roots = new Set(dragRoots(id));
    const transformations = new Map(props.doc.transformations.map((item) => [item.id, item]));
    return projection().nodes
      .filter((node) => {
        if (node.kind === 'contract' && node.boundaryContainerId) return false;
        if (roots.has(node.item.id)) return true;
        const seen = new Set<string>();
        let parent = node.item.parent;
        while (parent !== undefined && !seen.has(parent)) {
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
    const pair = projection().contractFrames.find((frame) => frame.id === id);
    dragRequest = { revision: props.revision, action: pair
      ? { op: 'contract-pair.move', transformationId: pair.transformationId, dx: 0, dy: 0 }
      : { op: 'selection.move', ids: dragRoots(id), dx: 0, dy: 0 } };
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

  return (
    <div ref={hostEl} style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
      <Canvas
        ref={(ref) => { canvasRef = ref; }}
        viewportOptions={{ onTransformChange: setCamera }}
        edges={projection().edges}
        edgeEmphasis={{ dimUnselected: false, selectedWidthMultiplier: 1.5 }}
        boxSelect={{ trigger: 'drag' }}
        onSelectionChange={selectionChanged}
      >
        <NylonNodeLayer
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
        />
      </Canvas>
      <NylonViewportChrome
        doc={props.doc}
        projection={baseProjection()}
        selectedId={selectedId()}
        camera={camera()}
        viewport={viewportSize()}
        onNavigate={navigateMinimap}
        onNavigateNode={navigateNode}
      />
      <NylonInspector
        doc={props.doc}
        selectedId={selectedId()}
        onClose={clearSelection}
        onDifferentiate={differentiate}
      />
    </div>
  );
}

function NylonNodeLayer(props: {
  nodes: () => NylonRenderNode[];
  contractFrames: () => NylonContractFrame[];
  viewportSize: () => ViewportSize;
  dragGroup: (id: string) => string[];
  onDragEnd: (id: string, dx: number, dy: number) => void;
  onDragStart: (id: string) => void;
  blocked: boolean;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
  onCover: (id: string) => void;
  onArrange: (id: string, direction: NylonDagDirection) => void;
  onSpace: (id: string) => void;
}): JSX.Element {
  const ctx = useCanvasContext();
  const gesture = useGesture({
    zoomScale: () => ctx.transform().k,
    dragGroup: (id) => props.dragGroup(id),
    callbacks: {
      onDragStart: (id) => props.onDragStart(id),
      onDragEnd: (id, dx, dy) => props.onDragEnd(id, dx, dy),
    },
  });
  const dragDelta = (id: string) => gesture.draggedNodeIds().includes(id)
    ? gesture.dragDelta()
    : { dx: 0, dy: 0 };

  return (
    <>
      <For each={props.contractFrames()}>
        {(frame) => {
          const dragLocked = () => containerDragLocked(frame, ctx.transform().k, props.viewportSize());
          const delta = () => [frame.inputRenderId, frame.outputRenderId]
            .every((id) => gesture.draggedNodeIds().includes(id))
            ? gesture.dragDelta()
            : { dx: 0, dy: 0 };
          return (
            <div
              style={{
                position: 'absolute',
                left: `${frame.x}px`,
                top: `${frame.y}px`,
                width: `${frame.w}px`,
                height: `${frame.h}px`,
                transform: `translate(${delta().dx}px, ${delta().dy}px)`,
                'z-index': CONTRACT_FRAME_VISUAL_BAND,
                'pointer-events': frame.boundaryContainerId ? 'none' : 'auto',
                border: `${frame.compact ? 2 : 3}px solid var(--color-token-moss)`,
                'border-radius': frame.compact ? '22px' : '34px',
                background: 'color-mix(in srgb, var(--color-kind-signal-bg) 30%, transparent)',
                'box-shadow': '0 0 0 5px color-mix(in srgb, var(--color-token-moss) 14%, transparent)',
                cursor: frame.boundaryContainerId
                  ? 'default'
                  : dragLocked() ? 'not-allowed' : gesture.isDraggingNode(frame.id) ? 'grabbing' : 'grab',
              }}
              data-contract-frame={frame.id}
              data-no-pan
              onPointerDown={(event) => {
                ctx.onNodePointerDown(frame.transformationId, event);
                if (!props.blocked && !dragLocked()) gesture.beginPress(frame.id, event);
              }}
            >
              <div style={{
                position: 'absolute', top: '0', left: '50%', transform: 'translate(-50%, -50%)',
                padding: frame.compact ? '2px 7px' : '3px 10px', background: 'var(--surface-alt)', color: 'var(--fg)',
                border: '2px solid var(--color-token-moss)', 'border-radius': '999px',
                'font-size': frame.compact ? '9px' : '11px', 'font-weight': 700, 'white-space': 'nowrap',
                'text-transform': 'uppercase', 'letter-spacing': '.08em',
              }}>
                {frame.name} Contract Pair
              </div>
              <div style={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: frame.compact ? '18px' : '24px', height: frame.compact ? '18px' : '24px', display: 'grid', 'place-items': 'center',
                background: 'var(--surface-alt)', color: 'var(--color-token-moss)',
                border: '2px solid var(--color-token-moss)', 'border-radius': '999px',
                'font-size': frame.compact ? '12px' : '15px', 'font-weight': 800,
              }} aria-hidden="true">↓</div>
            </div>
          );
        }}
      </For>
      <For each={props.nodes()}>
        {(node) => {
          const dragLocked = () => node.kind === 'container'
            && containerDragLocked(node, ctx.transform().k, props.viewportSize());
          const showSecondary = () => showsSecondaryNodeContent(node, ctx.transform().k);
          const delta = () => dragDelta(node.renderId);
          const containerTint = () => node.depth % 2 === 0
            ? 'color-mix(in srgb, var(--surface-alt) 76%, var(--color-token-ochre) 24%)'
            : 'color-mix(in srgb, var(--surface-alt) 72%, var(--color-token-moss) 28%)';
          const containerBorder = () => node.depth % 2 === 0
            ? 'var(--color-token-ochre)'
            : 'var(--color-token-moss)';
          const facetRole = () => {
            if (node.kind !== 'contract') return null;
            const frame = props.contractFrames().find((candidate) => (
              candidate.input === node.item.id || candidate.output === node.item.id
            ));
            if (!frame) return null;
            return frame.input === node.item.id ? 'input' : 'output';
          };
          const contractKind = () => node.kind === 'contract' ? node.item.kind : undefined;
          const contractBackground = () => contractKind() === 'environment-settings'
            ? 'var(--color-kind-datasource-bg)'
            : contractKind() === 'options'
              ? 'var(--color-kind-memo-bg)'
              : contractKind()
                ? 'var(--color-kind-effect-bg)'
                : 'var(--color-kind-signal-bg)';
          const contractBorder = () => contractKind() === 'environment-settings'
            ? 'var(--color-kind-datasource-border)'
            : contractKind() === 'options'
              ? 'var(--color-kind-memo-border)'
              : contractKind()
                ? 'var(--color-kind-effect-border)'
                : 'var(--color-kind-signal-border)';
          return (
            <NodeContainer
          nodeId={node.renderId}
          x={() => node.x + delta().dx}
          y={() => node.y + delta().dy}
          w={() => node.w}
          h={() => node.h}
          visualBand={() => node.kind === 'container' ? node.depth : LEAF_VISUAL_BAND + node.depth}
          softContainer={() => node.kind === 'container'}
          containerTint={containerTint}
          containerBorder={containerBorder}
          containerBorderWidth={() => 2}
          containerInset={() => ({ top: 38, left: 0, right: 0, bottom: 0 })}
          onPointerDown={(event) => {
            if (node.kind === 'container' && node.state === 'expanded' && event.button === 0
              && isOverContainerInterior(event.currentTarget as Element, event.clientX, event.clientY)) return;
            if (node.kind === 'container' && node.state === 'covered' && event.button === 0) {
              event.stopPropagation();
            }
            ctx.onNodePointerDown(node.renderId, event);
            if (!props.blocked && !dragLocked()) gesture.beginPress(node.renderId, event);
          }}
        >
          <Show when={node.kind === 'container'}>
            <div style={{
              height: node.kind === 'container' && node.state === 'collapsed' ? '100%' : '38px',
              padding: '0 4px', display: 'flex', 'align-items': 'center', gap: '4px',
              color: 'var(--fg)', 'font-size': '15px', 'font-weight': 650,
              border: ctx.isSelected(node.renderId) ? '3px solid var(--accent)' : `2px solid ${containerBorder()}`,
              'border-radius': node.kind === 'container' && node.state === 'collapsed' ? '10px' : '10px 10px 0 0',
              background: containerTint(),
              cursor: dragLocked() ? 'not-allowed' : gesture.isDraggingNode(node.renderId) ? 'grabbing' : 'grab',
            }}>
              <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                {node.item.name}
              </span>
              <div style={{ 'margin-left': 'auto', display: 'flex', gap: '2px', 'flex-shrink': 0 }} data-no-pan>
                <Show when={node.kind === 'container' && node.expanded}>
                  <button
                    type="button"
                    aria-label={`Space children of ${node.item.name}`}
                    title="Space children"
                    on:pointerdown={(event) => event.stopPropagation()}
                    on:click={(event) => {
                      event.stopPropagation();
                      props.onSpace(node.item.id);
                    }}
                    style={containerButtonStyle}
                  >Space</button>
                  <DagLayoutMenu
                    name={node.item.name}
                    onArrange={(direction) => props.onArrange(node.item.id, direction)}
                  />
                </Show>
                <button
                  type="button"
                  aria-label={`Expand ${node.item.name}`}
                  title="Expand"
                  disabled={node.kind === 'container' && node.expanded}
                  on:pointerdown={(event) => event.stopPropagation()}
                  on:click={(event) => {
                    event.stopPropagation();
                    props.onExpand(node.item.id);
                  }}
                  style={{
                    ...containerButtonStyle,
                    opacity: node.kind === 'container' && node.expanded ? 0.38 : 1,
                  }}
                >+</button>
                <button
                  type="button"
                  aria-label={`Collapse ${node.item.name}`}
                  title="Collapse"
                  disabled={node.kind === 'container' && node.state === 'collapsed'}
                  on:pointerdown={(event) => event.stopPropagation()}
                  on:click={(event) => {
                    event.stopPropagation();
                    props.onCollapse(node.item.id);
                  }}
                  style={{
                    ...containerButtonStyle,
                    opacity: node.kind === 'container' && node.state === 'collapsed' ? 0.38 : 1,
                  }}
                >−</button>
                <button
                  type="button"
                  aria-label={`Cover ${node.item.name}`}
                  title="Cover"
                  disabled={node.kind === 'container' && !node.expanded}
                  on:pointerdown={(event) => event.stopPropagation()}
                  on:click={(event) => {
                    event.stopPropagation();
                    props.onCover(node.item.id);
                  }}
                  style={{
                    ...containerButtonStyle,
                    opacity: node.kind === 'container' && !node.expanded ? 0.38 : 1,
                  }}
                >Cover</button>
              </div>
            </div>
          </Show>
          <Show when={node.kind === 'transformation'}>
            <div style={{
              width: '100%', height: '100%', padding: '16px', display: 'flex',
              'flex-direction': 'column', 'justify-content': 'center', gap: '10px',
              background: 'var(--surface)', color: 'var(--fg)',
              border: ctx.isSelected(node.renderId) ? '3px solid var(--accent)' : '2px solid var(--border-strong)',
              'border-radius': '3px', 'box-shadow': 'var(--shadow-sm)', overflow: 'hidden',
              cursor: gesture.isDraggingNode(node.renderId) ? 'grabbing' : 'grab',
            }}>
              <span style={{ 'font-size': '11px', 'text-transform': 'uppercase', 'letter-spacing': '.1em', color: 'var(--fg-muted)' }}>Transformation</span>
              <strong style={{ 'font-size': '18px', 'line-height': 1.2 }}>{node.item.name}</strong>
              <Show when={showSecondary()}>
                <span style={{ 'font-size': '12px', 'line-height': 1.35, color: 'var(--fg-muted)', display: '-webkit-box', '-webkit-line-clamp': 4, '-webkit-box-orient': 'vertical', overflow: 'hidden' }}>
                  {node.kind === 'transformation' ? node.item.prose : ''}
                </span>
                <Show when={node.kind === 'transformation' && node.item.needs?.length}>
                  <span style={{ 'font-size': '11px', color: 'var(--fg-muted)', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                    Needs: {node.kind === 'transformation' ? node.item.needs?.join(', ') : ''}
                  </span>
                </Show>
              </Show>
            </div>
          </Show>
          <Show when={node.kind === 'contract' ? node : null}>
            {(contractNode) => (
              <NylonContractContent
                node={contractNode()}
                selected={() => ctx.isSelected(contractNode().renderId)}
                dragging={() => gesture.isDraggingNode(contractNode().renderId)}
                facetRole={facetRole()}
                contractKind={contractKind()}
                background={contractBackground()}
                border={contractBorder()}
                showSecondary={showSecondary}
              />
            )}
          </Show>
            </NodeContainer>
          );
        }}
      </For>
    </>
  );
}

function NylonContractContent(props: {
  node: Extract<NylonRenderNode, { kind: 'contract' }>;
  selected: () => boolean;
  dragging: () => boolean;
  facetRole: string | null;
  contractKind: string | undefined;
  background: string;
  border: string;
  showSecondary: () => boolean;
}): JSX.Element {
  return (
    <Show
      when={props.node.compact}
      fallback={
        <div style={{
          width: '100%', height: '100%', padding: '14px 22px', display: 'flex',
          'flex-direction': 'column', 'justify-content': 'center', gap: '6px',
          background: props.background, color: 'var(--fg)',
          border: props.selected() ? '3px solid var(--accent)' : `2px solid ${props.border}`,
          'border-radius': '999px', 'box-shadow': 'var(--shadow-sm)', overflow: 'hidden',
          cursor: props.dragging() ? 'grabbing' : 'grab',
        }}>
          <span style={{ 'font-size': '10px', 'text-transform': 'uppercase', 'letter-spacing': '.1em', color: 'var(--fg-muted)', 'text-align': 'center' }}>
            Contract{props.facetRole ? ` · ${props.facetRole}` : ''}{props.contractKind ? ` · ${props.contractKind}` : ''}
          </span>
          <strong style={{ 'font-size': '15px', 'line-height': 1.2, 'text-align': 'center' }}>{props.node.item.name}</strong>
          <Show when={props.showSecondary()}>
            <span style={{ 'font-family': 'ui-monospace, monospace', 'font-size': '11px', 'line-height': 1.3, color: 'var(--fg-muted)', 'white-space': 'pre-line', 'text-align': 'center', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
              {props.node.item.text}
            </span>
          </Show>
        </div>
      }
    >
      <div style={{
        width: '100%', height: '100%', padding: '2px 6px', display: 'flex',
        'flex-direction': 'column', 'justify-content': 'center', gap: '0',
        background: props.background, color: 'var(--fg)',
        border: props.selected() ? '3px solid var(--accent)' : `2px solid ${props.border}`,
        'border-radius': '999px', 'box-shadow': 'var(--shadow-sm)', overflow: 'hidden',
        cursor: props.dragging() ? 'grabbing' : 'grab',
      }}>
        <span style={{ 'font-size': '10px', 'text-transform': 'uppercase', 'letter-spacing': '.08em', color: 'var(--fg-muted)', 'text-align': 'center' }}>
          {props.facetRole ?? 'contract'}
        </span>
        <strong style={{ 'font-size': '15px', 'line-height': 1.1, 'text-align': 'center', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
          {props.node.item.name}
        </strong>
      </div>
    </Show>
  );
}

function DagLayoutMenu(props: {
  name: string;
  onArrange: (direction: NylonDagDirection) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
  const schema = (): MenuSchema => ({
    id: 'nylon-dag-direction',
    items: [
      ['LR', 'Left to right'],
      ['TD', 'Top to down'],
      ['RL', 'Right to left'],
      ['DT', 'Down to top'],
    ].map(([direction, label]) => ({
      type: 'action' as const,
      action: { id: `layout.dag.${direction}`, label, payload: direction },
    })),
  });

  return (
    <>
      <button
        type="button"
        aria-label={`Order ${props.name} with DAG layout`}
        aria-haspopup="menu"
        title="DAG layout"
        on:pointerdown={(event) => event.stopPropagation()}
        on:click={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ x: rect.left, y: rect.bottom + 2 });
          setOpen(true);
        }}
        style={containerButtonStyle}
      >
        DAG <span aria-hidden="true">▾</span>
      </button>
      <Show when={open()}>
        <Portal>
          <MenuRoot
            schema={schema()}
            open
            onOpenChange={setOpen}
            anchorX={anchor().x}
            anchorY={anchor().y}
            onAction={(_id, payload) => {
              props.onArrange(payload as NylonDagDirection);
              setOpen(false);
            }}
          />
        </Portal>
      </Show>
    </>
  );
}

function NylonInspector(props: {
  doc: NylonDocument;
  selectedId: string | null;
  onClose: () => void;
  onDifferentiate: (id: string) => void;
}): JSX.Element {
  const selected = createMemo(() => {
    if (props.selectedId === null) return null;
    const transformation = props.doc.transformations.find((item) => item.id === props.selectedId);
    if (transformation) return { kind: 'transformation' as const, item: transformation };
    const contract = props.doc.contracts.find((item) => item.id === props.selectedId);
    return contract ? { kind: 'contract' as const, item: contract } : null;
  });
  const hasChildren = (id: string) => [...props.doc.transformations, ...props.doc.contracts].some((item) => item.parent === id);

  return (
    <Show when={selected()}>
      {(selection) => (
        <aside class="absolute right-3 top-12 z-40 flex w-80 flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4 text-sm shadow-md">
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
                      <div class="mb-1 text-[10px] uppercase tracking-wider text-fg-muted">Contract Pair</div>
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
        </aside>
      )}
    </Show>
  );
}
