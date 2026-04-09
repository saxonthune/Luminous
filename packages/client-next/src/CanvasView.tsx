import { createSignal, createEffect, onMount, onCleanup, Show, For, type JSX } from 'solid-js';
import {
  Canvas,
  useNodeDrag,
  useNodeResize,
  useCanvasContext,
  forceDirectedLayout,
  treeLayout,
  tidyLayout,
  type CanvasRef,
  type ResizeDirection,
} from '@luminous/cactus';
import { getDocument, postAction, type Document, type NodeStructure, type Geometry } from './api';
import { SchemaNode } from './SchemaNode';
import { createCanvasIndex, type CanvasIndex } from './canvasIndex';
import { defaultSchemas } from './schemas';
import { FreeformEdge } from './FreeformEdge';
import { CanvasToolbar } from './CanvasToolbar';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { theme, toggleTheme } from './theme';

interface CanvasViewProps {
  documentPath: string;
  onBack: () => void;
}

function isDocumentV2(doc: unknown): doc is Document {
  return !!doc && typeof doc === 'object' && (doc as Document).version === 2;
}

/** Walk up parent pointers via the index to compute absolute canvas position. */
function getAbsolutePos(id: string, index: CanvasIndex): { x: number; y: number } {
  const n = index.getNode(id);
  if (!n) return { x: 0, y: 0 };
  if (!n.parent) return { x: n.geometry.x, y: n.geometry.y };
  const parentAbs = getAbsolutePos(n.parent, index);
  return { x: parentAbs.x + n.geometry.x, y: parentAbs.y + n.geometry.y };
}

/** Find the deepest drop-target container under the pointer (excludes the dragged node). */
function findDropTarget(screenX: number, screenY: number, excludeId: string): string | null {
  const elements = document.elementsFromPoint(screenX, screenY);
  for (const el of elements) {
    if (el.getAttribute('data-drop-target') === 'true') {
      const containerId = el.getAttribute('data-container-id');
      if (containerId && containerId !== excludeId) return containerId;
    }
  }
  return null;
}

/**
 * Produce a fractional-index string that sorts after the last sibling.
 * First-pass: append '5' to the last order string (always sorts after).
 */
function nextOrder(parent: string | null, index: CanvasIndex): string {
  const siblings = index.getChildren(parent);
  if (siblings.length === 0) return 'a000000';
  const last = index.getNode(siblings[siblings.length - 1]);
  return (last?.order ?? 'a000000') + '5';
}

// ---------------------------------------------------------------------------
// CanvasContent — rendered inside <Canvas>, can call useCanvasContext()
// ---------------------------------------------------------------------------

interface CanvasContentProps {
  index: CanvasIndex;
  documentPath: string;
  loadDoc: () => void;
  onClearSelectionReady: (fn: () => void) => void;
  onCreateNoteReady: (fn: () => void) => void;
  /** Tidy a subtree rooted at rootId; provided by CanvasView (measureAndTidy). */
  onTidy: (rootId: string) => void;
}

function CanvasContent(props: CanvasContentProps): JSX.Element {
  const {
    transform,
    ctrlHeld,
    clearSelection,
    selectedIds,
    onNodePointerDown,
    screenToCanvas,
  } = useCanvasContext();

  props.onClearSelectionReady(clearSelection);

  // Wrap index.setContent to also fire node/setContent server action
  const originalSetContent = props.index.setContent.bind(props.index);
  props.index.setContent = (id: string, patch: Record<string, unknown>) => {
    originalSetContent(id, patch);
    postAction('node/setContent', {
      path: props.documentPath,
      id,
      fields: patch,
    }).catch(() => props.loadDoc());
  };

  // Live tracking state — base values captured at drag/resize start
  const dragBaseMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  const resizeBaseMap = new Map<string, { w: number; h: number }>();
  let lastPointer = { x: 0, y: 0 };

  onMount(() => {
    const handler = (e: PointerEvent) => {
      lastPointer = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', handler);
    onCleanup(() => window.removeEventListener('pointermove', handler));
  });

  // Delete key handler
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).closest?.('.cm-editor'))
      )
        return;
      const ids = selectedIds();
      if (ids.length === 0) return;
      clearSelection();
      for (const id of ids) {
        props.index.deleteNode(id);
        postAction('node/delete', { path: props.documentPath, id }).catch(() => props.loadDoc());
      }
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });

  // ---------------------------------------------------------------------------
  // Drag callbacks
  // ---------------------------------------------------------------------------

  const dragCallbacks = {
    onDragStart(nodeId: string) {
      const node = props.index.getNode(nodeId);
      if (node) {
        dragBaseMap.set(nodeId, {
          x: node.geometry.x,
          y: node.geometry.y,
          w: node.geometry.w,
          h: node.geometry.h,
        });
      }
    },
    onDrag(nodeId: string, dx: number, dy: number) {
      const base = dragBaseMap.get(nodeId);
      if (!base) return;
      const newGeo: Geometry = { x: base.x + dx, y: base.y + dy, w: base.w, h: base.h };
      props.index.setGeometry(nodeId, newGeo);
    },
    onDragEnd(nodeId: string) {
      const base = dragBaseMap.get(nodeId);
      dragBaseMap.delete(nodeId);

      const node = props.index.getNode(nodeId);
      if (!node) return;

      const newGeometry = node.geometry; // already updated by onDrag

      if (ctrlHeld()) {
        const dropTargetId = findDropTarget(lastPointer.x, lastPointer.y, nodeId);

        if (dropTargetId && dropTargetId !== node.parent) {
          // Nest under drop target — compute relative geometry
          const targetAbs = getAbsolutePos(dropTargetId, props.index);
          const nodeAbs = getAbsolutePos(nodeId, props.index);
          const relGeometry: Geometry = {
            x: nodeAbs.x - targetAbs.x,
            y: nodeAbs.y - targetAbs.y,
            w: newGeometry.w,
            h: newGeometry.h,
          };
          const order = nextOrder(dropTargetId, props.index);
          props.index.setParent(nodeId, dropTargetId, order);
          props.index.setGeometry(nodeId, relGeometry);

          Promise.all([
            postAction('node/setParent', {
              path: props.documentPath,
              id: nodeId,
              parent: dropTargetId,
              order,
            }),
            postAction('node/setGeometry', {
              path: props.documentPath,
              id: nodeId,
              geometry: relGeometry,
            }),
          ]).catch(() => props.loadDoc());
          return;
        }

        if (!dropTargetId && node.parent) {
          // Unnest to top level — absolute position becomes the new geometry
          const nodeAbs = getAbsolutePos(nodeId, props.index);
          const topLevelGeo: Geometry = {
            x: nodeAbs.x,
            y: nodeAbs.y,
            w: newGeometry.w,
            h: newGeometry.h,
          };
          const order = nextOrder(null, props.index);
          props.index.setParent(nodeId, null, order);
          props.index.setGeometry(nodeId, topLevelGeo);

          Promise.all([
            postAction('node/setParent', {
              path: props.documentPath,
              id: nodeId,
              parent: null,
              order,
            }),
            postAction('node/setGeometry', {
              path: props.documentPath,
              id: nodeId,
              geometry: topLevelGeo,
            }),
          ]).catch(() => props.loadDoc());
          return;
        }
      }

      // Plain move within current parent — geometry already updated, just persist
      postAction('node/setGeometry', {
        path: props.documentPath,
        id: nodeId,
        geometry: newGeometry,
      }).catch(() => props.loadDoc());
    },
  };

  const { onPointerDown: onDragPointerDown } = useNodeDrag({
    zoomScale: () => transform().k,
    handleSelector: '[data-drag-handle]',
    callbacks: dragCallbacks,
  });

  // ---------------------------------------------------------------------------
  // Resize callbacks
  // ---------------------------------------------------------------------------

  const resizeCallbacks = {
    onResizeStart(nodeId: string) {
      const node = props.index.getNode(nodeId);
      if (node) resizeBaseMap.set(nodeId, { w: node.geometry.w, h: node.geometry.h });
    },
    onResize(nodeId: string, dw: number, dh: number) {
      const base = resizeBaseMap.get(nodeId);
      if (!base) return;
      const node = props.index.getNode(nodeId);
      if (!node) return;
      const newGeo: Geometry = {
        x: node.geometry.x,
        y: node.geometry.y,
        w: Math.max(120, base.w + dw),
        h: Math.max(80, base.h + dh),
      };
      props.index.setGeometry(nodeId, newGeo);
    },
    onResizeEnd(nodeId: string) {
      resizeBaseMap.delete(nodeId);
      const node = props.index.getNode(nodeId);
      if (!node) return;
      postAction('node/setGeometry', {
        path: props.documentPath,
        id: nodeId,
        geometry: node.geometry,
      }).catch(() => props.loadDoc());
    },
  };

  const { onResizePointerDown } = useNodeResize({
    zoomScale: () => transform().k,
    callbacks: resizeCallbacks,
  });

  // ---------------------------------------------------------------------------
  // Node delete (from context menu)
  // ---------------------------------------------------------------------------

  const handleDelete = (id: string) => {
    props.index.deleteNode(id);
    postAction('node/delete', { path: props.documentPath, id }).catch(() => props.loadDoc());
  };

  // ---------------------------------------------------------------------------
  // New note creation (wired from toolbar via onCreateNoteReady)
  // ---------------------------------------------------------------------------

  props.onCreateNoteReady(() => {
    const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
    const newId = crypto.randomUUID();
    const newStructure: NodeStructure = {
      id: newId,
      schemaName: 'note',
      parent: null,
      order: nextOrder(null, props.index),
      geometry: {
        x: Math.round(center.x - 100),
        y: Math.round(center.y - 75),
        w: 200,
        h: 150,
      },
    };
    const newContent = { title: 'New Note', body: '' };

    props.index.createNode(newStructure, newContent);

    postAction('node/create', {
      path: props.documentPath,
      id: newId,
      schemaName: 'note',
      parent: null,
      order: newStructure.order,
      geometry: newStructure.geometry,
      content: newContent,
    }).catch(() => props.loadDoc());
  });

  // ---------------------------------------------------------------------------
  // Render top-level nodes via SchemaNode
  // ---------------------------------------------------------------------------

  const topLevelIds = () => props.index.getChildren(null);

  return (
    <For each={topLevelIds()}>
      {(id) => (
        <SchemaNode
          nodeId={id}
          index={props.index}
          onDragPointerDown={onDragPointerDown}
          onResizePointerDown={onResizePointerDown}
          onDelete={handleDelete}
          onTidy={props.onTidy}
        />
      )}
    </For>
  );
}

// ---------------------------------------------------------------------------
// CanvasView — outer component
// ---------------------------------------------------------------------------

export function CanvasView(props: CanvasViewProps) {
  const [index, setIndex] = createSignal<CanvasIndex | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [firstTidyDone, setFirstTidyDone] = createSignal(false);

  let clearSelectionFn: () => void = () => {};
  let createNoteFn: () => void = () => {};
  let canvasRef: CanvasRef | undefined;

  let loadDocTimer: ReturnType<typeof setTimeout> | null = null;

  const loadDoc = () => {
    if (loadDocTimer !== null) return;
    const isInitial = !index();
    if (isInitial) setLoading(true);
    setError(null);
    const delay = isInitial ? 0 : 300;
    loadDocTimer = setTimeout(() => {
      loadDocTimer = null;
      getDocument(props.documentPath)
        .then((raw) => {
          if (!isDocumentV2(raw)) {
            setError(
              'This canvas is in the v1 format. Regenerate it via the pipeline or convert manually.'
            );
            setIndex(null);
            if (isInitial) setLoading(false);
            return;
          }
          // Inject default schemas if absent — additive, doesn't overwrite canvas-defined schemas
          const docWithDefaults: Document = {
            ...raw,
            schemas: { ...defaultSchemas, ...raw.schemas },
          };
          const idx = index();
          if (idx) {
            idx.replace(docWithDefaults);
          } else {
            setIndex(createCanvasIndex(docWithDefaults));
          }
          if (isInitial) setLoading(false);
        })
        .catch((err) => {
          console.error('[CanvasView] failed to load document:', props.documentPath, err);
          if (isInitial) {
            setError('Failed to load document');
            setLoading(false);
          }
        });
    }, delay);
  };

  onMount(() => {
    loadDoc();

    // WebSocket watch — reload when an external process edits this file
    const wsUrl = `ws://${location.host}/ws/watch`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data.event === 'changed' && data.path === props.documentPath) {
            loadDoc();
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000);
      };
    }
    connect();

    onCleanup(() => {
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (loadDocTimer !== null) clearTimeout(loadDocTimer);
      ws?.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge handling
  // ---------------------------------------------------------------------------

  const handleConnect = ({ source, target }: { source: string; target: string }) => {
    if (source === target) return;
    const idx = index();
    if (!idx) return;

    const edgeId = crypto.randomUUID();
    // Optimistically add edge to index
    idx.doc().edges[edgeId] = { id: edgeId, fromId: source, toId: target, label: null };

    postAction('edge/connect', {
      path: props.documentPath,
      id: edgeId,
      fromId: source,
      toId: target,
    })
      .then((result) => { if (!result.ok) loadDoc(); })
      .catch(() => loadDoc());
  };

  const handleUpdateEdgeLabel = (edgeId: string, label: string | null) => {
    const idx = index();
    if (!idx) return;
    const doc = idx.doc();
    if (doc.edges[edgeId]) doc.edges[edgeId].label = label;
    postAction('edge/relabel', { path: props.documentPath, id: edgeId, label }).catch(() =>
      loadDoc()
    );
  };

  // ---------------------------------------------------------------------------
  // Layout helpers
  // ---------------------------------------------------------------------------

  const measureAndTidy = (rootId?: string) => {
    const idx = index();
    if (!idx) return;
    const doc = idx.doc();

    // 1. Snapshot offsetHeight of every node's inner div in one DOM pass.
    // SchemaNode renders the inner div as a child of NodeContainer, which has
    // data-node-id="{id}". The first child of that element is the inner div.
    const measured = new Map<string, number>();
    const nodeEls = document.querySelectorAll<HTMLElement>('[data-node-id]');
    for (const el of nodeEls) {
      const id = el.dataset.nodeId;
      if (!id || !doc.structure[id]) continue;
      const inner = el.firstElementChild as HTMLElement | null;
      if (!inner) continue;
      measured.set(id, inner.offsetHeight);
    }

    // 2. Build TidyNode[] using measured heights (fall back to geometry.h if unmeasured).
    // `category` lets cactus group root nodes into stacked rows by schemaName.
    const tidyNodes = Object.entries(doc.structure).map(([id, n]) => ({
      id,
      w: n.geometry.w,
      h: measured.get(id) ?? n.geometry.h,
      parentId: n.parent,
      category: n.schemaName,
    }));
    // Sort by (parent, order) so siblings pack in declared order.
    tidyNodes.sort((a, b) => {
      const pa = a.parentId ?? '';
      const pb = b.parentId ?? '';
      if (pa !== pb) return pa < pb ? -1 : 1;
      const oa = doc.structure[a.id].order;
      const ob = doc.structure[b.id].order;
      return oa < ob ? -1 : oa > ob ? 1 : 0;
    });

    // 3. Run tidyLayout. categoryOrder enables bucketed root layout (one row per kind).
    const result = tidyLayout(
      tidyNodes,
      rootId
        ? { rootId }
        : {
            categoryOrder: ['component', 'hook', 'signal', 'store', 'memo', 'effect', 'datasource', 'container'],
            rowGap: 120,
          },
    );

    // 4. Apply results: update index + post to server.
    for (const [id, rect] of result) {
      const isSubtreeRoot = rootId === id;
      const node = idx.getNode(id);
      if (!node) continue;
      const newGeo: Geometry = isSubtreeRoot
        ? { ...node.geometry, w: rect.w, h: rect.h }
        : { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      idx.setGeometry(id, newGeo);
      postAction('node/setGeometry', {
        path: props.documentPath,
        id,
        geometry: newGeo,
      }).catch(() => loadDoc());
    }
  };

  // First-load auto-tidy: after the doc loads and Solid has flushed the DOM,
  // measure all nodes and apply tidy layout. The double-RAF ensures we see the
  // post-flush DOM. Guarded by firstTidyDone so reconnects don't re-tidy.
  createEffect(() => {
    const idx = index();
    if (!idx) return;
    if (firstTidyDone()) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        measureAndTidy();
        setFirstTidyDone(true);
      })
    );
  });

  const arrangeForceLayout = () => {
    const idx = index();
    if (!idx) return;

    const layoutNodes = idx.getChildren(null).map((id) => {
      const n = idx.getNode(id)!;
      return { id, x: n.geometry.x, y: n.geometry.y, width: n.geometry.w, height: n.geometry.h };
    });
    const layoutEdges = Object.values(idx.doc().edges).map((e) => ({
      source: e.fromId,
      target: e.toId,
    }));

    const result = forceDirectedLayout(layoutNodes, layoutEdges);

    for (const [id, pos] of result) {
      const node = idx.getNode(id);
      if (!node) continue;
      const newGeo: Geometry = { ...node.geometry, x: pos.x, y: pos.y };
      idx.setGeometry(id, newGeo);
      postAction('node/setGeometry', {
        path: props.documentPath,
        id,
        geometry: newGeo,
      }).catch(() => loadDoc());
    }
  };

  const arrangeTreeLayout = () => {
    const idx = index();
    if (!idx) return;

    const layoutNodes = idx.getChildren(null).map((id) => {
      const n = idx.getNode(id)!;
      return { id, x: n.geometry.x, y: n.geometry.y, width: n.geometry.w, height: n.geometry.h };
    });
    const layoutEdges = Object.values(idx.doc().edges).map((e) => ({
      source: e.fromId,
      target: e.toId,
    }));

    const result = treeLayout(layoutNodes, layoutEdges);

    for (const [id, pos] of result) {
      const node = idx.getNode(id);
      if (!node) continue;
      const newGeo: Geometry = { ...node.geometry, x: pos.x, y: pos.y };
      idx.setGeometry(id, newGeo);
      postAction('node/setGeometry', {
        path: props.documentPath,
        id,
        geometry: newGeo,
      }).catch(() => loadDoc());
    }
  };

  // ---------------------------------------------------------------------------
  // Derived helpers used by Canvas
  // ---------------------------------------------------------------------------

  const getNodeRects = () => {
    const idx = index();
    if (!idx) return [];
    return idx.getChildren(null).map((id) => {
      const n = idx.getNode(id)!;
      return { id, x: n.geometry.x, y: n.geometry.y, width: n.geometry.w, height: n.geometry.h };
    });
  };

  const getAbsoluteRect = (id: string) => {
    const idx = index();
    if (!idx) return undefined;
    const node = idx.getNode(id);
    if (!node) return undefined;
    const pos = getAbsolutePos(id, idx);
    return { x: pos.x, y: pos.y, w: node.geometry.w, h: node.geometry.h };
  };

  const renderEdges = () => {
    const idx = index();
    if (!idx) return null;
    const edges = Object.values(idx.doc().edges);
    return (
      <For each={edges}>
        {(edge) => (
          <FreeformEdge
            edge={edge}
            getAbsoluteRect={getAbsoluteRect}
            onUpdateLabel={handleUpdateEdgeLabel}
          />
        )}
      </For>
    );
  };

  // Background context menu
  const [bgContextMenu, setBgContextMenu] = createSignal<{ x: number; y: number } | null>(null);
  const bgMenuItems = (): MenuItem[] => [
    { label: 'Tidy canvas', action: () => measureAndTidy() },
  ];

  return (
    <div class="flex h-screen flex-col" style={{ background: 'var(--bg-canvas)' }}>
      <div class="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 shrink-0">
        <button
          onClick={props.onBack}
          class="rounded-md border border-[var(--border-default)] px-3 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]"
        >
          ← Back
        </button>
        <span class="text-sm text-[var(--text-secondary)]">{props.documentPath}</span>
        <div class="flex-1" />
        <button
          onClick={toggleTheme}
          class="rounded-md border border-[var(--border-default)] px-3 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]"
        >
          {theme() === 'light' ? '☀' : '☾'}
        </button>
        <button
          onClick={() => createNoteFn()}
          class="rounded-md bg-[var(--color-accent)] px-3 py-1 text-sm font-medium text-[var(--text-on-accent)] hover:bg-[var(--color-accent-hover)]"
        >
          + New Note
        </button>
      </div>

      <div class="flex-1 overflow-hidden relative">
        <Show when={loading()}>
          <div class="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            Loading…
          </div>
        </Show>
        <Show when={error()}>
          <div class="flex h-full items-center justify-center text-sm text-red-500">
            {error()}
          </div>
        </Show>
        <Show when={!loading() && !error() && index()}>
          {(idx) => (
            <>
              <Canvas
                ref={(ref) => { canvasRef = ref; }}
                class="w-full h-full"
                connectionDrag={{ onConnect: handleConnect }}
                renderEdges={renderEdges}
                renderConnectionPreview={(coords) => (
                  <line
                    x1={coords.startX} y1={coords.startY}
                    x2={coords.currentX} y2={coords.currentY}
                    stroke="var(--color-edge)" stroke-width={2}
                    stroke-dasharray="6 3" stroke-linecap="round"
                  />
                )}
                boxSelect={{ getNodeRects }}
                onBackgroundPointerDown={() => clearSelectionFn()}
                onBackgroundContextMenu={(e) => setBgContextMenu({ x: e.clientX, y: e.clientY })}
              >
                <CanvasContent
                  index={idx()}
                  documentPath={props.documentPath}
                  loadDoc={loadDoc}
                  onClearSelectionReady={(fn) => (clearSelectionFn = fn)}
                  onCreateNoteReady={(fn) => (createNoteFn = fn)}
                  onTidy={(rootId) => measureAndTidy(rootId)}
                />
              </Canvas>
              <CanvasToolbar
                onZoomIn={() => canvasRef?.zoomIn()}
                onZoomOut={() => canvasRef?.zoomOut()}
                onFitView={() => canvasRef?.fitView(getNodeRects())}
                onTreeLayout={arrangeTreeLayout}
                onForceLayout={arrangeForceLayout}
                onTidyLayout={() => measureAndTidy()}
              />
              <Show when={bgContextMenu()}>
                {(menu) => (
                  <ContextMenu
                    x={menu().x}
                    y={menu().y}
                    header={`Canvas · ${props.documentPath}`}
                    items={bgMenuItems()}
                    onClose={() => setBgContextMenu(null)}
                  />
                )}
              </Show>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
