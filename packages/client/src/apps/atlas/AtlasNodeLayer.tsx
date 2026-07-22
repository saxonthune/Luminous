import { For, createMemo, createEffect, createSignal, type JSX } from 'solid-js';
import type { AtlasColorToken, AtlasContentMode, AtlasData } from '@luminous/core/atlas';
import { NodeContainer, useCanvasContext, useGesture, findContainerAt, isOverContainerInterior } from '@luminous/cactus';
import { containerHeaderHeight, CONTAINER_BEZEL, type AtlasRenderNode } from './projection.ts';
import { addDelta, growAncestors, shiftSubtree, type LayoutDelta } from './layoutOverride.ts';
import type { NodeEditForm } from './mutations.ts';
import { describeChord } from './inputBindings.ts';
import { AtlasNodeContent } from './AtlasNodeContent.tsx';

// Fixed edit-mode height for a Node being edited — mirrors DataflowCanvas's
// EDIT_HEIGHT (v1, no content-driven auto-grow).
const EDIT_HEIGHT = 220;

// Edge Tab geometry (R44): a small circular badge protruding from the top of
// a Node's right side. The overlap pulls it a couple px onto the Node so it
// reads as attached rather than floating.
const EDGE_TAB_SIZE = 22;
const EDGE_TAB_OVERLAP = 6;
const EDGE_TAB_TOP_OFFSET = 8;

export interface AtlasNodeLayerProps {
  nodes: () => AtlasRenderNode[];
  /** The Atlas Data File resolved for the open Document, if one exists. */
  data: () => AtlasData | undefined;
  editingId: () => string | null;
  onEnterEdit: (id: string) => void;
  onCommit: (id: string, form: NodeEditForm) => void;
  onCancel: () => void;
  onModeChange: (id: string, mode: AtlasContentMode) => void;
  onDragStart: (nodeId: string) => void;
  onDragEnd: (nodeId: string, dx: number, dy: number) => void;
  /** The Nodes moving together in the current drag (doc01.07.04 R69) — the
   * pressed Node plus, when the selection shares one Parent, the rest of
   * the selection. Empty outside a drag. */
  dragGroup: () => string[];
  /** Whether Ctrl/Meta is currently held during an active drag — see
   * `beginCtrlTracking` on AtlasCanvas. */
  ctrlHeld: () => boolean;
  /** Fired synchronously on a node's pointerdown, before `useGesture` gets it
   * — seeds ctrlHeld tracking from the initiating event. */
  onPressStart: (e: PointerEvent) => void;
  /** The Color to draw a Node in — the preview override when this node is
   * being previewed, else its own `node.color`. Never written to the Document. */
  effectiveColor: (nodeId: string) => AtlasColorToken | undefined;
  /** The live content-size drag preview — `undefined` outside of a drag,
   * same pattern as color preview. Either dimension may be absent: an edge
   * grip drags one, a corner grip drags both. */
  previewContentSize: () => { nodeId: string; width?: number; height?: number } | undefined;
  onResizePreview: (nodeId: string, size: { width?: number; height?: number } | undefined) => void;
  onResizeCommit: (nodeId: string, size: { width?: number; height?: number }) => void;
  /** A resize grip's double click (R72/R73) — fit the Node to its Content on
   * the grip's axes. */
  onFitContent: (nodeId: string, dir: { horizontal: boolean; vertical: boolean }) => void;
  onEdgePreviewChange?: (message: string | null) => void;
  /** Whether completing the in-progress Edge into `target` would create it —
   * `canConnect` against the live Document, which this layer doesn't hold. */
  connectValid: (source: string, target: string) => boolean;
  /** Whether a Ctrl-drop into `parentId` completes the Edge into the new
   * Node — `connectDropAddsEdge` against the live Document (R55). */
  dropAddsEdge: (source: string, parentId: string | null) => boolean;
}

/**
 * Renders the node layer inside <Canvas>'s provider — registerNodeRect and
 * hit-testing need useCanvasContext, which only resolves inside Canvas's
 * children (see the same constraint noted at DataflowCanvas.tsx:57-61).
 */
export function AtlasNodeLayer(props: AtlasNodeLayerProps): JSX.Element {
  const ctx = useCanvasContext();

  const gesture = useGesture({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragStart: (nodeId) => props.onDragStart(nodeId),
      onDragEnd: (nodeId, dx, dy) => props.onDragEnd(nodeId, dx, dy),
    },
  });

  // R51: a toast that says what completing the gesture right now would do —
  // recomputed as the pointer moves (drag state carries the screen position)
  // and as Ctrl toggles. It states the pending outcome, never instructions;
  // the one allowed extra is the Ctrl hint parenthetical, gone while held.
  createEffect(() => {
    const drag = ctx.connectionDrag();
    if (!drag) {
      props.onEdgePreviewChange?.(null);
      return;
    }
    const nameOf = (id: string) => props.nodes().find((rn) => rn.node.id === id)?.node.name ?? id;
    const source = nameOf(drag.sourceNodeId);
    if (ctx.ctrlHeld()) {
      // Mirrors onConnectDrop: the new Node's parent is the container under
      // the pointer, top-level when there is none. A drop inside the source's
      // own subtree adds no edge (R55) — the message drops the edge clause.
      const parentId = findContainerAt(drag.currentScreenX, drag.currentScreenY);
      const inClause = parentId ? `Creating new node in "${nameOf(parentId)}"` : 'Creating new node';
      props.onEdgePreviewChange?.(
        props.dropAddsEdge(drag.sourceNodeId, parentId) ? `${inClause} with edge from "${source}"` : inClause,
      );
      return;
    }
    // Mirrors the gesture's completion hit-test (useGesture.ts): the Node
    // under the pointer, counted only when the Edge would actually be created.
    const targetId =
      document
        .elementsFromPoint(drag.currentScreenX, drag.currentScreenY)
        .find((el) => el.hasAttribute('data-connection-target'))
        ?.getAttribute('data-node-id') ?? null;
    const base =
      targetId !== null && props.connectValid(drag.sourceNodeId, targetId)
        ? `Creating new edge from "${source}" to "${nameOf(targetId)}"`
        : `Creating new edge from "${source}"`;
    props.onEdgePreviewChange?.(`${base} (hint: hold ${describeChord('edge.connectToNewNode')} to add a new node)`);
  });

  const parentOf = createMemo(() => {
    const m = new Map<string, string>();
    for (const rn of props.nodes()) if (rn.node.parent) m.set(rn.node.id, rn.node.parent);
    return m;
  });
  const childrenOf = createMemo(() => {
    const m = new Map<string, string[]>();
    for (const rn of props.nodes()) {
      if (rn.node.parent === undefined) continue;
      const list = m.get(rn.node.parent) ?? [];
      list.push(rn.node.id);
      m.set(rn.node.parent, list);
    }
    return m;
  });

  // The one live-override map every row reads uniformly (see layoutOverride.ts):
  // built from whichever gesture is active, so a released gesture leaves the
  // map empty and rows fall back to their committed geometry — snap-back is
  // just the absence of an override, no revert code needed.
  const layoutDeltas = createMemo(() => {
    const map = new Map<string, LayoutDelta>();

    // Move (R-drag): each dragged Node and its whole subtree translate live —
    // the selection's Roots when the pressed Node belongs to the selection
    // (it may be a descendant of a Root rather than in the group itself),
    // else the pressed Node alone (R69).
    const g = gesture.gesture();
    if (g.kind === 'draggingNode') {
      const { dx, dy } = gesture.dragDelta();
      const group = props.dragGroup().length > 0 ? props.dragGroup() : [g.nodeId];
      for (const id of group) shiftSubtree(map, id, childrenOf(), dx, dy, { includeRoot: true });
      // Ctrl-expand (R5): each ancestor on the dragged Node's path also grows
      // live to contain its dragged position — composes with the shift above.
      if (props.ctrlHeld()) {
        growAncestors(map, g.nodeId, parentOf(), props.nodes(), { dx, dy });
      }
    }

    // Content-resize: the resized Node's own box grows by the width/height
    // delta, for both a leaf and a container — a container's frame grip
    // sizes the container box (the shrink-wrap floor, projection.ts), so it
    // never shifts children; it only adds empty room past their extent.
    // Ancestors grow once, from both deltas together, to contain the resized
    // Node — matching the committed re-projection of the same
    // contentWidth/contentHeight (see projection.ts's shrinkWrapSize).
    const preview = props.previewContentSize();
    if (preview) {
      const rn = props.nodes().find((n) => n.node.id === preview.nodeId);
      if (rn) {
        const ownDelta: Partial<{ dw: number; dh: number }> = {};
        if (preview.width !== undefined) {
          const dw = preview.width - rn.w;
          addDelta(map, preview.nodeId, { dw });
          ownDelta.dw = dw;
        }
        if (preview.height !== undefined) {
          const dh = preview.height - rn.h;
          addDelta(map, preview.nodeId, { dh });
          ownDelta.dh = dh;
        }
        growAncestors(map, preview.nodeId, parentOf(), props.nodes(), ownDelta);
      }
    }

    return map;
  });
  const ZERO_DELTA: LayoutDelta = { dx: 0, dy: 0, dw: 0, dh: 0 };

  return (
    <For each={props.nodes()}>
      {(rn) => {
        const editing = () => props.editingId() === rn.node.id;
        const color = () => props.effectiveColor(rn.node.id);
        // R45: the tab shows on hover — enter/leave on the row wrapper use
        // subtree semantics, so hover holds while the pointer moves from the
        // Node onto the tab (a sibling inside the same wrapper).
        const [hovered, setHovered] = createSignal(false);
        const isEdgeSource = () => ctx.connectionDrag()?.sourceNodeId === rn.node.id;
        const tabVisible = () => hovered() || isEdgeSource();
        // The container box is color-neutral: a node's color identifies the
        // node itself (its header/leaf fill), never the region its children
        // sit in. So the soft-container tint is a fixed grey regardless of
        // this node's color, and the border is the theme's plain border for a
        // legible boundary. These CSS custom properties inherit down to the
        // soft-container div NodeContainer renders (see NodeContainer.tsx:73).
        const wrapperStyle = (): JSX.CSSProperties => ({
          '--cactus-node-bezel': 'var(--surface)',
          '--cactus-node-border': 'var(--border)',
          '--cactus-node-radius': '8px',
          '--cactus-container-tint': 'var(--atlas-container-fill)',
          '--cactus-container-border': 'var(--border)',
        });
        // The row applies the composed override uniformly — nodes() stays
        // reference-stable during a gesture, so <For> never disposes/rebuilds
        // this row (see 1b in the task spec).
        const delta = () => layoutDeltas().get(rn.node.id) ?? ZERO_DELTA;
        // Passed to AtlasNodeContent for its own edit-mode UI — geometry
        // (the box growing/shifting) is handled by `delta` above instead.
        const resizePreview = () => {
          const p = props.previewContentSize();
          return p && p.nodeId === rn.node.id ? { width: p.width, height: p.height } : undefined;
        };
        return (
          <div style={wrapperStyle()} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
            <NodeContainer
              nodeId={rn.node.id}
              x={() => rn.x + delta().dx}
              y={() => rn.y + delta().dy}
              w={() => rn.w + delta().dw}
              h={() => (editing() ? EDIT_HEIGHT : rn.h + delta().dh)}
              softContainer={() => rn.hasChildren}
              containerInset={() => ({
                top: containerHeaderHeight(rn.node),
                left: CONTAINER_BEZEL,
                right: CONTAINER_BEZEL,
                bottom: CONTAINER_BEZEL,
              })}
              onPointerDown={(e) => {
                // R36: a container Node moves only from its header/frame — a
                // press on its soft-container interior falls through
                // untouched (no beginPress, no stopPropagation) so the
                // canvas-level marquee listener (useGesture's boxSelect,
                // relaxed for `[data-soft-container]` in useGesture.ts) sees
                // it instead. A leaf has no interior, so it always moves.
                if (rn.hasChildren && isOverContainerInterior(e.currentTarget as Element, e.clientX, e.clientY)) {
                  return;
                }
                props.onPressStart(e);
                ctx.onNodePointerDown(rn.node.id, e);
                gesture.beginPress(rn.node.id, e);
              }}
            >
              <AtlasNodeContent
                node={() => rn.node}
                data={props.data}
                hasChildren={() => rn.hasChildren}
                color={color}
                selected={() => ctx.isSelected(rn.node.id)}
                editing={editing}
                onEnterEdit={() => props.onEnterEdit(rn.node.id)}
                onCommit={(form) => props.onCommit(rn.node.id, form)}
                onCancel={props.onCancel}
                onModeChange={(mode) => props.onModeChange(rn.node.id, mode)}
                previewSize={resizePreview}
                frameSize={() => ({ width: rn.w, height: rn.h })}
                zoomScale={() => ctx.transform().k}
                onResizePreview={(size) => props.onResizePreview(rn.node.id, size)}
                onResizeCommit={(size) => props.onResizeCommit(rn.node.id, size)}
                onFitContent={(dir) => props.onFitContent(rn.node.id, dir)}
              />
            </NodeContainer>
            {/* Edge Tab (R44): a sibling of NodeContainer, not a child — the
                container's root div clips overflow, which would hide a tab
                protruding past its right edge. */}
            <div
              data-testid={`edge-tab-${rn.node.id}`}
              data-no-pan="true"
              style={{
                position: 'absolute',
                left: `${rn.x + delta().dx + rn.w + delta().dw - EDGE_TAB_OVERLAP}px`,
                top: `${rn.y + delta().dy + EDGE_TAB_TOP_OFFSET}px`,
                width: `${EDGE_TAB_SIZE}px`,
                height: `${EDGE_TAB_SIZE}px`,
                'z-index': '5',
                opacity: tabVisible() ? '1' : '0',
                transition: 'opacity 150ms ease',
                'pointer-events': tabVisible() ? 'auto' : 'none',
                cursor: 'pointer',
              }}
              on:pointerdown={(e: PointerEvent) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                ctx.startConnection(rn.node.id, null, e.clientX, e.clientY);
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  'border-radius': '9999px',
                  background: 'var(--atlas-edge-tab-fill)',
                  color: 'var(--atlas-edge-tab-glyph)',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'font-size': '15px',
                  'line-height': '1',
                  'font-weight': '600',
                  'box-shadow': isEdgeSource()
                    ? '0 0 0 3px var(--atlas-edge-tab-fill)'
                    : 'var(--cactus-shadow-sm, none)',
                  transform: isEdgeSource() ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                }}
              >
                +
              </div>
            </div>
          </div>
        );
      }}
    </For>
  );
}
