import { For, createResource, Show, createMemo, createSignal, createEffect } from 'solid-js';
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

export interface ViewerHandle {
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

type NodeRect = { id: string; x: number; y: number; width: number; height: number };

export interface PgCanvasViewProps {
  graph: Graph;
  view: View;
  algorithm?: 'grid' | 'elk';
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
        return (
          <NodeContainer
            nodeId={nodeId}
            x={() => abs().x}
            y={() => abs().y}
            w={() => sz().w}
            h={() => sz().h}
            onPointerDown={onPointerDown ? (e) => onPointerDown(nodeId, e) : undefined}
          >
            {resolveNodeRender(node, renderCtx)}
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
  algorithm?: 'grid' | 'elk';
  exposeRects?: (getter: () => NodeRect[]) => void;
  onEdges?: (edges: EdgeDeclaration[]) => void;
  exposeInspect?: (fn: (id: string) => void) => void;
}): JSX.Element {
  const inspector = createInspector();
  const canvasCtx = useCanvasContext();

  // eslint-disable-next-line solid/reactivity -- exposeInspect is a one-shot registration callback
  props.exposeInspect?.((id) => inspector.open(id));

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

  // Stability guard: only propagate new leaf sizes when ≥1px change occurs, preventing
  // layout thrash during the initial ResizeObserver burst.
  let prevLeafSizes: ReadonlyMap<string, { w: number; h: number }> = new Map();
  const measuredLeafSizes = createMemo<ReadonlyMap<string, { w: number; h: number }>>(() => {
    const rects = canvasCtx.getNodeRects();
    const childrenMap = containment().childrenOf;
    const next = new Map<string, { w: number; h: number }>();
    let changed = false;
    for (const [id, rect] of rects) {
      const kids = childrenMap.get(id);
      if (kids && kids.length > 0) continue;
      next.set(id, { w: rect.w, h: rect.h });
      const p = prevLeafSizes.get(id);
      if (!p || Math.abs(p.w - rect.w) >= 1 || Math.abs(p.h - rect.h) >= 1) changed = true;
    }
    if (!changed && next.size === prevLeafSizes.size) return prevLeafSizes;
    prevLeafSizes = next;
    return next;
  });

  // headerHeight: 60 ≈ label 22px + tag chip + description 24px + padding 8+8.
  // Per-parent overrides come from measuredHeaderHeights; 60 is the fallback for unmigrated renderers.
  const HEADER_HEIGHT = 60;

  // Stability guard: only propagate new header heights when ≥1px change occurs.
  let prevHeaders: ReadonlyMap<string, number> = new Map();
  const measuredHeaderHeights = createMemo<ReadonlyMap<string, number>>(() => {
    const heights = canvasCtx.getHeaderHeights();
    let changed = heights.size !== prevHeaders.size;
    for (const [id, h] of heights) {
      const p = prevHeaders.get(id);
      if (p === undefined || Math.abs(p - h) >= 1) changed = true;
    }
    if (!changed) return prevHeaders;
    prevHeaders = new Map(heights);
    return prevHeaders;
  });

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

  // Both layouts are created unconditionally so the chosen one can swap reactively
  // with props.algorithm. The elk source returns null when not selected, suppressing fetches.
  const [elkResult] = createResource(
    () => props.algorithm === 'elk'
      ? {
          rootIds: containment().rootIds,
          childrenOf: containment().childrenOf,
          edges: layoutEdges(),
          nodeSizes: measuredLeafSizes(),
          headerHeight: HEADER_HEIGHT,
          headerHeights: measuredHeaderHeights(),
        }
      : null,
    (input): Promise<LayoutResult> => elkLayout(input, { direction: 'RIGHT' }),
  );

  const gridResult = createMemo(() => gridLayout({
    rootIds: containment().rootIds,
    childrenOf: containment().childrenOf,
    nodeSizes: measuredLeafSizes(),
    headerHeight: HEADER_HEIGHT,
    headerHeights: measuredHeaderHeights(),
    edges: layoutEdges(),
  }));

  const baseLayout = createMemo<LayoutResult | null>(
    () => props.algorithm === 'elk' ? (elkResult() ?? null) : gridResult(),
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
  let inspectFn: ((id: string) => void) | undefined;

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
        exposeRects={(g) => { getRects = g; emit(); }}
        onEdges={setEdges}
        exposeInspect={(fn) => { inspectFn = fn; }}
      />
    </Canvas>
  );
}
