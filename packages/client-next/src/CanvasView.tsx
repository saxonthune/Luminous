import { createSignal, createEffect, onMount, onCleanup, Show, For, type JSX } from 'solid-js';
import {
  Canvas,
  useNodeDrag,
  useNodeResize,
  useCanvasContext,
  forceDirectedLayout,
  treeLayout,
  tidyLayout,
  dagLayout,
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
import { theme, setTheme, THEMES } from './theme';
import { AboutModal } from './AboutModal';
import { APP_NAME, APP_VERSION } from './version';

interface CanvasViewProps {
  documentPath: string;
  onBack: () => void;
}

function isDocumentV2(doc: unknown): doc is Document {
  return !!doc && typeof doc === 'object' && (doc as Document).version === 2;
}

/** Check if `ancestorId` is an ancestor of `nodeId` in the nesting tree. */
function isAncestorOf(ancestorId: string, nodeId: string, index: CanvasIndex): boolean {
  let current = index.getNode(nodeId)?.parent ?? null;
  while (current) {
    if (current === ancestorId) return true;
    current = index.getNode(current)?.parent ?? null;
  }
  return false;
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

export interface AncestorEdgeInfo {
  label: string;
  targetName: string;
  direction: 'up' | 'down';
}

interface CanvasContentProps {
  index: CanvasIndex;
  documentPath: string;
  loadDoc: () => void;
  onClearSelectionReady: (fn: () => void) => void;
  onCreateNoteReady: (fn: () => void) => void;
  /** Tidy a subtree rooted at rootId; provided by CanvasView (measureAndTidy). */
  onTidy: (rootId: string) => void;
  /** Ancestor edges keyed by descendant node ID — rendered inline instead of as lines. */
  ancestorEdges: () => Map<string, AncestorEdgeInfo[]>;
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
          ancestorEdges={props.ancestorEdges}
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

  // -------------------------------------------------------------------------
  // Node dimension cache — ResizeObserver tracks actual rendered sizes so
  // edges can compute accurate border intersection points even when
  // geometry.h is 0 (auto-sized nodes).
  // -------------------------------------------------------------------------
  const nodeMeasureCache = new Map<string, { w: number; h: number }>();
  let canvasWrapperEl!: HTMLDivElement;

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const nodeId = el.dataset.nodeId;
      if (!nodeId) continue;
      const rect = entry.contentRect;
      nodeMeasureCache.set(nodeId, { w: rect.width, h: rect.height });
    }
  });

  const mutationObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (!(added instanceof HTMLElement)) continue;
        if (added.dataset.nodeId) resizeObserver.observe(added);
        for (const el of added.querySelectorAll<HTMLElement>('[data-node-id]')) {
          resizeObserver.observe(el);
        }
      }
      for (const removed of m.removedNodes) {
        if (!(removed instanceof HTMLElement)) continue;
        if (removed.dataset.nodeId) {
          resizeObserver.unobserve(removed);
          nodeMeasureCache.delete(removed.dataset.nodeId);
        }
        for (const el of removed.querySelectorAll<HTMLElement>('[data-node-id]')) {
          resizeObserver.unobserve(el);
          if (el.dataset.nodeId) nodeMeasureCache.delete(el.dataset.nodeId);
        }
      }
    }
  });

  onCleanup(() => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  });

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

    // 1. Snapshot offsetHeight of the primitive stack in one DOM pass.
    // Measures the primitive stack only (the schema's own header content) —
    // never includes children, which are computed by tidyLayout.
    // NodeContainer has data-node-id="{id}"; its child is the inner div from
    // SchemaNode; the primitive stack wrapper is a child of that inner div.
    const measured = new Map<string, number>();
    const nodeEls = document.querySelectorAll<HTMLElement>('[data-node-id]');
    for (const el of nodeEls) {
      const id = el.dataset.nodeId;
      if (!id || !doc.structure[id]) continue;
      const header = el.querySelector<HTMLElement>(':scope > * > [data-node-header]')
        ?? el.querySelector<HTMLElement>(':scope > * > [data-primitive-stack]');
      if (!header) continue;
      measured.set(id, header.offsetHeight);
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

    // Tidy summary log — catches feedback loops and pathological inflation in one place.
    const before = new Map<string, Geometry>();
    for (const id of result.keys()) {
      const node = idx.getNode(id);
      if (node) before.set(id, { ...node.geometry });
    }

    let maxDeltaH = 0;
    let maxDeltaHId: string | null = null;
    let inflated = 0;
    for (const [id, rect] of result) {
      const b = before.get(id);
      if (!b) continue;
      const dh = rect.h - b.h;
      if (Math.abs(dh) > Math.abs(maxDeltaH)) {
        maxDeltaH = dh;
        maxDeltaHId = id;
      }
      // Inflation flag: any node whose h more than doubled in one tidy run
      if (b.h > 0 && rect.h > b.h * 2 && rect.h - b.h > 200) inflated++;
    }

    const byCategory = new Map<string, { count: number; maxH: number }>();
    for (const [id, rect] of result) {
      const node = idx.getNode(id);
      if (!node || node.parent !== null) continue;
      const cat = node.schemaName;
      const cur = byCategory.get(cat) ?? { count: 0, maxH: 0 };
      cur.count++;
      cur.maxH = Math.max(cur.maxH, rect.h);
      byCategory.set(cat, cur);
    }

    console.groupCollapsed(
      `[tidy] ${rootId ? 'subtree' : 'full'}  nodes=${result.size}  maxΔh=${maxDeltaH}${maxDeltaHId ? ` (${maxDeltaHId.slice(0, 8)})` : ''}${inflated > 0 ? `  ⚠ inflated=${inflated}` : ''}`,
    );
    for (const [cat, stats] of byCategory) {
      console.log(`  ${cat}: count=${stats.count}, maxH=${stats.maxH}`);
    }
    if (inflated > 0) {
      console.warn(`[tidy] ${inflated} node(s) more than doubled in height in one run — likely measurement feedback loop`);
    }
    console.groupEnd();

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

  // Composite layout: measure+tidy for correct sizing, then treeLayout on
  // top-level nodes using edges whose schema declares layoutRole === 'tree'.
  // If no tree-role edges exist, the tidy pass is still applied.
  //
  // This does not call cactus's compositeLayout directly because that
  // function returns positions-only (Map<id, {x,y}>), which would discard
  // the parent-fits-children sizes that the internal tidy pass computes.
  // Running measureAndTidy here writes sizes back to the index via
  // setGeometry, and the subsequent treeLayout pass uses those sizes for
  // top-level positioning.
  const arrangeCompositeLayout = () => {
    // Pass 1: size and tidy-position all nodes (updates the index).
    measureAndTidy();

    // Pass 2: re-position top-level nodes using tree structure.
    const idx = index();
    if (!idx) return;
    const doc = idx.doc();

    const layoutNodes = idx.getChildren(null).map((id) => {
      const n = idx.getNode(id)!;
      return { id, x: n.geometry.x, y: n.geometry.y, width: n.geometry.w, height: n.geometry.h };
    });

    // Filter edges to those whose schema declares layoutRole === 'tree'.
    // Cactus stays agnostic — the filter lives here in the domain layer.
    const treeEdges = Object.values(doc.edges)
      .filter((e) => {
        if (!e.schemaName) return false;
        const schema = doc.schemas[e.schemaName];
        return schema?.kind === 'edge' && schema.layoutRole === 'tree';
      })
      .map((e) => ({ source: e.fromId, target: e.toId }));

    if (treeEdges.length === 0) {
      console.log('[composite] no tree-role edges in this canvas — tidy pass only');
      return;
    }

    const result = treeLayout(layoutNodes, treeEdges);

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
  // DAG layout: topological ordering using ALL directed edges
  // ---------------------------------------------------------------------------

  const arrangeDagLayout = () => {
    // Pass 1: measure and tidy to get accurate sizes
    measureAndTidy();

    const idx = index();
    if (!idx) return;
    const doc = idx.doc();

    // Measure primitive stacks for header heights (same as measureAndTidy)
    const measured = new Map<string, number>();
    const nodeEls = document.querySelectorAll<HTMLElement>('[data-node-id]');
    for (const el of nodeEls) {
      const id = el.dataset.nodeId;
      if (!id || !doc.structure[id]) continue;
      const header = el.querySelector<HTMLElement>(':scope > * > [data-node-header]')
        ?? el.querySelector<HTMLElement>(':scope > * > [data-primitive-stack]');
      if (!header) continue;
      measured.set(id, header.offsetHeight);
    }

    // Build TidyNode[] for dagLayout (it runs tidyLayout internally for sizing)
    const tidyNodes = Object.entries(doc.structure).map(([id, n]) => ({
      id,
      w: n.geometry.w,
      h: measured.get(id) ?? n.geometry.h,
      parentId: n.parent,
      category: n.schemaName,
    }));
    tidyNodes.sort((a, b) => {
      const pa = a.parentId ?? '';
      const pb = b.parentId ?? '';
      if (pa !== pb) return pa < pb ? -1 : 1;
      const oa = doc.structure[a.id].order;
      const ob = doc.structure[b.id].order;
      return oa < ob ? -1 : oa > ob ? 1 : 0;
    });

    // Collect all edges whose schema has directed: true
    const directedEdges = Object.values(doc.edges)
      .filter((e) => {
        if (!e.schemaName) return false;
        const schema = doc.schemas[e.schemaName];
        return schema?.kind === 'edge' && schema.directed === true;
      })
      .map((e) => ({ source: e.fromId, target: e.toId }));

    if (directedEdges.length === 0) {
      console.log('[dag] no directed edges in this canvas — tidy pass only');
      return;
    }

    console.log(`[dag] laying out ${tidyNodes.length} nodes with ${directedEdges.length} directed edges`);

    const result = dagLayout(tidyNodes, directedEdges);

    for (const [id, pos] of result) {
      const node = idx.getNode(id);
      if (!node) continue;
      // For nodes with children, keep the dagLayout-computed size too
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
    // Use measured DOM dimensions when geometry.h is 0 (auto-sized nodes)
    const measured = nodeMeasureCache.get(id);
    const w = node.geometry.w > 0 ? node.geometry.w : (measured?.w ?? node.geometry.w);
    const h = node.geometry.h > 0 ? node.geometry.h : (measured?.h ?? node.geometry.h);
    return { x: pos.x, y: pos.y, w, h };
  };

  /** Edges where one endpoint is an ancestor of the other — rendered inline, not as lines. */
  const ancestorEdgeMap = () => {
    const idx = index();
    if (!idx) return new Map<string, Array<{ label: string; targetName: string; direction: 'up' | 'down' }>>();
    const map = new Map<string, Array<{ label: string; targetName: string; direction: 'up' | 'down' }>>();
    for (const edge of Object.values(idx.doc().edges)) {
      const fromIsAncestor = isAncestorOf(edge.fromId, edge.toId, idx);
      const toIsAncestor = isAncestorOf(edge.toId, edge.fromId, idx);
      if (!fromIsAncestor && !toIsAncestor) continue;
      // Attach to the deeper node (the descendant)
      const descendantId = fromIsAncestor ? edge.toId : edge.fromId;
      const ancestorId = fromIsAncestor ? edge.fromId : edge.toId;
      const ancestorContent = idx.getContent(ancestorId);
      const ancestorName = String(ancestorContent?.title ?? ancestorContent?.label ?? ancestorId.slice(0, 8));
      const direction = fromIsAncestor ? 'down' : 'up';
      if (!map.has(descendantId)) map.set(descendantId, []);
      map.get(descendantId)!.push({
        label: edge.label ?? '',
        targetName: ancestorName,
        direction,
      });
    }
    return map;
  };

  // -------------------------------------------------------------------------
  // Edge routing — declarative: writes routing.exitSide/enterSide to edges
  // -------------------------------------------------------------------------

  /** Compute routing sides for all directed edges and write to document. */
  const applyEdgeRouting = () => {
    const idx = index();
    if (!idx) return;
    const doc = idx.doc();
    let updated = 0;

    for (const edge of Object.values(doc.edges)) {
      // Skip ancestor edges (rendered inline, not as lines)
      if (isAncestorOf(edge.fromId, edge.toId, idx) || isAncestorOf(edge.toId, edge.fromId, idx)) continue;

      const fromNode = idx.getNode(edge.fromId);
      const toNode = idx.getNode(edge.toId);
      if (!fromNode || !toNode) continue;

      const fromPos = getAbsolutePos(edge.fromId, idx);
      const toPos = getAbsolutePos(edge.toId, idx);
      const fromCx = fromPos.x + fromNode.geometry.w / 2;
      const fromCy = fromPos.y + fromNode.geometry.h / 2;
      const toCx = toPos.x + toNode.geometry.w / 2;
      const toCy = toPos.y + toNode.geometry.h / 2;

      const dx = toCx - fromCx;
      const dy = toCy - fromCy;

      // Pick exit/enter sides based on relative position
      let exitSide: 'top' | 'bottom' | 'left' | 'right';
      let enterSide: 'top' | 'bottom' | 'left' | 'right';

      if (Math.abs(dy) >= Math.abs(dx)) {
        // Primarily vertical
        exitSide = dy > 0 ? 'bottom' : 'top';
        enterSide = dy > 0 ? 'top' : 'bottom';
      } else {
        // Primarily horizontal
        exitSide = dx > 0 ? 'right' : 'left';
        enterSide = dx > 0 ? 'left' : 'right';
      }

      // Write routing to document
      postAction('edge/setRouting', {
        path: props.documentPath,
        id: edge.id,
        routing: { exitSide, enterSide },
      }).catch(() => loadDoc());

      // Update local index immediately for responsiveness
      idx.setEdgeRouting(edge.id, { exitSide, enterSide });
      updated++;
    }
    console.log(`[routing] applied declarative routing to ${updated} edges`);
  };

  /** Remove routing from all edges, reverting to straight lines. */
  const clearEdgeRouting = () => {
    const idx = index();
    if (!idx) return;
    const doc = idx.doc();
    for (const edge of Object.values(doc.edges)) {
      if (edge.routing) {
        postAction('edge/clearRouting', {
          path: props.documentPath,
          id: edge.id,
        }).catch(() => loadDoc());
        idx.setEdgeRouting(edge.id, undefined);
      }
    }
    console.log('[routing] cleared all edge routing');
  };

  const renderEdges = () => {
    const idx = index();
    if (!idx) return null;
    const edges = Object.values(idx.doc().edges).filter((edge) => {
      return !isAncestorOf(edge.fromId, edge.toId, idx) && !isAncestorOf(edge.toId, edge.fromId, idx);
    });
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
    { label: 'Tree layout', action: () => arrangeTreeLayout() },
    { label: 'Force layout', action: () => arrangeForceLayout() },
    { label: 'Composite layout', action: () => arrangeCompositeLayout() },
    { label: 'DAG layout (arrows down)', action: () => arrangeDagLayout() },
    { label: '', action: () => {}, separator: true },
    { label: 'Route edges (orthogonal)', action: () => applyEdgeRouting() },
    { label: 'Clear edge routing', action: () => clearEdgeRouting() },
  ];

  // Theme dropdown
  const [themeMenuOpen, setThemeMenuOpen] = createSignal(false);
  const [aboutOpen, setAboutOpen] = createSignal(false);
  let themeMenuRef: HTMLDivElement | undefined;
  onMount(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (themeMenuRef && !themeMenuRef.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDocMouseDown);
    onCleanup(() => window.removeEventListener('mousedown', onDocMouseDown));
  });

  return (
    <div class="flex h-screen flex-col" style={{ background: 'var(--bg-canvas)' }}>
      <div class="relative flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 shrink-0">
        <button
          onClick={props.onBack}
          class="rounded-md border border-[var(--border-default)] px-3 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]"
        >
          ← Back
        </button>
        <span class="text-sm text-[var(--text-secondary)]">{props.documentPath}</span>
        <div class="flex-1" />
        <span class="absolute left-1/2 -translate-x-1/2 text-xl font-semibold tracking-wide text-[var(--text-primary)]">{APP_NAME}</span>
        <div class="flex-1" />
        <div ref={themeMenuRef} class="relative">
          <button
            onClick={() => setThemeMenuOpen((o) => !o)}
            class="rounded-md border border-[var(--border-default)] px-3 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]"
            aria-haspopup="menu"
            aria-expanded={themeMenuOpen()}
          >
            {THEMES.find((t) => t.id === theme())?.icon}
          </button>
          <Show when={themeMenuOpen()}>
            <div
              class="absolute right-0 top-full mt-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-overlay)] py-1 text-sm z-50"
              style={{ "box-shadow": "var(--shadow-lg)", "min-width": "120px" }}
              role="menu"
            >
              <For each={THEMES}>
                {(t) => (
                  <button
                    role="menuitemradio"
                    aria-checked={theme() === t.id}
                    class={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      theme() === t.id
                        ? 'bg-[var(--bg-surface-alt)] text-[var(--text-primary)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]'
                    }`}
                    onClick={() => {
                      setTheme(t.id);
                      setThemeMenuOpen(false);
                    }}
                  >
                    <span class="w-4 text-center">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
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
          {(idx) => {
            onMount(() => {
              mutationObserver.observe(canvasWrapperEl, { childList: true, subtree: true });
              for (const el of canvasWrapperEl.querySelectorAll<HTMLElement>('[data-node-id]')) {
                resizeObserver.observe(el);
              }
            });
            return <>
              <div ref={canvasWrapperEl} class="w-full h-full">
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
                  ancestorEdges={ancestorEdgeMap}
                />
              </Canvas>
              </div>
              <CanvasToolbar
                onZoomIn={() => canvasRef?.zoomIn()}
                onZoomOut={() => canvasRef?.zoomOut()}
                onFitView={() => canvasRef?.fitView(getNodeRects())}
                onTreeLayout={arrangeTreeLayout}
                onForceLayout={arrangeForceLayout}
                onTidyLayout={() => measureAndTidy()}
                onRouteEdges={applyEdgeRouting}
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
          }}
        </Show>
        <button
          onClick={() => setAboutOpen(true)}
          class="absolute bottom-0 left-0 px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] border-t border-r border-[var(--border-subtle)] z-10 cursor-pointer"
        >
          {APP_NAME} {APP_VERSION}
        </button>
      </div>
      <Show when={aboutOpen()}>
        <AboutModal onClose={() => setAboutOpen(false)} />
      </Show>
    </div>
  );
}
