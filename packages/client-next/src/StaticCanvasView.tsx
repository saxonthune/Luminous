/**
 * StaticCanvasView — read-only canvas viewer for GitHub Pages.
 *
 * A fork of CanvasView.tsx with all server persistence removed:
 * - No postAction calls
 * - No WebSocket / file-watch
 * - No document picker / "Back" button
 * - No "New Note" button
 * - No delete handler
 * - No connection creation
 * - No edge label editing
 *
 * The document is passed in as a prop (already fetched by viewerMain.tsx).
 * Drag, resize, layout algorithms, and theme switching all work against
 * local CanvasIndex state only.
 */

import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
  For,
  type JSX,
} from 'solid-js';
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
import { type Document, type Geometry } from './api';
import { SchemaNode } from './SchemaNode';
import { createCanvasIndex, type CanvasIndex } from './canvasIndex';
import { FreeformEdge } from './FreeformEdge';
import { CanvasToolbar } from './CanvasToolbar';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { theme, setTheme, THEMES } from './theme';
import { type AncestorEdgeInfo } from './CanvasView';

export interface StaticCanvasViewProps {
  document: Document;
  /** The original `src` URL — shown in the header as a filename hint. */
  src: string;
}

// ---------------------------------------------------------------------------
// Helpers (verbatim from CanvasView)
// ---------------------------------------------------------------------------

function isAncestorOf(ancestorId: string, nodeId: string, index: CanvasIndex): boolean {
  let current = index.getNode(nodeId)?.parent ?? null;
  while (current) {
    if (current === ancestorId) return true;
    current = index.getNode(current)?.parent ?? null;
  }
  return false;
}

function getAbsolutePos(id: string, index: CanvasIndex): { x: number; y: number } {
  const n = index.getNode(id);
  if (!n) return { x: 0, y: 0 };
  if (!n.parent) return { x: n.geometry.x, y: n.geometry.y };
  const parentAbs = getAbsolutePos(n.parent, index);
  return { x: parentAbs.x + n.geometry.x, y: parentAbs.y + n.geometry.y };
}

// ---------------------------------------------------------------------------
// StaticCanvasContent — rendered inside <Canvas>
// ---------------------------------------------------------------------------

interface StaticCanvasContentProps {
  index: CanvasIndex;
  onClearSelectionReady: (fn: () => void) => void;
  onTidy: (rootId: string) => void;
  ancestorEdges: () => Map<string, AncestorEdgeInfo[]>;
}

function StaticCanvasContent(props: StaticCanvasContentProps): JSX.Element {
  const {
    transform,
    clearSelection,
    selectedIds,
    onNodePointerDown,
  } = useCanvasContext();

  props.onClearSelectionReady(clearSelection);

  const dragBaseMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  const resizeBaseMap = new Map<string, { w: number; h: number }>();

  // ---------------------------------------------------------------------------
  // Drag callbacks — updates local index geometry only (no postAction)
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
      dragBaseMap.delete(nodeId);
      // No server persistence in the viewer.
    },
  };

  const { onPointerDown: onDragPointerDown } = useNodeDrag({
    zoomScale: () => transform().k,
    handleSelector: '[data-drag-handle]',
    callbacks: dragCallbacks,
  });

  // ---------------------------------------------------------------------------
  // Resize callbacks — updates local index geometry only (no postAction)
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
      // No server persistence in the viewer.
    },
  };

  const { onResizePointerDown } = useNodeResize({
    zoomScale: () => transform().k,
    callbacks: resizeCallbacks,
  });

  // No-op delete: keep the interface compatible with SchemaNode (which expects onDelete)
  const handleDelete = (_id: string) => {
    // Read-only viewer — deletion is intentionally disabled.
  };

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
// StaticCanvasView — outer component
// ---------------------------------------------------------------------------

export function StaticCanvasView(props: StaticCanvasViewProps) {
  const index = createCanvasIndex(props.document);
  const [firstTidyDone, setFirstTidyDone] = createSignal(false);

  let clearSelectionFn: () => void = () => {};
  let canvasRef: CanvasRef | undefined;

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

  // ---------------------------------------------------------------------------
  // Layout helpers — same as CanvasView but no postAction calls
  // ---------------------------------------------------------------------------

  const measureAndTidy = (rootId?: string) => {
    const doc = index.doc();

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

    const result = tidyLayout(
      tidyNodes,
      rootId
        ? { rootId }
        : {
            categoryOrder: ['component', 'hook', 'signal', 'store', 'memo', 'effect', 'datasource', 'container'],
            rowGap: 120,
          },
    );

    for (const [id, rect] of result) {
      const isSubtreeRoot = rootId === id;
      const node = index.getNode(id);
      if (!node) continue;
      const newGeo: Geometry = isSubtreeRoot
        ? { ...node.geometry, w: rect.w, h: rect.h }
        : { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      index.setGeometry(id, newGeo);
      // No postAction — viewer only
    }
  };

  // First-load auto-tidy
  createEffect(() => {
    if (firstTidyDone()) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        measureAndTidy();
        setFirstTidyDone(true);
        // fitView after initial tidy
        requestAnimationFrame(() => {
          canvasRef?.fitView(getNodeRects());
        });
      })
    );
  });

  const arrangeForceLayout = () => {
    const layoutNodes = index.getChildren(null).map((id) => {
      const n = index.getNode(id)!;
      return { id, x: n.geometry.x, y: n.geometry.y, width: n.geometry.w, height: n.geometry.h };
    });
    const layoutEdges = Object.values(index.doc().edges).map((e) => ({
      source: e.fromId,
      target: e.toId,
    }));
    const result = forceDirectedLayout(layoutNodes, layoutEdges);
    for (const [id, pos] of result) {
      const node = index.getNode(id);
      if (!node) continue;
      index.setGeometry(id, { ...node.geometry, x: pos.x, y: pos.y });
    }
  };

  const arrangeTreeLayout = () => {
    const layoutNodes = index.getChildren(null).map((id) => {
      const n = index.getNode(id)!;
      return { id, x: n.geometry.x, y: n.geometry.y, width: n.geometry.w, height: n.geometry.h };
    });
    const layoutEdges = Object.values(index.doc().edges).map((e) => ({
      source: e.fromId,
      target: e.toId,
    }));
    const result = treeLayout(layoutNodes, layoutEdges);
    for (const [id, pos] of result) {
      const node = index.getNode(id);
      if (!node) continue;
      index.setGeometry(id, { ...node.geometry, x: pos.x, y: pos.y });
    }
  };

  const arrangeCompositeLayout = () => {
    measureAndTidy();

    const doc = index.doc();
    const layoutNodes = index.getChildren(null).map((id) => {
      const n = index.getNode(id)!;
      return { id, x: n.geometry.x, y: n.geometry.y, width: n.geometry.w, height: n.geometry.h };
    });
    const treeEdges = Object.values(doc.edges)
      .filter((e) => {
        if (!e.schemaName) return false;
        const schema = doc.schemas[e.schemaName];
        return schema?.kind === 'edge' && schema.layoutRole === 'tree';
      })
      .map((e) => ({ source: e.fromId, target: e.toId }));

    if (treeEdges.length === 0) return;

    const result = treeLayout(layoutNodes, treeEdges);
    for (const [id, pos] of result) {
      const node = index.getNode(id);
      if (!node) continue;
      index.setGeometry(id, { ...node.geometry, x: pos.x, y: pos.y });
    }
  };

  const arrangeDagLayout = () => {
    measureAndTidy();

    const doc = index.doc();

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

    const directedEdges = Object.values(doc.edges)
      .filter((e) => {
        if (!e.schemaName) return false;
        const schema = doc.schemas[e.schemaName];
        return schema?.kind === 'edge' && schema.directed === true;
      })
      .map((e) => ({ source: e.fromId, target: e.toId }));

    if (directedEdges.length === 0) return;

    const result = dagLayout(tidyNodes, directedEdges);
    for (const [id, pos] of result) {
      const node = index.getNode(id);
      if (!node) continue;
      index.setGeometry(id, { ...node.geometry, x: pos.x, y: pos.y });
    }
  };

  // ---------------------------------------------------------------------------
  // Derived helpers
  // ---------------------------------------------------------------------------

  const getNodeRects = () =>
    index.getChildren(null).map((id) => {
      const n = index.getNode(id)!;
      return { id, x: n.geometry.x, y: n.geometry.y, width: n.geometry.w, height: n.geometry.h };
    });

  const getAbsoluteRect = (id: string) => {
    const node = index.getNode(id);
    if (!node) return undefined;
    const pos = getAbsolutePos(id, index);
    const measured = nodeMeasureCache.get(id);
    const w = node.geometry.w > 0 ? node.geometry.w : (measured?.w ?? node.geometry.w);
    const h = node.geometry.h > 0 ? node.geometry.h : (measured?.h ?? node.geometry.h);
    return { x: pos.x, y: pos.y, w, h };
  };

  const ancestorEdgeMap = () => {
    const map = new Map<string, Array<{ label: string; targetName: string; direction: 'up' | 'down' }>>();
    for (const edge of Object.values(index.doc().edges)) {
      const fromIsAncestor = isAncestorOf(edge.fromId, edge.toId, index);
      const toIsAncestor = isAncestorOf(edge.toId, edge.fromId, index);
      if (!fromIsAncestor && !toIsAncestor) continue;
      const descendantId = fromIsAncestor ? edge.toId : edge.fromId;
      const ancestorId = fromIsAncestor ? edge.fromId : edge.toId;
      const ancestorContent = index.getContent(ancestorId);
      const ancestorName = String(ancestorContent?.title ?? ancestorContent?.label ?? ancestorId.slice(0, 8));
      const direction = fromIsAncestor ? 'down' : 'up';
      if (!map.has(descendantId)) map.set(descendantId, []);
      map.get(descendantId)!.push({ label: edge.label ?? '', targetName: ancestorName, direction });
    }
    return map;
  };

  const renderEdges = () => {
    const edges = Object.values(index.doc().edges).filter(
      (edge) => !isAncestorOf(edge.fromId, edge.toId, index) && !isAncestorOf(edge.toId, edge.fromId, index),
    );
    return (
      <For each={edges}>
        {(edge) => (
          <FreeformEdge
            edge={edge}
            getAbsoluteRect={getAbsoluteRect}
            // No onUpdateLabel — viewer is read-only
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
  ];

  // Theme dropdown
  const [themeMenuOpen, setThemeMenuOpen] = createSignal(false);
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

  // Derive a short display name from the src URL
  const displayName = () => {
    try {
      const url = new URL(props.src);
      return url.pathname.split('/').pop() ?? props.src;
    } catch {
      return props.src;
    }
  };

  return (
    <div class="flex h-screen flex-col" style={{ background: 'var(--bg-canvas)' }}>
      {/* Header bar — no Back button, no New Note */}
      <div class="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 shrink-0">
        <span class="text-sm text-[var(--text-secondary)] truncate">{displayName()}</span>
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
      </div>

      <div class="flex-1 overflow-hidden relative">
        <div
          ref={(el) => {
            canvasWrapperEl = el;
            onMount(() => {
              mutationObserver.observe(el, { childList: true, subtree: true });
              for (const node of el.querySelectorAll<HTMLElement>('[data-node-id]')) {
                resizeObserver.observe(node);
              }
            });
          }}
          class="w-full h-full"
        >
          <Canvas
            ref={(ref) => { canvasRef = ref; }}
            class="w-full h-full"
            renderEdges={renderEdges}
            boxSelect={{ getNodeRects }}
            onBackgroundPointerDown={() => clearSelectionFn()}
            onBackgroundContextMenu={(e) => setBgContextMenu({ x: e.clientX, y: e.clientY })}
          >
            <StaticCanvasContent
              index={index}
              onClearSelectionReady={(fn) => (clearSelectionFn = fn)}
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
        />
        <Show when={bgContextMenu()}>
          {(menu) => (
            <ContextMenu
              x={menu().x}
              y={menu().y}
              header={displayName()}
              items={bgMenuItems()}
              onClose={() => setBgContextMenu(null)}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
