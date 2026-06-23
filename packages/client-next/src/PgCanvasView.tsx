import { For, createResource, Show, createMemo, createSignal, createEffect, onCleanup, untrack } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { JSX } from 'solid-js';
import type { Graph, View, DisclosureLevel, RenderContext, Node, Edge } from '@luminous/core';
import {
  evaluateView,
  getNodeKind, getEdgeKind,
  interpretRender, generateFallbackRender,
} from '@luminous/core';
import type { ChromeSchema, MenuSchema } from '@luminous/core';
import {
  Canvas,
  NodeContainer,
  resolveAbsolutePositionByParentOf,
  composeLayout,
  useCanvasContext,
  useNodeDrag,
} from '@luminous/cactus';
import type { LayoutResult, CanvasRef, EdgeDeclaration } from '@luminous/cactus';
import { InspectorContext } from './inspector/InspectorContext';
import { createInspector } from './inspector/createInspector';
import { InspectorPanel } from './inspector/InspectorPanel';
import { levelFromZoom } from './disclosure/levelFromZoom';
import { measureDeepLod } from './deepLodMeasure';

export interface ViewerHandle {
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

type NodeRect = { id: string; x: number; y: number; width: number; height: number };

export interface PgCanvasViewProps {
  graph: Graph;
  view: View;
  algorithm?: 'grid' | 'elk' | 'mrtree';
  direction?: 'RIGHT' | 'DOWN';
  spacing?: number;
  ref?: (handle: ViewerHandle) => void;
  chrome?: ChromeSchema;
  onAction?: (id: string, payload?: unknown) => void;
  nodeContextMenu?: (nodeId: string) => MenuSchema | undefined;
  backgroundContextMenu?: () => MenuSchema | undefined;
}

const PALETTE = [
  '#6ea8d4', // soft blue
  '#5bab9b', // teal
  '#d4a04e', // amber
  '#9b78c8', // violet
  '#d47878', // rose
  '#6ab878', // green
];

/**
 * Estimate the rendered size of an edge label so layouts reserve space for it.
 * Mirrors EdgeLayer: SVG <text font-size=10>, capped at 28 chars, with a 4px
 * stroke halo. ~5.6px average glyph advance at 10px is a deliberate slight
 * over-estimate so labels never overlap.
 */
function estimateEdgeLabelSize(text: string): { w: number; h: number } {
  const chars = Math.min(text.length, 28);
  return { w: chars * 5.6 + 8, h: 16 };
}

/** BFS topological order from roots through childrenOf — parents before children. */
function bfsOrder(
  rootIds: readonly string[],
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>
): string[] {
  const order: string[] = [];
  const queue: string[] = [...rootIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const children = childrenOf.get(id) ?? [];
    queue.push(...children);
  }
  return order;
}

// Mirrors registry.ts DISCLOSURE_ORDER — walk from requested level downward.
const DISCLOSURE_ORDER: DisclosureLevel[] = ['deep', 'open', 'card', 'peek'];

function resolveAtLevel<T>(
  record: Partial<Record<DisclosureLevel, T>>,
  level: DisclosureLevel,
): T | undefined {
  const startIdx = DISCLOSURE_ORDER.indexOf(level);
  for (let i = startIdx; i < DISCLOSURE_ORDER.length; i++) {
    const r = record[DISCLOSURE_ORDER[i]];
    if (r !== undefined) return r;
  }
  return undefined;
}

function resolveNodeRender(node: Node, ctx: RenderContext): JSX.Element {
  const level = ctx.level();
  const kind = getNodeKind(node.kind);
  const content = node.props as Record<string, unknown>;

  if (kind?.render) {
    const renderNode = resolveAtLevel(kind.render, level);
    if (renderNode) return interpretRender(renderNode, ctx, content);
  }

  return interpretRender(generateFallbackRender(kind, content), ctx, content);
}

function resolveEdgeParts(
  edge: Edge,
  level: DisclosureLevel,
  ctx: RenderContext,
): { labelText: string | undefined; label: (() => JSX.Element) | undefined } {
  const kind = getEdgeKind(edge.kind);
  const content = edge.props as Record<string, unknown>;

  if (kind?.render) {
    const renderNode = resolveAtLevel(kind.render, level);
    if (renderNode) {
      const captured = renderNode;
      return { labelText: undefined, label: () => interpretRender(captured, ctx, content) };
    }
  }

  const labelProp = content['label'];
  if (typeof labelProp === 'string' && labelProp) {
    return { labelText: labelProp, label: undefined };
  }
  return { labelText: undefined, label: undefined };
}

function renderNodes(
  graph: Graph,
  renderOrder: () => string[],
  layout: () => LayoutResult,
  parentOf: () => ReadonlyMap<string, string>,
  renderCtx: RenderContext,
  resolveChildLayout: (id: string) => 'pack' | 'grid' | 'stack-v' | 'stack-h',
  onPointerDown?: (nodeId: string, e: PointerEvent) => void,
): JSX.Element {
  return (
    <For each={renderOrder()}>
      {(nodeId) => {
        const node = graph.nodes.get(nodeId);
        if (!node) return null;
        const abs = createMemo(
          () => resolveAbsolutePositionByParentOf(nodeId, layout().positions, parentOf()),
          undefined,
          { equals: (a, b) => a.x === b.x && a.y === b.y },
        );
        const sz = createMemo(
          () => layout().sizes.get(nodeId) ?? { w: 120, h: 60 },
          undefined,
          { equals: (a, b) => a.w === b.w && a.h === b.h },
        );
        const nodeCtx = { ...renderCtx, currentNodeId: () => nodeId };
        return (
          <NodeContainer
            nodeId={nodeId}
            x={() => abs().x}
            y={() => abs().y}
            w={() => sz().w}
            h={() => sz().h}
            softContainer={() => renderCtx.hasChildren(nodeId)}
            isContainer={() => renderCtx.hasChildren(nodeId)}
            layoutPolicy={() => resolveChildLayout(nodeId)}
            onPointerDown={onPointerDown ? (e) => onPointerDown(nodeId, e) : undefined}
          >
            {resolveNodeRender(node, nodeCtx)}
          </NodeContainer>
        );
      }}
    </For>
  );
}

/**
 * Inner component rendered inside <Canvas> so it can access CanvasContext.
 * Exposes its computed edges via the onEdges callback (called reactively when edges change).
 */
function CanvasInner(props: {
  graph: Graph;
  view: View;
  algorithm?: 'grid' | 'elk' | 'mrtree';
  direction?: 'RIGHT' | 'DOWN';
  spacing?: number;
  exposeRects?: (getter: () => NodeRect[]) => void;
  onEdges?: (edges: EdgeDeclaration[]) => void;
  exposeInspect?: (fn: (id: string, opts?: { debug?: boolean }) => void) => void;
}): JSX.Element {
  const inspector = createInspector();
  const canvasCtx = useCanvasContext();

  // eslint-disable-next-line solid/reactivity -- exposeInspect is a one-shot registration callback
  props.exposeInspect?.((id, opts) => inspector.open(id, opts));

  const scene = createMemo(() => evaluateView(props.graph, props.view));
  const containment = createMemo(() => scene().containment);
  const renderOrder = createMemo(() => bfsOrder(containment().rootIds, containment().childrenOf));

  const level = createMemo<DisclosureLevel>(() =>
    levelFromZoom(canvasCtx.transform().k, props.view.zoomToLevel)
  );

  const renderCtx: RenderContext = {
    level,
    zoom: () => canvasCtx.transform().k,
    get view() { return props.view; },
    get graph() { return props.graph; },
    hasChildren: (id) => (containment().childrenOf.get(id)?.length ?? 0) > 0,
    inspect: (id) => inspector.open(id),
    sectionColorOf: (nodeId) => {
      const ct = containment();
      if (!ct.parentOf.has(nodeId)) return undefined;
      let ancestor = nodeId;
      while (ct.parentOf.has(ancestor)) {
        ancestor = ct.parentOf.get(ancestor)!;
      }
      const idx = ct.rootIndex.get(ancestor);
      return idx === undefined ? undefined : PALETTE[idx % PALETTE.length];
    },
  };

  // Build and expose edge declarations reactively.
  const edgeDeclarations = createMemo<EdgeDeclaration[]>(() => {
    const decls: EdgeDeclaration[] = [];
    const currentLevel = level();

    for (const edge of scene().arrows) {
      const { labelText, label } = resolveEdgeParts(edge, currentLevel, renderCtx);
      decls.push({
        id: edge.id,
        sourceId: edge.from,
        targetId: edge.to,
        styling: { arrowHead: true, dash: 'solid' },
        label,
        labelText,
      });
    }

    for (const edge of scene().summaryEdges) {
      const { labelText, label } = resolveEdgeParts(edge, currentLevel, renderCtx);
      decls.push({
        id: edge.id,
        sourceId: edge.from,
        targetId: edge.to,
        styling: { dash: 'dotted', arrowHead: false },
        label,
        labelText,
      });
    }

    return decls;
  });

  createEffect(() => {
    props.onEdges?.(edgeDeclarations());
  });

  // --- Node drag ---
  const [nodeOverrides, setNodeOverrides] = createSignal<Map<string, { x: number; y: number }>>(new Map());
  const dragStartPositions = new Map<string, { x: number; y: number }>();
  let latestBasePositions: ReadonlyMap<string, { x: number; y: number }> = new Map();

  const { onPointerDown: dragPointerDown } = useNodeDrag({
    zoomScale: () => canvasCtx.transform().k,
    callbacks: {
      onDragStart: (nodeId) => {
        const overridePos = nodeOverrides().get(nodeId);
        const basePos = latestBasePositions.get(nodeId);
        const pos = overridePos ?? basePos;
        if (pos) dragStartPositions.set(nodeId, { ...pos });
      },
      onDrag: (nodeId, dx, dy) => {
        const start = dragStartPositions.get(nodeId);
        if (!start) return;
        setNodeOverrides((prev) => {
          const next = new Map(prev);
          next.set(nodeId, { x: start.x + dx, y: start.y + dy });
          return next;
        });
      },
      onDragEnd: (nodeId) => {
        dragStartPositions.delete(nodeId);
      },
    },
  });

  function applyOverrides(base: LayoutResult): LayoutResult {
    const overrides = nodeOverrides();
    if (overrides.size === 0) return base;
    const positions = new Map(base.positions);
    for (const [id, pos] of overrides) positions.set(id, pos);
    return { ...base, positions };
  }

  // headerHeight: 60 ≈ label 22px + tag chip + description 24px + padding 8+8.
  // Per-node overrides come from deepLodGeometry().headerHeights; 60 is the fallback.
  const HEADER_HEIGHT = 60;

  // Deep-LOD geometry: measure every node at its finest disclosure level once,
  // keyed on graph identity. Does NOT track zoom or LOD — layout is stable under zoom.
  const deepLodGeometry = createMemo(() => measureDeepLod(props.graph, props.view));

  // Edge inputs for layout, carrying estimated label dimensions so both layouts
  // reserve space for labels. Matches EdgeLayer's SVG <text font-size=10> + 28-char cap.
  const layoutEdges = createMemo(() => {
    const currentLevel = level();
    return scene().arrows.map((a) => {
      const { labelText } = resolveEdgeParts(a, currentLevel, renderCtx);
      return {
        id: a.id ?? `${a.from}->${a.to}`,
        from: a.from,
        to: a.to,
        label: labelText ? estimateEdgeLabelSize(labelText) : undefined,
      };
    });
  });

  // Resolve the effective childLayout policy for a container node.
  // Checks the transient session override first, then falls back to the graph prop.
  function resolveChildLayout(id: string): 'pack' | 'grid' | 'stack-v' | 'stack-h' {
    const o = canvasCtx.layoutOverride(id);
    if (o) return o;
    const raw = (props.graph.nodes.get(id)?.props as Record<string, unknown> | undefined)?.childLayout;
    if (raw === 'pack' || raw === 'grid' || raw === 'stack-v' || raw === 'stack-h') return raw;
    return 'pack';
  }

  const layoutPolicy = createMemo((): ReadonlyMap<string, 'pack' | 'grid' | 'stack-v' | 'stack-h'> => {
    const map = new Map<string, 'pack' | 'grid' | 'stack-v' | 'stack-h'>();
    for (const [id, kids] of containment().childrenOf) {
      if (kids.length > 0) map.set(id, resolveChildLayout(id));
    }
    return map;
  });

  // Drag pins are ephemeral. Applying a layout to a container (every layout-picker
  // click, INCLUDING re-clicking the already-active layout) re-places that
  // container's direct children, so their manual drags are discarded — applying a
  // layout always wins over a stale pin. Driven by layoutApply (an explicit
  // per-click tick) rather than the policy value, so re-applying the current
  // layout still resets. containment is read untracked so only the click fires it.
  let lastApplySeq = -1;
  createEffect(() => {
    const apply = canvasCtx.layoutApply();
    if (!apply || apply.seq === lastApplySeq) return;
    lastApplySeq = apply.seq;
    const children = untrack(() => containment().childrenOf.get(apply.id) ?? []);
    if (children.length === 0) return;
    setNodeOverrides((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      let changed = false;
      for (const child of children) {
        if (next.delete(child)) changed = true;
      }
      return changed ? next : prev;
    });
  });

  // Per-node soft layering hints for the top-level pass, read from the `tier` prop.
  const layerHints = createMemo(() => {
    const hints = new Map<string, number>();
    for (const [id, node] of props.graph.nodes) {
      const t = (node.props as Record<string, unknown> | undefined)?.tier;
      if (typeof t === 'number' && Number.isFinite(t)) hints.set(id, t);
    }
    return hints;
  });

  // Single layout solve. cactus owns the full composition (interior pass +
  // top-level pass + merge); the domain just declares intent and renders the
  // result. Because both phases derive from one snapshot, the container box size
  // and its children's positions can never come from desynced passes — the whole
  // layout swaps atomically when policy/algorithm changes.
  const [baseLayout] = createResource(
    () => ({
      rootIds: containment().rootIds,
      childrenOf: containment().childrenOf,
      nodeSizes: deepLodGeometry().sizes,
      headerHeight: HEADER_HEIGHT,
      headerHeights: deepLodGeometry().headerHeights,
      headerWidths: deepLodGeometry().headerWidths,
      edges: layoutEdges(),
      policies: layoutPolicy(),
      layerHints: layerHints(),
      top: {
        algorithm:
          props.algorithm === 'elk' ? ('elk' as const)
          : props.algorithm === 'mrtree' ? ('mrtree' as const)
          : ('grid' as const),
        direction: props.direction,
        spacing: props.spacing ?? 1,
      },
    }),
    composeLayout,
  );

  createEffect(() => {
    const base = baseLayout();
    if (base) latestBasePositions = base.positions;
  });

  const effectiveLayout = createMemo(() => {
    const base = baseLayout();
    return base ? applyOverrides(base) : null;
  });

  const getRects = (): NodeRect[] => {
    const lay = effectiveLayout();
    if (!lay) return [];
    return containment().rootIds.flatMap((id) => {
      const pos = lay.positions.get(id);
      const sz = lay.sizes.get(id);
      return pos && sz ? [{ id, x: pos.x, y: pos.y, width: sz.w, height: sz.h }] : [];
    });
  };
  // eslint-disable-next-line solid/reactivity -- exposeRects is a one-shot registration callback
  props.exposeRects?.(getRects);

  // Auto-fit the viewport to the graph once on initial load. The layout settles
  // over several reactive passes as ResizeObserver measures node sizes, so we
  // debounce: re-arm the timer on every layout change and fit once it goes quiet.
  let autoFitDone = false;
  let autoFitTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    if (autoFitDone) return;
    effectiveLayout(); // track layout changes through the measurement burst
    if (getRects().length === 0) return;
    if (autoFitTimer !== undefined) clearTimeout(autoFitTimer);
    autoFitTimer = setTimeout(() => {
      autoFitDone = true;
      canvasCtx.fitView(getRects(), 64, false);
    }, 150);
  });
  onCleanup(() => {
    if (autoFitTimer !== undefined) clearTimeout(autoFitTimer);
  });

  return (
    <InspectorContext.Provider value={inspector}>
      <Show
        when={effectiveLayout()}
        fallback={<div style={{ padding: '8px', color: 'var(--fg-muted)' }}>Computing layout…</div>}
      >
        {/* eslint-disable-next-line solid/reactivity -- renderNodes returns JSX evaluated inside the Show's tracked scope */}
        {(layout) => renderNodes(props.graph, renderOrder, layout, () => containment().parentOf, renderCtx, resolveChildLayout, dragPointerDown)}
      </Show>
      <Portal mount={document.body}>
        <InspectorPanel graph={props.graph} view={props.view} />
      </Portal>
    </InspectorContext.Provider>
  );
}

export function PgCanvasView(props: PgCanvasViewProps): JSX.Element {
  let canvasHandle: CanvasRef | undefined;
  let getRects: (() => NodeRect[]) | undefined;
  let inspectFn: ((id: string, opts?: { debug?: boolean }) => void) | undefined;

  const [edges, setEdges] = createSignal<EdgeDeclaration[]>([]);

  const emit = () => {
    if (!canvasHandle || !getRects || !props.ref) return;
    props.ref({
      fitView: () => canvasHandle!.fitView(getRects!(), 64),
      zoomIn: () => canvasHandle!.zoomIn(),
      zoomOut: () => canvasHandle!.zoomOut(),
    });
  };

  const handleAction = (id: string, payload?: unknown) => {
    if (id === 'NODE.INSPECT') {
      inspectFn?.((payload as { nodeId: string }).nodeId);
    } else if (id === 'NODE.DEBUG') {
      inspectFn?.((payload as { nodeId: string }).nodeId, { debug: true });
    } else {
      props.onAction?.(id, payload);
    }
  };

  return (
    <Canvas
      ref={(r) => { canvasHandle = r; emit(); }}
      edges={edges()}
      chrome={props.chrome}
      onAction={handleAction}
      nodeContextMenu={props.nodeContextMenu}
      backgroundContextMenu={props.backgroundContextMenu}
    >
      <CanvasInner
        graph={props.graph}
        view={props.view}
        algorithm={props.algorithm}
        direction={props.direction}
        spacing={props.spacing}
        exposeRects={(g) => { getRects = g; emit(); }}
        onEdges={setEdges}
        exposeInspect={(fn) => { inspectFn = fn; }}
      />
    </Canvas>
  );
}
