import { For, createResource, Show, createMemo, createSignal, createEffect, onCleanup } from 'solid-js';
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
  gridLayout,
  elkLayout,
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
      const idx = ct.rootIds.indexOf(ancestor);
      return idx === -1 ? undefined : PALETTE[idx % PALETTE.length];
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

  // All containers default to 'pack'. This map is the extension point for future per-node overrides.
  const layoutPolicy = createMemo((): ReadonlyMap<string, 'pack' | 'grid'> => {
    const map = new Map<string, 'pack' | 'grid'>();
    for (const [id, kids] of containment().childrenOf) {
      if (kids.length > 0) map.set(id, 'pack');
    }
    return map;
  });

  // gridResult: both the grid-mode output and the pack pre-pass for elk mode.
  const gridResult = createMemo(() => gridLayout({
    rootIds: containment().rootIds,
    childrenOf: containment().childrenOf,
    nodeSizes: deepLodGeometry().sizes,
    headerHeight: HEADER_HEIGHT,
    headerHeights: deepLodGeometry().headerHeights,
    headerWidths: deepLodGeometry().headerWidths,
    edges: layoutEdges(),
    layoutPolicy: layoutPolicy(),
  }));

  // Both layouts are created unconditionally so the chosen one can swap reactively
  // with props.algorithm. The elk source returns null when not selected, suppressing fetches.
  const [elkResult] = createResource(
    () => {
      if (props.algorithm !== 'elk' && props.algorithm !== 'mrtree') return null;
      const ct = containment();
      const gr = gridResult();
      const policy = layoutPolicy();

      // All 'pack' containers are opaque leaves to ELK — their sizes come from gridResult.
      const opaqueContainers = new Set<string>();
      for (const [id, p] of policy) {
        if (p === 'pack') opaqueContainers.add(id);
      }

      // Merge packed container sizes into nodeSizes so ELK can use them as fixed boxes.
      // Start from deep-LOD sizes (all nodes), then override pack containers with
      // their grid-computed sizes (which account for children).
      const mergedSizes = new Map(deepLodGeometry().sizes);
      for (const id of opaqueContainers) {
        const sz = gr.sizes.get(id);
        if (sz) mergedSizes.set(id, sz);
      }

      const layerHints = new Map<string, number>();
      for (const [id, node] of props.graph.nodes) {
        const t = (node.props as Record<string, unknown> | undefined)?.tier;
        if (typeof t === 'number' && Number.isFinite(t)) layerHints.set(id, t);
      }

      return {
        req: {
          rootIds: ct.rootIds,
          childrenOf: ct.childrenOf,
          edges: layoutEdges(),
          nodeSizes: mergedSizes as ReadonlyMap<string, { w: number; h: number }>,
          headerHeight: HEADER_HEIGHT,
          headerHeights: deepLodGeometry().headerHeights,
          headerWidths: deepLodGeometry().headerWidths,
          layerHints,
        },
        opaqueContainers,
        spacing: props.spacing ?? 1,
        algorithm: props.algorithm === 'mrtree' ? ('mrtree' as const) : ('layered' as const),
      };
    },
    (input): Promise<LayoutResult> =>
      elkLayout(input.req, {
        direction: 'DOWN',
        opaqueContainers: input.opaqueContainers,
        spacing: input.spacing,
        algorithm: input.algorithm,
      }),
  );

  const baseLayout = createMemo<LayoutResult | null>(() => {
    if (props.algorithm !== 'elk' && props.algorithm !== 'mrtree') return gridResult();

    const elkRes = elkResult();
    if (!elkRes) return null;

    const gr = gridResult();
    const ct = containment();

    // Positions: start with gridResult (parent-relative for non-roots), override roots with elk absolute positions.
    const positions = new Map(gr.positions);
    for (const rootId of ct.rootIds) {
      const elkPos = elkRes.positions.get(rootId);
      if (elkPos) positions.set(rootId, elkPos);
    }

    // Sizes: gridResult covers all nodes. Override with elk sizes where elk has them
    // (for roots elk returns what we gave it, so values agree).
    const sizes = new Map(gr.sizes);
    for (const [id, sz] of elkRes.sizes) {
      sizes.set(id, sz);
    }

    return { positions, sizes };
  });

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
        {(layout) => renderNodes(props.graph, renderOrder, layout, () => containment().parentOf, renderCtx, dragPointerDown)}
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
        spacing={props.spacing}
        exposeRects={(g) => { getRects = g; emit(); }}
        onEdges={setEdges}
        exposeInspect={(fn) => { inspectFn = fn; }}
      />
    </Canvas>
  );
}
