import { For, Show, createMemo, createEffect, createSignal, onMount, onCleanup, on } from 'solid-js';
import type { JSX } from 'solid-js';
import type { DataflowDocument, DataflowAction } from '@luminous/core/dataflow';
import { applyDataflowBatch, type DataflowResult } from '@luminous/core/dataflow';
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
import { uniqueId, appendBox, duplicateBoxes, insertBoxOnFlow, groupRenameBatch, setGroupBatch, deleteBatch } from './mutations';
import { NamePromptDialog } from './NamePromptDialog';

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
  basePositions: () => Map<string, { x: number; y: number }>;
  exposePositions: (getter: () => ReadonlyMap<string, { x: number; y: number }>) => void;
}): JSX.Element {
  const ctx = useCanvasContext();
  const boxesById = createMemo(() => new Map(props.doc.boxes.map((b) => [b.id, b])));

  const [nodeOverrides, setNodeOverrides] = createSignal<Map<string, { x: number; y: number }>>(new Map());
  const dragStartPositions = new Map<string, { x: number; y: number }>();

  const positions = createMemo(() => {
    const overrides = nodeOverrides();
    if (overrides.size === 0) return props.basePositions();
    const merged = new Map(props.basePositions());
    for (const [id, pos] of overrides) merged.set(id, pos);
    return merged;
  });

  // eslint-disable-next-line solid/reactivity -- one-shot registration, mirrors PgCanvasView's exposeRects
  props.exposePositions(() => positions());

  // The next layout run wins over any in-progress drag override.
  createEffect(on(() => props.doc, () => setNodeOverrides(new Map()), { defer: true }));

  const { onPointerDown: dragPointerDown } = useNodeDrag({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragStart: (nodeId) => {
        const pos = positions().get(nodeId);
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

  return (
    <For each={props.nodes()}>
      {(node) => {
        const box = () => boxesById().get(node.id);
        const pos = () => positions().get(node.id) ?? { x: 0, y: 0 };
        return (
          <NodeContainer
            nodeId={node.id}
            x={() => pos().x}
            y={() => pos().y}
            w={() => node.w}
            h={() => node.h}
            onPointerDown={(e) => {
              ctx.onNodePointerDown(node.id, e);
              dragPointerDown(node.id, e);
            }}
          >
            <div class="flex h-full w-full flex-col gap-1 overflow-hidden rounded border border-border-subtle bg-surface p-2">
              <div class="text-sm font-semibold text-fg">{box()?.name}</div>
              <Show when={box()?.description}>
                <p class="text-xs text-fg-muted">{box()?.description}</p>
              </Show>
              <Show when={box()?.contract}>
                <div class="mt-auto">
                  <div class="text-[10px] uppercase tracking-wide text-fg-subtle">
                    {box()?.contract?.format}
                  </div>
                  <pre class="max-h-16 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-alt p-1 text-[10px] text-fg-muted">
                    {box()?.contract?.text}
                  </pre>
                </div>
              </Show>
            </div>
          </NodeContainer>
        );
      }}
    </For>
  );
}

export function DataflowCanvas(props: DataflowCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  let getNodePositions: () => ReadonlyMap<string, { x: number; y: number }> = () => new Map();
  const [groupPromptTargets, setGroupPromptTargets] = createSignal<string[] | null>(null);

  const nodes = createMemo(() => toTidyNodes(props.doc));
  const sizes = createMemo(() => new Map(nodes().map((n) => [n.id, { w: n.w, h: n.h }])));
  const basePositions = createMemo(() => dagLayout(nodes(), toLayoutEdges(props.doc)));
  const edges = createMemo(() => toEdgeDeclarations(props.doc));
  const boxesById = createMemo(() => new Map(props.doc.boxes.map((b) => [b.id, b])));
  const clusters = createMemo(() =>
    toClusterDeclarations(props.doc).map((cluster) => ({
      ...cluster,
      onLabelEdit: (newLabel: string) => renameGroup(cluster.label ?? cluster.id, newLabel),
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
    const items: MenuItem[] = [
      { type: 'action', action: { id: 'box.duplicate', label: 'Duplicate', payload: { ids } } },
      { type: 'action', action: { id: 'box.duplicateWithFlows', label: 'Duplicate with Flows', payload: { ids } } },
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
      { type: 'action', action: { id: 'box.delete', label: 'Delete', tone: 'danger', payload: { ids } } },
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
      <Canvas
        ref={(r) => { canvasRef = r; }}
        edges={edges()}
        clusters={clusters()}
        nodeContextMenu={nodeContextMenu}
        edgeContextMenu={edgeContextMenu}
        backgroundContextMenu={backgroundContextMenu}
        onAction={onAction}
        boxSelect={{
          getNodeRects: () => {
            const positions = getNodePositions();
            const sz = sizes();
            return nodes().map((n) => {
              const p = positions.get(n.id) ?? { x: 0, y: 0 };
              const s = sz.get(n.id) ?? { w: n.w, h: n.h };
              return { id: n.id, x: p.x, y: p.y, width: s.w, height: s.h };
            });
          },
        }}
      >
        <DataflowNodeLayer
          doc={props.doc}
          nodes={nodes}
          basePositions={basePositions}
          exposePositions={(getter) => { getNodePositions = getter; }}
        />
      </Canvas>
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
