import { For, createMemo, createEffect, createSignal, on, type JSX } from 'solid-js';
import type { AtlasColorToken, AtlasContentMode, AtlasDocument } from '@luminous/core/atlas';
import { addNode, setNode } from '@luminous/core/atlas';
import { Canvas, NodeContainer, useCanvasContext, useNodeDrag, findContainerAt } from '@luminous/cactus';
import type { CanvasRef, ChromeSchema, MenuSchema, MenuItem } from '@luminous/cactus';
import { toEdgeDeclarations, projectAtlasNodes, type AtlasRenderNode } from './projection.ts';
import {
  buildContentEditPatch,
  buildModePatch,
  buildColorPatch,
  uniqueId,
  duplicateNode,
  selfAndDescendantIds,
  resolveDrop,
  describePendingDrop,
  type NodeEditForm,
} from './mutations.ts';
import { AtlasNodeContent } from './AtlasNodeContent.tsx';
import { ColorSwatchGrid } from './ColorSwatchGrid.tsx';

// Scoped styling for the rendered markdown Content — mirrors dataflow's
// BoxContent MD_STYLES but scoped under its own class.
const ATLAS_NODE_MD_STYLES = `
.atlas-node-md p { margin: 0 0 .35rem; }
.atlas-node-md ul { margin: 0 0 .35rem; padding-left: 1rem; list-style: disc; }
.atlas-node-md li { margin: .1rem 0; }
.atlas-node-md code { font-family: ui-monospace, monospace; background: var(--cactus-surface-alt, #f3f4f6); padding: .05rem .25rem; border-radius: 3px; font-size: .9em; }
.atlas-node-md strong { font-weight: 600; }
.atlas-node-md > :last-child { margin-bottom: 0; }
`;

// Fixed edit-mode height for a Node being edited — mirrors DataflowCanvas's
// EDIT_HEIGHT (v1, no content-driven auto-grow).
const EDIT_HEIGHT = 220;

export interface AtlasCanvasProps {
  doc: AtlasDocument;
  dispatchDoc: (next: AtlasDocument) => void;
  /** R6: fires with a preview message while a drag is about to change Container
   * membership, and with `null` once it isn't (including at drag end). */
  onPendingMembershipChange?: (message: string | null) => void;
  onDropRefused?: (message: string) => void;
}

/**
 * Renders the node layer inside <Canvas>'s provider — registerNodeRect and
 * hit-testing need useCanvasContext, which only resolves inside Canvas's
 * children (see the same constraint noted at DataflowCanvas.tsx:57-61).
 */
function AtlasNodeLayer(props: {
  nodes: () => AtlasRenderNode[];
  editingId: () => string | null;
  onEnterEdit: (id: string) => void;
  onCommit: (id: string, form: NodeEditForm) => void;
  onCancel: () => void;
  onModeChange: (id: string, mode: AtlasContentMode) => void;
  onDragStart: (nodeId: string) => void;
  onDrag: (nodeId: string, dx: number, dy: number) => void;
  onDragEnd: (nodeId: string) => void;
  /** The Color to draw a Node in — the preview override when this node is
   * being previewed, else its own `node.color`. Never written to the Document. */
  effectiveColor: (nodeId: string) => AtlasColorToken | undefined;
}): JSX.Element {
  const ctx = useCanvasContext();

  const { onPointerDown: dragPointerDown } = useNodeDrag({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragStart: (nodeId) => props.onDragStart(nodeId),
      onDrag: (nodeId, dx, dy) => props.onDrag(nodeId, dx, dy),
      onDragEnd: (nodeId) => props.onDragEnd(nodeId),
    },
  });

  return (
    <For each={props.nodes()}>
      {(rn) => {
        const editing = () => props.editingId() === rn.node.id;
        const color = () => props.effectiveColor(rn.node.id);
        // The container-tint override lives on this wrapper, an ancestor of
        // NodeContainer's own root div — CSS custom properties inherit down
        // to the soft-container div NodeContainer renders, so this reaches it
        // with no color-shaped change to cactus (see NodeContainer.tsx:74).
        const wrapperStyle = (): JSX.CSSProperties => {
          const token = color();
          return token ? { '--cactus-container-tint': `var(--color-atlas-${token}-container)` } : {};
        };
        return (
          <div style={wrapperStyle()}>
            <NodeContainer
              nodeId={rn.node.id}
              x={() => rn.x}
              y={() => rn.y}
              w={() => rn.w}
              h={() => (editing() ? EDIT_HEIGHT : rn.h)}
              softContainer={() => rn.hasChildren}
              onPointerDown={(e) => {
                ctx.onNodePointerDown(rn.node.id, e);
                dragPointerDown(rn.node.id, e);
              }}
            >
              <AtlasNodeContent
                node={() => rn.node}
                color={color}
                selected={() => ctx.isSelected(rn.node.id)}
                editing={editing}
                onEnterEdit={() => props.onEnterEdit(rn.node.id)}
                onCommit={(form) => props.onCommit(rn.node.id, form)}
                onCancel={props.onCancel}
                onModeChange={(mode) => props.onModeChange(rn.node.id, mode)}
              />
            </NodeContainer>
          </div>
        );
      }}
    </For>
  );
}

export function AtlasCanvas(props: AtlasCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  const [editingId, setEditingId] = createSignal<string | null>(null);

  // Color preview: a local-only signal, scoped to the node being previewed so
  // one node's hover can never tint another. Never passed to dispatchDoc.
  const [previewColor, setPreviewColor] = createSignal<{ nodeId: string; token: AtlasColorToken | undefined } | undefined>();
  function effectiveColor(nodeId: string): AtlasColorToken | undefined {
    const preview = previewColor();
    if (preview && preview.nodeId === nodeId) return preview.token;
    return nodesById().get(nodeId)?.color;
  }

  const nodes = createMemo(() => projectAtlasNodes(props.doc));
  const nodesById = createMemo(() => new Map(props.doc.nodes.map((n) => [n.id, n])));
  const edges = createMemo(() => toEdgeDeclarations(props.doc));

  // Drag position override for the node currently being dragged — ephemeral,
  // merged over projectAtlasNodes's layout-computed positions and discarded
  // whenever the drag ends or the document changes. See DataflowCanvas.tsx:135,138-144,147.
  const [nodeOverride, setNodeOverride] = createSignal<{ id: string; x: number; y: number } | null>(null);
  let dragStart: { id: string; x: number; y: number } | null = null;
  let lastHit: string | null = null;
  let dragPointerMove: ((e: PointerEvent) => void) | null = null;

  const renderNodes = createMemo(() => {
    const override = nodeOverride();
    if (!override) return nodes();
    return nodes().map((rn) => (rn.node.id === override.id ? { ...rn, x: override.x, y: override.y } : rn));
  });

  createEffect(on(() => props.doc, () => setNodeOverride(null), { defer: true }));

  function beginDrag(nodeId: string) {
    const rn = nodes().find((n) => n.node.id === nodeId);
    if (!rn) return;
    dragStart = { id: nodeId, x: rn.x, y: rn.y };
    lastHit = null;
    setNodeOverride({ id: nodeId, x: rn.x, y: rn.y });
    const exclude = selfAndDescendantIds(props.doc, nodeId);
    // eslint-disable-next-line solid/reactivity -- pointermove callback, not a render path; props.doc is read fresh on each invocation
    dragPointerMove = (e: PointerEvent) => {
      lastHit = findContainerAt(e.clientX, e.clientY, exclude);
      props.onPendingMembershipChange?.(describePendingDrop(props.doc, nodeId, lastHit));
    };
    window.addEventListener('pointermove', dragPointerMove);
  }

  function moveDrag(nodeId: string, dx: number, dy: number) {
    if (!dragStart || dragStart.id !== nodeId) return;
    setNodeOverride({ id: nodeId, x: dragStart.x + dx, y: dragStart.y + dy });
  }

  function endDrag(nodeId: string) {
    if (dragPointerMove) {
      window.removeEventListener('pointermove', dragPointerMove);
      dragPointerMove = null;
    }
    props.onPendingMembershipChange?.(null);
    setNodeOverride(null);
    dragStart = null;

    const outcome = resolveDrop(props.doc, nodeId, lastHit);
    lastHit = null;
    if (!outcome.changed) return;
    if (outcome.result.ok) {
      props.dispatchDoc(outcome.result.doc);
    } else {
      props.onDropRefused?.(outcome.result.error);
    }
  }

  function enterEdit(id: string) {
    setEditingId(id);
  }

  function commitEdit(id: string, form: NodeEditForm) {
    const node = nodesById().get(id);
    setEditingId(null);
    if (!node) return;
    const result = setNode(props.doc, id, buildContentEditPatch(form, node.name, node.content?.mode));
    if (result.ok) props.dispatchDoc(result.doc);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function changeMode(id: string, mode: AtlasContentMode) {
    const node = nodesById().get(id);
    if (!node) return;
    const result = setNode(props.doc, id, buildModePatch(node.content, mode));
    if (result.ok) props.dispatchDoc(result.doc);
  }

  // Drop out of edit mode if the document reloads out from under the editing
  // node (e.g. a remote, non-echo change) — see DataflowCanvas.tsx:215-220.
  createEffect(on(() => props.doc, (doc) => {
    const id = editingId();
    if (id && !doc.nodes.some((n) => n.id === id)) setEditingId(null);
  }));

  // R23: the camera moves only on pan, zoom, or the fit control. Nothing here
  // may move it in response to a Document change.
  function fitAll() {
    const list = nodes();
    if (!canvasRef || list.length === 0) return;
    const rects = list.map((n) => ({ x: n.x, y: n.y, width: n.w, height: n.h }));
    canvasRef.fitView(rects, 64);
  }

  function selectColor(nodeId: string, token: AtlasColorToken) {
    setPreviewColor(undefined);
    const result = setNode(props.doc, nodeId, buildColorPatch(token));
    if (result.ok) props.dispatchDoc(result.doc);
  }

  function nodeContextMenu(nodeId: string): MenuSchema | undefined {
    const items: MenuItem[] = [
      { type: 'action', action: { id: 'node.duplicate', label: 'Duplicate', payload: { id: nodeId } } },
      { type: 'action', action: { id: 'node.add', label: 'Add Node', payload: { parent: nodeId } } },
      { type: 'divider' },
      {
        type: 'submenu',
        label: 'Color',
        items: [
          {
            type: 'custom',
            id: 'color-swatches',
            render: () => (
              <ColorSwatchGrid
                current={() => nodesById().get(nodeId)?.color}
                onPreview={(token) => setPreviewColor(token === undefined ? undefined : { nodeId, token })}
                onSelect={(token) => selectColor(nodeId, token)}
              />
            ),
          },
        ],
      },
    ];
    return { id: `node-menu-${nodeId}`, items };
  }

  const chrome: ChromeSchema = {
    top: [
      {
        id: 'atlas-view-toolbar',
        controls: [{ type: 'button', action: { id: 'view.fit', label: 'Fit' } }],
      },
    ],
  };

  function backgroundContextMenu(): MenuSchema | undefined {
    return {
      id: 'background-menu',
      items: [{ type: 'action', action: { id: 'node.add', label: 'Add Node', payload: {} } }],
    };
  }

  function onAction(id: string, payload?: unknown) {
    switch (id) {
      case 'view.fit': {
        fitAll();
        break;
      }
      case 'node.duplicate': {
        const { id: nodeId } = payload as { id: string };
        props.dispatchDoc(duplicateNode(props.doc, nodeId));
        break;
      }
      case 'node.add': {
        const { parent } = payload as { parent?: string };
        const existingIds = new Set(props.doc.nodes.map((n) => n.id));
        const newId = uniqueId('new-node', existingIds);
        const result = addNode(props.doc, { id: newId, name: 'New Node', parent });
        if (result.ok) props.dispatchDoc(result.doc);
        break;
      }
    }
  }

  return (
    <>
      <style>{ATLAS_NODE_MD_STYLES}</style>
      <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
        <Canvas
          ref={(r) => { canvasRef = r; }}
          edges={edges()}
          chrome={chrome}
          nodeContextMenu={nodeContextMenu}
          backgroundContextMenu={backgroundContextMenu}
          onAction={onAction}
        >
          <AtlasNodeLayer
            nodes={renderNodes}
            editingId={editingId}
            onEnterEdit={enterEdit}
            onCommit={commitEdit}
            onCancel={cancelEdit}
            onModeChange={changeMode}
            onDragStart={beginDrag}
            onDrag={moveDrag}
            onDragEnd={endDrag}
            effectiveColor={effectiveColor}
          />
        </Canvas>
      </div>
    </>
  );
}
