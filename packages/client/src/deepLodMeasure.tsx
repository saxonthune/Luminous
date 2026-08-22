/**
 * Deep-LOD measurement utility.
 *
 * Renders each node at its finest available disclosure level in a hidden
 * off-screen container and records the resulting bounding rect. This gives
 * layout a stable, zoom-independent size for every node so positions never
 * jump as the user zooms through LOD thresholds.
 *
 * Results are memoised by a per-node content key (kind + props + render hash)
 * so repeated calls for an unchanged graph are cheap.
 */

import { render } from 'solid-js/web';
import type { JSX } from 'solid-js';
import type { Graph, View, NodeId, DisclosureLevel, RenderContext } from '@luminous/core';
import {
  evaluateView,
  getNodeKind,
  interpretRender,
  generateFallbackRender,
} from '@luminous/core';
import { CanvasContext } from '@luminous/cactus';
import type { CanvasContextValue } from '@luminous/cactus';

const DISCLOSURE_ORDER: DisclosureLevel[] = ['deep', 'open', 'card', 'peek'];

function resolveAtDeep<T>(record: Partial<Record<DisclosureLevel, T>>): T | undefined {
  for (const lvl of DISCLOSURE_ORDER) {
    const r = record[lvl];
    if (r !== undefined) return r;
  }
  return undefined;
}

function findDeepestLevel(record: Partial<Record<DisclosureLevel, unknown>>): DisclosureLevel {
  for (const lvl of DISCLOSURE_ORDER) {
    if (record[lvl] !== undefined) return lvl;
  }
  return 'peek';
}

function nodeContentKey(nodeId: string, graph: Graph): string {
  const node = graph.nodes.get(nodeId);
  if (!node) return nodeId;
  const kind = getNodeKind(node.kind);
  return JSON.stringify({
    kind: node.kind,
    props: node.props,
    renderHash: kind?.render != null ? JSON.stringify(kind.render) : null,
  });
}

// Module-level caches survive across re-renders; invalidated by content key change.
const sizeCache = new Map<string, { w: number; h: number }>();
const headerCache = new Map<string, number>();
const headerWidthCache = new Map<string, number>();

const DEFAULT_SIZE = { w: 120, h: 60 };

export function measureDeepLod(
  graph: Graph,
  view: View,
): {
  sizes: Map<NodeId, { w: number; h: number }>;
  headerHeights: Map<NodeId, number>;
  headerWidths: Map<NodeId, number>;
} {
  const sizes = new Map<NodeId, { w: number; h: number }>();
  const headerHeights = new Map<NodeId, number>();
  const headerWidths = new Map<NodeId, number>();

  if (typeof document === 'undefined') return { sizes, headerHeights, headerWidths };

  // Compute containment so hasChildren is accurate during measurement.
  const { containment } = evaluateView(graph, view);

  const host = document.createElement('div');
  host.style.cssText =
    'visibility:hidden;position:absolute;left:-9999px;top:0;pointer-events:none;';
  document.body.appendChild(host);

  try {
    for (const [nodeId, node] of graph.nodes) {
      const cKey = nodeContentKey(nodeId, graph);

      const cached = sizeCache.get(cKey);
      if (cached) {
        sizes.set(nodeId, cached);
        const cachedH = headerCache.get(cKey);
        if (cachedH !== undefined) headerHeights.set(nodeId, cachedH);
        const cachedW = headerWidthCache.get(cKey);
        if (cachedW !== undefined) headerWidths.set(nodeId, cachedW);
        continue;
      }

      const kind = getNodeKind(node.kind);
      const renderRecord = kind?.render;
      const renderNode = renderRecord ? resolveAtDeep(renderRecord) : undefined;
      const usedLevel: DisclosureLevel = renderRecord
        ? findDeepestLevel(renderRecord)
        : 'peek';

      const capturedHeaderHeights: number[] = [];

      const mockCtx: CanvasContextValue = {
        transform: () => ({ x: 0, y: 0, k: 1 }),
        screenToCanvas: (x, y) => ({ x, y }),
        startConnection: () => {},
        connectionDrag: () => null,
        selectedIds: () => [],
        clearSelection: () => {},
        isSelected: () => false,
        onNodePointerDown: () => {},
        setSelectedIds: () => {},
        ctrlHeld: () => false,
        registerNodeRect: () => {},
        unregisterNodeRect: () => {},
        getNodeRects: () => new Map(),
        registerHeaderHeight: (_id: string, h: number) => {
          capturedHeaderHeights.push(h);
        },
        unregisterHeaderHeight: () => {},
        getHeaderHeights: () => new Map(),
        fitView: () => {},
        layoutOverride: () => undefined,
        setLayoutOverride: () => {},
        layoutApply: () => null,
      };

      const renderCtx: RenderContext = {
        level: () => usedLevel,
        zoom: () => 1,
        view,
        graph,
        hasChildren: (id) => (containment.childrenOf.get(id)?.length ?? 0) > 0,
        inspect: () => {},
        sectionColorOf: () => undefined,
        currentNodeId: () => nodeId,
        // Do NOT set expanded: true here. Measurement must see the clamped (visible)
        // form so that node sizes stay bounded by what's actually rendered on canvas.
      };

      const content = node.props as Record<string, unknown>;
      const nodeEl = document.createElement('div');
      host.appendChild(nodeEl);

      let disposer: (() => void) | undefined;
      try {
        disposer = render(
          () => (
            <CanvasContext.Provider value={mockCtx}>
              {renderNode != null
                ? (interpretRender(renderNode, renderCtx, content) as JSX.Element)
                : (interpretRender(generateFallbackRender(kind, content), renderCtx, content) as JSX.Element)}
            </CanvasContext.Provider>
          ),
          nodeEl,
        );

        const rect = nodeEl.getBoundingClientRect();
        const sz =
          rect.width > 0 || rect.height > 0
            ? { w: rect.width, h: rect.height }
            : DEFAULT_SIZE;

        sizeCache.set(cKey, sz);
        sizes.set(nodeId, sz);

        if (capturedHeaderHeights.length > 0) {
          const h = capturedHeaderHeights[capturedHeaderHeights.length - 1]!;
          headerCache.set(cKey, h);
          headerHeights.set(nodeId, h);
        } else if ((containment.childrenOf.get(nodeId)?.length ?? 0) > 0) {
          // Container node whose render did NOT use NodeHeader. Treat its full
          // measured size as the header band so layout packs children below the
          // container's own visible content instead of overlapping it.
          headerCache.set(cKey, sz.h);
          headerHeights.set(nodeId, sz.h);
          headerWidthCache.set(cKey, sz.w);
          headerWidths.set(nodeId, sz.w);
        }
      } catch {
        // Measurement failed for this node — fall back to default size.
        sizes.set(nodeId, DEFAULT_SIZE);
      } finally {
        disposer?.();
        if (nodeEl.parentNode === host) host.removeChild(nodeEl);
      }
    }
  } finally {
    document.body.removeChild(host);
  }

  return { sizes, headerHeights, headerWidths };
}
