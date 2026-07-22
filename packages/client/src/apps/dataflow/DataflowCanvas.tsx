import { For, Show, createMemo, createEffect, createSignal, onMount, onCleanup, on } from 'solid-js';
import type { JSX } from 'solid-js';
import type { DataflowDocument, DataflowAction } from '@luminous/core/dataflow';
import { applyDataflowBatch, setBox, type DataflowResult } from '@luminous/core/dataflow';
import { Canvas, NodeContainer, dagLayout, useCanvasContext, useNodeDrag } from '@luminous/cactus';
import type { CanvasRef, MenuSchema, MenuItem } from '@luminous/cactus';
import {
  BOX_WIDTH,
  toTidyNodes,
  toLayoutEdges,
  toEdgeDeclarations,
  toClusterDeclarations,
  parseEdgeId,
} from './projection';
import {
  uniqueId,
  appendBox,
  duplicateBoxes,
  insertBoxOnFlow,
  groupRenameBatch,
  setGroupBatch,
  deleteBatch,
  buildBoxPatch,
  type BoxEditForm,
} from './mutations';
import { NamePromptDialog } from './NamePromptDialog';
import { BoxContent } from './BoxContent';

// Fixed edit-mode height for a Box being edited — wide enough for name,
// description, and contract fields without content-driven auto-grow (v1).
const EDIT_HEIGHT = 280;

// Scoped styling for the rendered Description markdown — mirrors InfoModal's
// MD_STYLES but sized for the box's small read-mode text.
const BOX_MD_STYLES = `
.dataflow-box-md p { margin: 0 0 .35rem; }
.dataflow-box-md ul { margin: 0 0 .35rem; padding-left: 1rem; list-style: disc; }
.dataflow-box-md li { margin: .1rem 0; }
.dataflow-box-md code { font-family: ui-monospace, monospace; background: var(--cactus-surface-alt, #f3f4f6); padding: .05rem .25rem; border-radius: 3px; font-size: .9em; }
.dataflow-box-md pre { margin: 0 0 .35rem; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--cactus-surface-alt, #f3f4f6); padding: .25rem .35rem; border-radius: 3px; }
.dataflow-box-md pre code { background: none; padding: 0; }
.dataflow-box-md strong { font-weight: 600; }
.dataflow-box-md > :last-child { margin-bottom: 0; }
`;

export interface DataflowCanvasProps {
  doc: DataflowDocument;
  onDocChange?: (next: DataflowDocument) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/**
 * Renders the node layer inside <Canvas>'s provider — drag needs the live
 * zoom scale and pointer-down needs selection, both only reachable via
 * useCanvasContext, which only resolves inside Canvas's children.
 */
function DataflowNodeLayer(props: {
  doc: DataflowDocument;
  nodes: () => ReturnType<typeof toTidyNodes>;
  positions: () => ReadonlyMap<string, { x: number; y: number }>;
  onDragStart: (ids: string[]) => void;
  onDrag: (ids: string[], dx: number, dy: number) => void;
  onDragEnd: (ids: string[]) => void;
  editingId: () => string | null;
  onEnterEdit: (id: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onCommit: (id: string, form: BoxEditForm) => void;
  onCancel: () => void;
}): JSX.Element {
  const ctx = useCanvasContext();
  const boxesById = createMemo(() => new Map(props.doc.boxes.map((b) => [b.id, b])));

  const { onPointerDown: dragPointerDown } = useNodeDrag({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragStart: (nodeId) => props.onDragStart([nodeId]),
      onDrag: (nodeId, dx, dy) => props.onDrag([nodeId], dx, dy),
      onDragEnd: (nodeId) => props.onDragEnd([nodeId]),
    },
  });

  return (
    <For each={props.nodes()}>
      {(node) => {
        const box = () => boxesById().get(node.id);
        const pos = () => props.positions().get(node.id) ?? { x: 0, y: 0 };
        const editing = () => props.editingId() === node.id;
        return (
          <NodeContainer
            nodeId={node.id}
            x={() => pos().x}
            y={() => pos().y}
            w={() => node.w}
            h={() => (editing() ? EDIT_HEIGHT : node.h)}
            onPointerDown={(e) => {
              ctx.onNodePointerDown(node.id, e);
              dragPointerDown(node.id, e);
            }}
          >
            <BoxContent
              box={box}
              selected={() => ctx.isSelected(node.id)}
              editing={editing}
              onEnterEdit={() => {
                props.onEnterEdit(node.id, { x: pos().x, y: pos().y, width: node.w, height: EDIT_HEIGHT });
              }}
              onCommit={(form) => props.onCommit(node.id, form)}
              onCancel={props.onCancel}
            />
          </NodeContainer>
        );
      }}
    </For>
  );
}

export function DataflowCanvas(props: DataflowCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  const [groupPromptTargets, setGroupPromptTargets] = createSignal<string[] | null>(null);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [selectedCount, setSelectedCount] = createSignal(0);

  const nodes = createMemo(() => toTidyNodes(props.doc));
  const sizes = createMemo(() => new Map(nodes().map((n) => [n.id, { w: n.w, h: n.h }])));
  const basePositions = createMemo(() => dagLayout(nodes(), toLayoutEdges(props.doc)));
  const edges = createMemo(() => toEdgeDeclarations(props.doc));
  const boxesById = createMemo(() => new Map(props.doc.boxes.map((b) => [b.id, b])));

  // Drag offsets over the computed layout — shared by single-node drag (via
  // DataflowNodeLayer) and group drag (via cluster label callbacks).
  const [nodeOverrides, setNodeOverrides] = createSignal<Map<string, { x: number; y: number }>>(new Map());
  const dragStartPositions = new Map<string, { x: number; y: number }>();

  const positions = createMemo(() => {
    const overrides = nodeOverrides();
    if (overrides.size === 0) return basePositions();
    const merged = new Map(basePositions());
    for (const [id, pos] of overrides) merged.set(id, pos);
    return merged;
  });

  // The next layout run wins over any in-progress drag override.
  createEffect(on(() => props.doc, () => setNodeOverrides(new Map()), { defer: true }));

  function beginDrag(ids: string[]) {
    for (const id of ids) {
      const pos = positions().get(id);
      if (pos) dragStartPositions.set(id, { ...pos });
    }
  }

  function moveDrag(ids: string[], dx: number, dy: number) {
    setNodeOverrides((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        const start = dragStartPositions.get(id);
        if (start) next.set(id, { x: start.x + dx, y: start.y + dy });
      }
      return next;
    });
  }

  function endDrag(ids: string[]) {
    for (const id of ids) dragStartPositions.delete(id);
  }

  const clusters = createMemo(() =>
    toClusterDeclarations(props.doc).map((cluster) => ({
      ...cluster,
      onLabelEdit: (newLabel: string) => renameGroup(cluster.label ?? cluster.id, newLabel),
      onDragStart: () => beginDrag(cluster.memberIds),
      onDrag: (dx: number, dy: number) => moveDrag(cluster.memberIds, dx, dy),
      onDragEnd: () => endDrag(cluster.memberIds),
    }))
  );

  function apply(result: DataflowResult) {
    if (result.ok) props.onDocChange?.(result.doc);
  }

  function applyBatch(actions: DataflowAction[]) {
    apply(applyDataflowBatch(props.doc, actions));
  }

  function targetIds(nodeId: string): string[] {
    const selected = canvasRef?.getSelectedIds() ?? [];
    if (selected.includes(nodeId) && selected.length > 1) return [...selected];
    return [nodeId];
  }

  function renameGroup(oldName: string, newName: string) {
    applyBatch(groupRenameBatch(props.doc, oldName, newName));
  }

  function enterBoxEdit(id: string, rect: { x: number; y: number; width: number; height: number }) {
    setEditingId(id);
    canvasRef?.fitView([rect], 64);
  }

  function commitBoxEdit(id: string, form: BoxEditForm) {
    const box = boxesById().get(id);
    setEditingId(null);
    if (!box) return;
    apply(setBox(props.doc, id, buildBoxPatch(form, box.name)));
  }

  function cancelBoxEdit() {
    setEditingId(null);
  }

  // Drop out of edit mode if the document reloads out from under the editing
  // box (e.g. a remote, non-echo change) — see plan doc01.05.04.
  createEffect(on(() => props.doc, (doc) => {
    const id = editingId();
    if (id && !doc.boxes.some((b) => b.id === id)) setEditingId(null);
  }));

  createEffect(() => {
    const pos = basePositions();
    const sz = sizes();
    if (!canvasRef || pos.size === 0) return;
    const rects = [...pos.entries()].map(([id, p]) => {
      const s = sz.get(id) ?? { w: BOX_WIDTH, h: 72 };
      return { x: p.x, y: p.y, width: s.w, height: s.h };
    });
    canvasRef.fitView(rects, 64);
  });

  function nodeContextMenu(nodeId: string): MenuSchema | undefined {
    const ids = targetIds(nodeId);
    const groups = [...new Set(props.doc.boxes.map((b) => b.group).filter((g): g is string => Boolean(g)))].sort();
    const hasGroup = ids.some((id) => boxesById().get(id)?.group);
    // In a multi-selection the labels carry the count, so the menu reads as
    // a bulk menu ("Delete 3 Boxes") rather than a single-box one.
    const bulk = ids.length > 1 ? ` ${ids.length} Boxes` : '';
    const items: MenuItem[] = [
      { type: 'action', action: { id: 'box.duplicate', label: `Duplicate${bulk}`, payload: { ids } } },
      { type: 'action', action: { id: 'box.duplicateWithFlows', label: `Duplicate${bulk} with Flows`, payload: { ids } } },
      {
        type: 'submenu',
        label: 'Add to Group',
        items: [
          ...groups.map((group): MenuItem => ({
            type: 'action',
            action: { id: 'box.addToGroup', label: group, payload: { ids, group } },
          })),
          { type: 'action', action: { id: 'box.newGroup', label: 'New Group…', payload: { ids } } },
        ],
      },
      ...(hasGroup
        ? ([{ type: 'action', action: { id: 'box.removeFromGroup', label: 'Remove from Group', payload: { ids } } }] as MenuItem[])
        : []),
      { type: 'divider' },
      { type: 'action', action: { id: 'box.delete', label: `Delete${bulk}`, tone: 'danger', payload: { ids } } },
    ];
    return { id: `node-menu-${nodeId}`, items };
  }

  function edgeContextMenu(edgeId: string): MenuSchema | undefined {
    return {
      id: `edge-menu-${edgeId}`,
      items: [{ type: 'action', action: { id: 'flow.insertBox', label: 'Insert Box', payload: { edgeId } } }],
    };
  }

  function backgroundContextMenu(): MenuSchema | undefined {
    return {
      id: 'background-menu',
      items: [{ type: 'action', action: { id: 'canvas.addBox', label: 'Add Box' } }],
    };
  }

  function onAction(id: string, payload?: unknown) {
    switch (id) {
      case 'box.duplicate': {
        const { ids } = payload as { ids: string[] };
        props.onDocChange?.(duplicateBoxes(props.doc, ids, false));
        break;
      }
      case 'box.duplicateWithFlows': {
        const { ids } = payload as { ids: string[] };
        props.onDocChange?.(duplicateBoxes(props.doc, ids, true));
        break;
      }
      case 'box.addToGroup': {
        const { ids, group } = payload as { ids: string[]; group: string };
        applyBatch(setGroupBatch(ids, group));
        break;
      }
      case 'box.newGroup': {
        const { ids } = payload as { ids: string[] };
        setGroupPromptTargets(ids);
        break;
      }
      case 'box.removeFromGroup': {
        const { ids } = payload as { ids: string[] };
        applyBatch(setGroupBatch(ids, null));
        break;
      }
      case 'box.delete': {
        const { ids } = payload as { ids: string[] };
        applyBatch(deleteBatch(ids));
        break;
      }
      case 'flow.insertBox': {
        const { edgeId } = payload as { edgeId: string };
        const parsed = parseEdgeId(edgeId);
        if (parsed) props.onDocChange?.(insertBoxOnFlow(props.doc, parsed.from, parsed.to));
        break;
      }
      case 'canvas.addBox': {
        const existingIds = new Set(props.doc.boxes.map((b) => b.id));
        const newId = uniqueId('new-box', existingIds);
        props.onDocChange?.(appendBox(props.doc, newId, 'New Box'));
        break;
      }
    }
  }

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isEditableTarget(e.target)) return;
      const ids = canvasRef?.getSelectedIds() ?? [];
      if (ids.length > 0) applyBatch(deleteBatch([...ids]));
    };
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <>
      <style>{BOX_MD_STYLES}</style>
      <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
        <Canvas
          ref={(r) => { canvasRef = r; }}
          edges={edges()}
          clusters={clusters()}
          nodeContextMenu={nodeContextMenu}
          edgeContextMenu={edgeContextMenu}
          backgroundContextMenu={backgroundContextMenu}
          onAction={onAction}
          onSelectionChange={(ids) => setSelectedCount(ids.length)}
          boxSelect={{
            trigger: 'drag',
            getNodeRects: () => {
              const pos = positions();
              const sz = sizes();
              return nodes().map((n) => {
                const p = pos.get(n.id) ?? { x: 0, y: 0 };
                const s = sz.get(n.id) ?? { w: n.w, h: n.h };
                return { id: n.id, x: p.x, y: p.y, width: s.w, height: s.h };
              });
            },
          }}
        >
          <DataflowNodeLayer
            doc={props.doc}
            nodes={nodes}
            positions={positions}
            onDragStart={beginDrag}
            onDrag={moveDrag}
            onDragEnd={endDrag}
            editingId={editingId}
            onEnterEdit={enterBoxEdit}
            onCommit={commitBoxEdit}
            onCancel={cancelBoxEdit}
          />
        </Canvas>
        <Show when={selectedCount() > 1}>
          <div
            data-testid="selection-count"
            class="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs text-fg shadow-sm"
          >
            {selectedCount()} Boxes selected
          </div>
        </Show>
      </div>
      <Show when={groupPromptTargets()}>
        {(ids) => (
          <NamePromptDialog
            title="New Group"
            onSubmit={(name) => {
              applyBatch(setGroupBatch(ids(), name));
              setGroupPromptTargets(null);
            }}
            onCancel={() => setGroupPromptTargets(null)}
          />
        )}
      </Show>
    </>
  );
}
