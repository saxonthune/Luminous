import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import type { EdgeDeclaration } from './types.js';
import { EdgeLabel } from './EdgeLabel.js';
import type { EdgeGeometry, NodeRect } from './edgeRouting.js';

export type EdgeEmphasis = 'neutral' | 'incident' | 'dimmed';

export interface EdgeLodState {
  zoom: number;
  emphasis: EdgeEmphasis;
}

export interface EdgeLodStyle {
  /** Multiplied with selection emphasis opacity. */
  opacity?: number;
  /** False withdraws the label while retaining the Edge line and hit target. */
  labelVisible?: boolean;
}

/** Host-owned semantic policy; cactus owns applying its visual result. */
export type EdgeLodPolicy = (edge: EdgeDeclaration, state: EdgeLodState) => EdgeLodStyle;

export function edgeEmphasis(
  edge: { sourceId: string; targetId: string },
  selectedIds: ReadonlyArray<string>,
): EdgeEmphasis {
  if (selectedIds.length === 0) return 'neutral';
  return selectedIds.includes(edge.sourceId) || selectedIds.includes(edge.targetId)
    ? 'incident'
    : 'dimmed';
}

const DIMMED_OPACITY = 0.15;
const MIN_EDGE_SCREEN_WIDTH = 0.85;
const MIN_ARROW_SCREEN_SIZE = 5;
const MIN_HIT_SCREEN_WIDTH = 12;

/** Keep a canvas-space metric at least this large after the camera transform.
 * The metric still grows naturally when zooming in; only zoom-out shrinkage is
 * resisted. */
export function counterScaledEdgeMetric(
  canvasValue: number,
  zoom: number,
  minScreenValue: number,
): number {
  return Math.max(canvasValue, minScreenValue / Math.max(zoom, 0.001));
}

interface EdgeLayerProps {
  edges: EdgeDeclaration[];
  routes: () => ReadonlyMap<string, EdgeGeometry>;
  emphasisNodeIds: () => ReadonlyArray<string>;
  emphasisStyle: {
    dimUnselected: boolean;
    selectedWidthMultiplier: number;
  };
  lod?: EdgeLodPolicy;
  /** Required only by the label layer for label/node collision checks. */
  getNodeRects?: () => ReadonlyMap<string, NodeRect>;
  layer: 'lines' | 'labels';
  /** Draw only segments assigned to this visual band. Labels span the whole route. */
  routeBand?: number;
  zoom: () => number;
  viewport?: () => { x: number; y: number; w: number; h: number } | null;
}

const LABEL_CAP = 28;

// Reference font size for label-overlap box estimation. Fixed so anchor
// placement does not recompute on every zoom tick (positions are zoom-stable;
// only the rendered label box scales with zoom, handled separately below).
const LABEL_ANCHOR_REF_FS = 13;

// Above this node count, skip node-vs-label overlap testing — the per-edge
// O(nodes) scan dominates on large graphs. Label-vs-label dodging still runs.
const NODE_DODGE_MAX_NODES = 400;

function truncate(s: string): string {
  return s.length > LABEL_CAP ? s.slice(0, LABEL_CAP) + '…' : s;
}

function arrowHeadPath(x1: number, y1: number, x2: number, y2: number, size = 8, curved = false): string {
  // Match the final tangent of bezierSegmentPath, not the diagonal endpoint chord.
  const angle = curved ? (x2 >= x1 ? 0 : Math.PI) : Math.atan2(y2 - y1, x2 - x1);
  const baseX1 = x2 - size * Math.cos(angle - Math.PI / 6);
  const baseY1 = y2 - size * Math.sin(angle - Math.PI / 6);
  const baseX2 = x2 - size * Math.cos(angle + Math.PI / 6);
  const baseY2 = y2 - size * Math.sin(angle + Math.PI / 6);
  return `M ${x2} ${y2} L ${baseX1} ${baseY1} L ${baseX2} ${baseY2} Z`;
}

/** Horizontal-tangent cubic used for freeform relationship cards. The handle
 * direction follows the segment when a target moves past its source. */
export function bezierSegmentPath(x1: number, y1: number, x2: number, y2: number): string {
  const direction = x2 >= x1 ? 1 : -1;
  const handle = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + direction * handle} ${y1}, ${x2 - direction * handle} ${y2}, ${x2} ${y2}`;
}

// Slide label along its edge to dodge unrelated nodes. Candidates are offsets
// from the route-chosen anchor (which already accounts for bundle stagger),
// measured as a fraction of the line length. First overlap-free candidate
// wins; otherwise the candidate with the fewest overlaps. Endpoints are
// excluded from the overlap test — the label is supposed to sit near them.
interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function chooseLabelAnchor(
  pts: EdgeGeometry,
  box: { w: number; h: number },
  sourceId: string,
  targetId: string,
  rects: ReadonlyMap<string, NodeRect>,
  placedLabels: readonly LabelRect[],
): { x: number; y: number } {
  const tail = pts.points.at(-1) ?? { x: pts.x2, y: pts.y2 };
  const beforeTail = pts.points.at(-2) ?? { x: pts.x1, y: pts.y1 };
  const len = Math.hypot(tail.x - beforeTail.x, tail.y - beforeTail.y);
  if (len === 0) return { x: pts.labelX, y: pts.labelY };
  const ux = (tail.x - beforeTail.x) / len;
  const uy = (tail.y - beforeTail.y) / len;
  const offsets = [0, -0.15, 0.15, -0.3, 0.3, -0.4, 0.4];

  let bestOverlap = Infinity;
  let best = { x: pts.labelX, y: pts.labelY };
  for (const t of offsets) {
    const cx = pts.labelX + ux * len * t;
    const cy = pts.labelY + uy * len * t;
    const lx = cx - box.w / 2;
    const ly = cy - box.h / 2;
    let n = 0;
    if (rects.size <= NODE_DODGE_MAX_NODES) {
      for (const [id, r] of rects) {
        if (id === sourceId || id === targetId) continue;
        if (lx < r.x + r.w && lx + box.w > r.x && ly < r.y + r.h && ly + box.h > r.y) n++;
      }
    }
    for (const p of placedLabels) {
      if (lx < p.x + p.w && lx + box.w > p.x && ly < p.y + p.h && ly + box.h > p.y) n++;
    }
    if (n === 0) return { x: cx, y: cy };
    if (n < bestOverlap) {
      bestOverlap = n;
      best = { x: cx, y: cy };
    }
  }
  return best;
}

export function EdgeLayer(props: EdgeLayerProps): JSX.Element {
  const [revealedId, setRevealedId] = createSignal<string | null>(null);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editingText, setEditingText] = createSignal('');
  let editingInput: HTMLInputElement | undefined;

  // Counter-scale label text so on-screen size stays readable across zoom levels.
  const labelFontSize = createMemo(() => {
    const k = props.zoom();
    const effective = Math.min(20, Math.max(11, 10 * k));
    return effective / k;
  });
  const labelHaloWidth = createMemo(() => labelFontSize() * 0.35);

  const routed = () => props.routes();

  const visibleEdges = createMemo(() => {
    const vp = props.viewport?.();
    if (!vp) return props.edges;
    const r = routed();
    const padX = vp.w, padY = vp.h;
    const minX = vp.x - padX, maxX = vp.x + vp.w + padX;
    const minY = vp.y - padY, maxY = vp.y + vp.h + padY;
    return props.edges.filter((edge) => {
      const pts = r.get(edge.id);
      if (!pts) return false;
      const eMinX = Math.min(pts.x1, pts.x2), eMaxX = Math.max(pts.x1, pts.x2);
      const eMinY = Math.min(pts.y1, pts.y2), eMaxY = Math.max(pts.y1, pts.y2);
      return eMaxX >= minX && eMinX <= maxX && eMaxY >= minY && eMinY <= maxY;
    });
  });

  // Label anchors: for edges with text, slide along the line to dodge unrelated
  // nodes. Outer memo so per-edge rendering and the revealed-popover see the
  // same chosen position.
  const labelAnchors = createMemo(() => {
    const rects = props.getNodeRects?.() ?? new Map<string, NodeRect>();
    const r = routed();
    const map = new Map<string, { x: number; y: number }>();
    const placed: LabelRect[] = [];
    for (const edge of props.edges) {
      const pts = r.get(edge.id);
      if (!pts) continue;
      if (!edge.labelText) {
        map.set(edge.id, { x: pts.labelX, y: pts.labelY });
        continue;
      }
      const fs = LABEL_ANCHOR_REF_FS * (edge.labelFontScale ?? 1);
      const text = truncate(edge.labelText);
      const textWidth = text.length * fs * 0.56 + 10;
      const textHeight = fs * 1.4;
      const box = edge.labelBackgroundShape === 'circle'
        ? { w: Math.max(textWidth, textHeight), h: Math.max(textWidth, textHeight) }
        : { w: textWidth, h: textHeight };
      const anchor = chooseLabelAnchor(pts, box, edge.sourceId, edge.targetId, rects, placed);
      map.set(edge.id, anchor);
      placed.push({ x: anchor.x - box.w / 2, y: anchor.y - box.h / 2, w: box.w, h: box.h });
    }
    return map;
  });

  const revealedPopover = createMemo(() => {
    const id = revealedId();
    if (!id) return null;
    const edge = props.edges.find((e) => e.id === id);
    if (!edge?.labelText) return null;
    const anchor = labelAnchors().get(edge.id);
    if (!anchor) return null;
    return { x: anchor.x, y: anchor.y, text: edge.labelText };
  });

  return (
    <>
      <For each={visibleEdges()}>
        {(edge) => {
          const endpoints = createMemo(() => routed().get(edge.id) ?? null);

          // Estimated label box (text width + padding). Matches the ~5.6px per
          // glyph used by estimateEdgeLabelSize in PgCanvasView so the rendered
          // background stays in sync with the layout's reserved space.
          const labelBox = createMemo(() => {
            if (!edge.labelText) return null;
            const text = truncate(edge.labelText);
            const fs = labelFontSize() * (edge.labelFontScale ?? 1);
            const textWidth = text.length * fs * 0.56 + 10;
            const textHeight = fs * 1.4;
            return edge.labelBackgroundShape === 'circle'
              ? { w: Math.max(textWidth, textHeight), h: Math.max(textWidth, textHeight) }
              : { w: textWidth, h: textHeight };
          });

          const emphasis = createMemo(() => edgeEmphasis(edge, props.emphasisNodeIds()));
          const lodStyle = createMemo(() => props.lod?.(edge, {
            zoom: props.zoom(),
            emphasis: emphasis(),
          }) ?? {});
          const opacity = createMemo(() => {
            const selectionOpacity = props.emphasisStyle.dimUnselected && emphasis() === 'dimmed'
              ? DIMMED_OPACITY
              : 1;
            return selectionOpacity * Math.min(1, Math.max(0, lodStyle().opacity ?? 1));
          });

          const dash = edge.styling?.dash;
          const color = edge.styling?.colorToken
            ? `var(--${edge.styling.colorToken})`
            : 'var(--cactus-fg-muted, #6b7280)';
          const baseWidth = createMemo(() =>
            (edge.styling?.width ?? 1.5) *
            (emphasis() === 'incident' ? props.emphasisStyle.selectedWidthMultiplier : 1),
          );
          const width = createMemo(() => counterScaledEdgeMetric(
            baseWidth(),
            props.zoom(),
            MIN_EDGE_SCREEN_WIDTH,
          ));
          const metricScale = createMemo(() => width() / baseWidth());
          const strokeDasharray = createMemo(() => {
            const scale = metricScale();
            return dash === 'dashed' ? `${6 * scale} ${(edge.styling?.dashGap ?? 3) * scale}`
              : dash === 'dotted' ? `0 ${3 * width()}`
              : undefined;
          });
          const arrowSize = createMemo(() => counterScaledEdgeMetric(
            8,
            props.zoom(),
            MIN_ARROW_SCREEN_SIZE,
          ));
          const hitWidth = createMemo(() => counterScaledEdgeMetric(
            Math.max(12, width()),
            props.zoom(),
            MIN_HIT_SCREEN_WIDTH,
          ));
          const arrowHead = edge.styling?.arrowHead ?? false;

          // TODO(routing): straight-line routing only. Curve/avoid-containers routing is a follow-up.
          return (
            <Show when={endpoints()}>
              {(pts) => (
                <>
                  <Show when={props.layer === 'lines'}>
                    <For each={pts().points.slice(1)}>
                      {(end, index) => {
                        const start = () => pts().points[index()];
                        const curved = () => edge.styling?.curve === 'bezier';
                        const segmentBand = () => pts().segmentLayers[index()] ?? 0;
                        const isFinal = () => index() === pts().points.length - 2;
                        return (
                          <Show when={props.routeBand === undefined || segmentBand() === props.routeBand}>
                            <Show when={curved()} fallback={(
                              <polyline
                                points={`${start().x},${start().y} ${end.x},${end.y}`}
                                stroke={color}
                                stroke-width={width()}
                                stroke-dasharray={strokeDasharray()}
                                stroke-linecap="round"
                                fill="none"
                                opacity={opacity()}
                              />
                            )}>
                              <path
                                d={bezierSegmentPath(start().x, start().y, end.x, end.y)}
                                stroke={color}
                                stroke-width={width()}
                                stroke-dasharray={strokeDasharray()}
                                stroke-linecap="round"
                                fill="none"
                                opacity={opacity()}
                              />
                            </Show>
                            <Show when={arrowHead && isFinal()}>
                              <path d={arrowHeadPath(start().x, start().y, end.x, end.y, arrowSize(), curved())} fill={color} opacity={opacity()} />
                            </Show>
                            <Show when={curved()} fallback={(
                              <line
                                x1={start().x}
                                y1={start().y}
                                x2={end.x}
                                y2={end.y}
                                stroke="transparent"
                                stroke-width={hitWidth()}
                                data-edge-id={edge.id}
                                data-route-segment={index()}
                                style={{ 'pointer-events': 'stroke' }}
                              />
                            )}>
                              <path
                                d={bezierSegmentPath(start().x, start().y, end.x, end.y)}
                                stroke="transparent"
                                stroke-width={hitWidth()}
                                fill="none"
                                data-edge-id={edge.id}
                                data-route-segment={index()}
                                style={{ 'pointer-events': 'stroke' }}
                              />
                            </Show>
                          </Show>
                        );
                      }}
                    </For>
                  </Show>
                  <Show when={props.layer === 'labels' && lodStyle().labelVisible !== false && !!(edge.labelText || edge.label)}>
                    <Show when={edge.labelBackground !== false}>
                      <Show when={labelBox()}>
                        {(box) => (
                          <rect
                            x={(labelAnchors().get(edge.id)?.x ?? pts().labelX) - box().w / 2}
                            y={(labelAnchors().get(edge.id)?.y ?? pts().labelY) - box().h / 2}
                            width={box().w}
                            height={box().h}
                            rx={edge.labelBackgroundShape === 'circle' ? Math.max(box().w, box().h) / 2 : 3}
                            fill={edge.labelBackgroundColor ?? 'var(--cactus-canvas-bg, #ffffff)'}
                            opacity={opacity()}
                            style={{ 'pointer-events': 'none' }}
                          />
                        )}
                      </Show>
                    </Show>
                    <Show when={editingId() === edge.id && edge.onLabelEdit} fallback={
                      <text
                        x={labelAnchors().get(edge.id)?.x ?? pts().labelX}
                        y={labelAnchors().get(edge.id)?.y ?? pts().labelY}
                        text-anchor="middle"
                        dominant-baseline="middle"
                        font-size={`${labelFontSize() * (edge.labelFontScale ?? 1)}`}
                        font-weight={edge.labelFontWeight ?? 'normal'}
                        fill={color}
                        stroke={edge.labelBackgroundColor ?? 'var(--cactus-canvas-bg, #ffffff)'}
                        stroke-width={edge.labelBackground === false ? 0 : labelHaloWidth()}
                        stroke-linejoin="round"
                        paint-order="stroke fill"
                        opacity={opacity()}
                        style={{
                          'pointer-events': edge.labelText ? 'auto' : 'none',
                          cursor: edge.labelText ? 'pointer' : undefined,
                        }}
                        onClick={(event) => {
                          if (!edge.labelText) return;
                          event.stopPropagation();
                          if (edge.onLabelEdit) {
                            setRevealedId(null);
                            setEditingText(edge.labelEditValue ?? edge.labelText);
                            setEditingId(edge.id);
                            requestAnimationFrame(() => { editingInput?.focus(); editingInput?.select(); });
                          } else {
                            setRevealedId((id) => (id === edge.id ? null : edge.id));
                          }
                        }}
                      >
                        {edge.labelText ? truncate(edge.labelText) : edge.label?.()}
                      </text>
                    }>
                      <Show when={labelBox()}>{(box) => {
                        const anchor = () => labelAnchors().get(edge.id) ?? { x: pts().labelX, y: pts().labelY };
                        const width = () => Math.max(box().w, 52 / props.zoom());
                        const height = () => Math.max(box().h, 30 / props.zoom());
                        function finishEdit(cancel: boolean) {
                          if (!cancel) {
                            const text = editingText().trim();
                            const value = Number(text);
                            if (text !== '' && Number.isFinite(value) && String(value) !== (edge.labelEditValue ?? edge.labelText)) {
                              edge.onLabelEdit?.(String(value));
                            }
                          }
                          edge.onLabelEditBlur?.();
                          setEditingId(null);
                        }
                        return <foreignObject
                          x={anchor().x - width() / 2}
                          y={anchor().y - height() / 2}
                          width={width()}
                          height={height()}
                          style={{ overflow: 'visible' }}>
                          <input ref={(element) => { editingInput = element; }} type="text" inputmode="decimal" value={editingText()}
                            aria-label="Edit sequence priority"
                            onInput={(event) => setEditingText(event.currentTarget.value)}
                            onFocus={() => edge.onLabelEditFocus?.()}
                            onBlur={() => finishEdit(false)}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === 'Enter') event.currentTarget.blur();
                              if (event.key === 'Escape') {
                                setEditingText(edge.labelText ?? '');
                                finishEdit(true);
                              }
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                            style={{
                              width: '100%', height: '100%', 'box-sizing': 'border-box', padding: '0',
                              'border-radius': '8px', border: '1px solid var(--cactus-accent, #8b6f47)',
                              outline: 'none', background: '#fff', color,
                              'text-align': 'center', 'font-size': `${labelFontSize() * (edge.labelFontScale ?? 1)}px`,
                              'font-weight': String(edge.labelFontWeight ?? 600),
                              'box-shadow': '0 2px 8px rgb(0 0 0 / 18%)',
                            }} class="selection:bg-accent/30 selection:text-fg" />
                        </foreignObject>;
                      }}</Show>
                    </Show>
                  </Show>
                </>
              )}
            </Show>
          );
        }}
      </For>
      <Show when={props.layer === 'labels'}>
        <Show when={revealedPopover()}>
          {(mp) => (
            <EdgeLabel x={mp().x} y={mp().y} onClick={() => setRevealedId(null)}>
              <span style={{ 'font-size': '10px', color: 'var(--cactus-fg, #111827)' }}>{mp().text}</span>
            </EdgeLabel>
          )}
        </Show>
      </Show>
    </>
  );
}
