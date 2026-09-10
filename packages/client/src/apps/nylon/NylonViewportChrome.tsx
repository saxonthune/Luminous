import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { NylonDocument } from '@luminous/core/nylon';
import type { Transform } from '@luminous/cactus';
import type { NylonContractFrame, NylonProjection, NylonRenderNode } from '@luminous/core/nylon/projection';
import {
  NYLON_VIEW_POLICY,
  canvasViewport,
  rectContainsPoint,
  rectIsFullyVisible,
  relativeZoom,
  type ViewRect,
  type ViewportSize,
} from './viewportPolicy.ts';

export interface GhostNode {
  id: string;
  name: string;
  kind?: string;
  x: number;
  y: number;
  target: NylonRenderNode;
}

export function NylonViewportChrome(props: {
  doc: NylonDocument;
  projection: NylonProjection;
  selectedId: string | null;
  camera: Transform;
  viewport: ViewportSize;
  onNavigate: (x: number, y: number) => void;
  onNavigateNode: (node: NylonRenderNode) => void;
  view?: import('@luminous/core/nylon/projection').NylonViewDefinition;
  onOpenView?: (focusId: string | null) => void;
}): JSX.Element {
  const items = createMemo(() => new Map([
    ...props.doc.transformations.map((item) => [item.id, item] as const),
    ...props.doc.contracts.map((item) => [item.id, item] as const),
  ]));
  const transformations = createMemo(() => new Map(props.doc.transformations.map((item) => [item.id, item])));
  const focusPath = createMemo(() => {
    const path: { id: string | null; name: string }[] = [];
    let id = props.view?.kind === 'standard' ? props.view.focusId : null;
    const seen = new Set<string>();
    while (id !== null && !seen.has(id)) {
      seen.add(id);
      const item = transformations().get(id);
      path.unshift({ id, name: item?.name ?? id });
      id = item?.parent ?? null;
    }
    return [{ id: null, name: 'Document root' }, ...path];
  });

  const selectedPath = createMemo(() => {
    if (!props.selectedId || !items().has(props.selectedId)) return null;
    const path: string[] = [];
    let id: string | undefined = props.selectedId;
    const seen = new Set<string>();
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      path.unshift(items().get(id)?.name ?? id);
      id = items().get(id)?.parent;
    }
    return path;
  });

  const contextPath = createMemo(() => {
    const selected = selectedPath();
    if (selected) return selected;
    const visible = canvasViewport(props.camera, props.viewport);
    const center = { x: visible.x + visible.w / 2, y: visible.y + visible.h / 2 };
    const context = props.projection.nodes
      .filter((node) => node.kind === 'container'
        && rectContainsPoint(node, center)
        && relativeZoom(node, props.camera.k, props.viewport) >= NYLON_VIEW_POLICY.contextMinRelativeZoom)
      .sort((a, b) => b.depth - a.depth)[0];
    if (!context) return ['Document canvas'];
    const parent = context.item.parent ? transformations().get(context.item.parent) : undefined;
    return parent ? [parent.name, context.item.name] : [context.item.name];
  });

  const ghostNodes = createMemo(() => buildGhostNodes(
    props.doc,
    props.projection,
    props.selectedId,
    props.camera,
    props.viewport,
  ));

  return (
    <>
      <div
        aria-label="Canvas context"
        style={{
          position: 'absolute', top: '0', left: '0', right: '0',
          height: `${NYLON_VIEW_POLICY.hudHeight}px`, display: 'flex', 'align-items': 'center',
          gap: '12px', padding: '0 14px', 'z-index': '40', 'pointer-events': 'none',
          background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
          border: 'solid var(--border-subtle)', 'border-width': '0 0 1px',
          'backdrop-filter': 'blur(6px)', color: 'var(--fg)', 'font-size': '12px',
        }}
      >
        <span style={{ 'font-variant-numeric': 'tabular-nums', 'font-weight': 700 }}>
          {Math.round(props.camera.k * 100)}%
        </span>
        <span style={{ color: 'var(--fg-muted)' }}>·</span>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '7px', overflow: 'hidden' }}>
          <Show when={props.view?.kind === 'standard'} fallback={
          <For each={contextPath()}>
            {(part, index) => (
              <>
                <Show when={index() > 0}><span style={{ color: 'var(--fg-muted)' }}>›</span></Show>
                <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>{part}</span>
              </>
            )}
          </For>
          }>
            <span class="shrink-0 text-fg-muted">Standard View ·</span>
            <nav aria-label="Focus Transformation ancestry" style={{ display: 'flex', gap: '5px', overflow: 'auto', 'pointer-events': 'auto' }}>
              <For each={focusPath()}>{(part, index) => (
                <>
                  <Show when={index() > 0}><span aria-hidden="true">›</span></Show>
                  <button type="button" class="shrink-0 hover:underline" title={part.id ?? 'Document root'}
                    onClick={() => props.onOpenView?.(part.id)}>{part.name}</button>
                </>
              )}</For>
            </nav>
          </Show>
        </div>
      </div>

      <For each={ghostNodes()}>
        {(ghost) => (
          <button
            type="button"
            aria-label={`Go to ${ghost.name}`}
            title={`Go to ${ghost.name}`}
            onClick={() => props.onNavigateNode(ghost.target)}
            style={{
              position: 'absolute', left: `${ghost.x}px`, top: `${ghost.y}px`,
              width: `${NYLON_VIEW_POLICY.ghostWidth}px`, height: `${NYLON_VIEW_POLICY.ghostHeight}px`,
              'z-index': '35', display: 'flex', 'flex-direction': 'column',
              'align-items': 'center', 'justify-content': 'center', padding: '6px 10px',
              border: '2px dotted var(--accent)', 'border-radius': '999px',
              background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
              color: 'var(--fg)', 'box-shadow': 'var(--shadow-sm)', cursor: 'pointer',
              'backdrop-filter': 'blur(4px)', overflow: 'hidden',
            }}
          >
            <strong style={{ 'font-size': '11px', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', 'max-width': '100%' }}>{ghost.name}</strong>
            <Show when={ghost.kind}>
              <span style={{ 'font-size': '9px', color: 'var(--fg-muted)', 'text-transform': 'uppercase' }}>{ghost.kind}</span>
            </Show>
          </button>
        )}
      </For>

      <NylonMinimap
        nodes={props.projection.nodes}
        frames={props.projection.contractFrames}
        camera={props.camera}
        viewport={props.viewport}
        selectedId={props.selectedId}
        onNavigate={props.onNavigate}
      />
    </>
  );
}

function NylonMinimap(props: {
  nodes: NylonRenderNode[];
  frames: NylonContractFrame[];
  camera: Transform;
  viewport: ViewportSize;
  selectedId: string | null;
  onNavigate: (x: number, y: number) => void;
}): JSX.Element {
  const [dragging, setDragging] = createSignal(false);
  const bounds = createMemo(() => minimapBounds(props.nodes));
  const scale = createMemo(() => {
    const innerWidth = NYLON_VIEW_POLICY.minimapWidth - NYLON_VIEW_POLICY.minimapPadding * 2;
    const innerHeight = NYLON_VIEW_POLICY.minimapHeight - NYLON_VIEW_POLICY.minimapPadding * 2;
    return Math.min(innerWidth / bounds().w, innerHeight / bounds().h);
  });
  const offset = createMemo(() => ({
    x: (NYLON_VIEW_POLICY.minimapWidth - bounds().w * scale()) / 2 - bounds().x * scale(),
    y: (NYLON_VIEW_POLICY.minimapHeight - bounds().h * scale()) / 2 - bounds().y * scale(),
  }));
  const mapRect = (rect: ViewRect) => ({
    x: rect.x * scale() + offset().x,
    y: rect.y * scale() + offset().y,
    w: rect.w * scale(),
    h: rect.h * scale(),
  });
  const navigate = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = bounds().x + (event.clientX - rect.left - (offset().x + bounds().x * scale())) / scale();
    const y = bounds().y + (event.clientY - rect.top - (offset().y + bounds().y * scale())) / scale();
    props.onNavigate(x, y);
  };

  return (
    <svg
      role="img"
      aria-label="Canvas minimap"
      width={NYLON_VIEW_POLICY.minimapWidth}
      height={NYLON_VIEW_POLICY.minimapHeight}
      viewBox={`0 0 ${NYLON_VIEW_POLICY.minimapWidth} ${NYLON_VIEW_POLICY.minimapHeight}`}
      style={{
        position: 'absolute', right: '12px', bottom: '12px', 'z-index': '34',
        background: 'color-mix(in srgb, var(--surface) 91%, transparent)',
        border: '1px solid var(--border-strong)', 'border-radius': '8px',
        'box-shadow': 'var(--shadow-sm)', cursor: dragging() ? 'grabbing' : 'crosshair',
        'touch-action': 'none',
      }}
      on:pointerdown={(event) => {
        if (event.button !== 0) return;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        navigate(event);
      }}
      on:pointermove={(event) => { if (dragging()) navigate(event); }}
      on:pointerup={(event) => {
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      on:pointercancel={() => setDragging(false)}
    >
      <For each={props.frames}>
        {(frame) => {
          const mapped = () => mapRect(frame);
          return <rect x={mapped().x} y={mapped().y} width={mapped().w} height={mapped().h} rx="3" fill="none" stroke="var(--color-token-moss)" stroke-width="1" />;
        }}
      </For>
      <For each={props.nodes}>
        {(node) => {
          const mapped = () => mapRect(node);
          const selected = () => props.selectedId === node.item.id;
          return <rect
            x={mapped().x} y={mapped().y}
            width={Math.max(1.5, mapped().w)} height={Math.max(1.5, mapped().h)}
            rx={node.kind === 'contract' ? Math.min(6, mapped().h / 2) : 1}
            fill={node.kind === 'container' ? 'color-mix(in srgb, var(--color-token-ochre) 28%, transparent)' : 'var(--surface-alt)'}
            stroke={selected() ? 'var(--accent)' : node.kind === 'container' ? 'var(--color-token-moss)' : 'var(--border-strong)'}
            stroke-width={selected() ? 2 : 0.75}
          />;
        }}
      </For>
      {(() => {
        const mapped = () => mapRect(canvasViewport(props.camera, props.viewport));
        return <rect x={mapped().x} y={mapped().y} width={mapped().w} height={mapped().h} fill="color-mix(in srgb, var(--accent) 9%, transparent)" stroke="var(--accent)" stroke-width="2" />;
      })()}
    </svg>
  );
}

function minimapBounds(nodes: readonly NylonRenderNode[]): ViewRect {
  const rects: ViewRect[] = [...nodes];
  if (rects.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

export function buildGhostNodes(
  doc: NylonDocument,
  projection: NylonProjection,
  selectedId: string | null,
  camera: Transform,
  viewportSize: ViewportSize,
): GhostNode[] {
  if (!selectedId || viewportSize.width <= 0 || viewportSize.height <= 0) return [];
  const transformations = new Map(doc.transformations.map((item) => [item.id, item]));
  const contracts = new Map(doc.contracts.map((item) => [item.id, item]));
  const nodeById = new Map(projection.nodes.map((node) => [node.item.id, node]));
  const selectedNode = nodeById.get(selectedId);
  if (!selectedNode) return [];
  const selectedScope = new Set<string>([selectedId]);
  if (selectedNode.kind === 'container') {
    for (const transformation of doc.transformations) {
      let parent = transformation.parent;
      const seen = new Set<string>();
      while (parent !== undefined && !seen.has(parent)) {
        if (parent === selectedId) {
          selectedScope.add(transformation.id);
          break;
        }
        seen.add(parent);
        parent = transformations.get(parent)?.parent;
      }
    }
  }
  const canvasView = canvasViewport(camera, viewportSize);
  const inset = NYLON_VIEW_POLICY.ghostInset;
  const screenBounds = {
    left: inset,
    top: NYLON_VIEW_POLICY.hudHeight + inset,
    right: viewportSize.width - inset,
    bottom: viewportSize.height - inset,
  };
  const seenContracts = new Set<string>();
  const ghosts: GhostNode[] = [];

  for (const arc of doc.arcs) {
    if (!selectedScope.has(arc.to)) continue;
    const contract = contracts.get(arc.from);
    const contractNode = nodeById.get(arc.from);
    const targetNode = nodeById.get(arc.to) ?? selectedNode;
    if (!contract || !contractNode || seenContracts.has(contract.id) || rectIsFullyVisible(contractNode, canvasView)) continue;
    const targetScreen = canvasToScreen(centerOf(targetNode), camera);
    if (targetScreen.x < 0 || targetScreen.x > viewportSize.width || targetScreen.y < 0 || targetScreen.y > viewportSize.height) continue;
    const contractScreen = canvasToScreen(centerOf(contractNode), camera);
    const crossing = rayToBounds(targetScreen, contractScreen, screenBounds);
    if (!crossing) continue;
    seenContracts.add(contract.id);
    ghosts.push({
      id: contract.id,
      name: contract.name,
      kind: contract.kind,
      x: Math.min(viewportSize.width - NYLON_VIEW_POLICY.ghostWidth - inset, Math.max(inset, crossing.x - NYLON_VIEW_POLICY.ghostWidth / 2)),
      y: Math.min(viewportSize.height - NYLON_VIEW_POLICY.ghostHeight - inset, Math.max(NYLON_VIEW_POLICY.hudHeight + inset, crossing.y - NYLON_VIEW_POLICY.ghostHeight / 2)),
      target: contractNode,
    });
  }
  return ghosts;
}

function centerOf(rect: ViewRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function canvasToScreen(point: { x: number; y: number }, camera: Transform): { x: number; y: number } {
  return { x: point.x * camera.k + camera.x, y: point.y * camera.k + camera.y };
}

function rayToBounds(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bounds: { left: number; top: number; right: number; bottom: number },
): { x: number; y: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const candidates: number[] = [];
  if (dx < 0) candidates.push((bounds.left - from.x) / dx);
  if (dx > 0) candidates.push((bounds.right - from.x) / dx);
  if (dy < 0) candidates.push((bounds.top - from.y) / dy);
  if (dy > 0) candidates.push((bounds.bottom - from.y) / dy);
  return candidates
    .filter((value) => value >= 0 && value <= 1)
    .map((value) => ({ x: from.x + dx * value, y: from.y + dy * value }))
    .find((point) => point.x >= bounds.left - 0.5 && point.x <= bounds.right + 0.5
      && point.y >= bounds.top - 0.5 && point.y <= bounds.bottom + 0.5) ?? null;
}
