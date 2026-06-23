import { createContext, useContext } from 'solid-js';
import type { Transform } from './interactions/useViewport.js';
import type { ConnectionDragState } from './interactions/useConnectionDrag.js';
import type { ChildLayoutPolicy } from './layout-types.js';

export interface NodeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasContextValue {
  /** Current viewport transform { x, y, k } — signal accessor */
  transform: () => Transform;
  /** Convert screen coordinates to canvas coordinates */
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  /** Start a connection drag from a source handle */
  startConnection: (nodeId: string, handleId: string | null, clientX: number, clientY: number) => void;
  /** Current connection drag state, or null — signal accessor */
  connectionDrag: () => ConnectionDragState | null;
  /** Currently selected node IDs — signal accessor */
  selectedIds: () => string[];
  /** Clear all selection */
  clearSelection: () => void;
  /** Check if a node is selected */
  isSelected: (id: string) => boolean;
  /** Handle node pointer-down with click/shift/ctrl semantics */
  onNodePointerDown: (nodeId: string, event: PointerEvent) => void;
  /** Replace selection with given IDs */
  setSelectedIds: (ids: string[]) => void;
  /** Whether Ctrl/Meta key is currently held — signal accessor */
  ctrlHeld: () => boolean;
  /** Register a node's canvas-space bounding rect (called by NodeContainer). */
  registerNodeRect: (id: string, rect: NodeRect) => void;
  /** Unregister a node's rect on cleanup (called by NodeContainer). */
  unregisterNodeRect: (id: string) => void;
  /** Reactive accessor — returns the current node rect map. Tracks rect version. */
  getNodeRects: () => ReadonlyMap<string, NodeRect>;
  /**
   * @deprecated Header heights are now computed by measureDeepLod (deepLodMeasure.tsx)
   * and no longer driven by live-DOM measurement in NodeHeader. These stubs remain for
   * backwards compat with any external consumers; they will be removed in a future cleanup.
   */
  registerHeaderHeight: (nodeId: string, height: number) => void;
  /** @deprecated See registerHeaderHeight. */
  unregisterHeaderHeight: (nodeId: string) => void;
  /** @deprecated See registerHeaderHeight. */
  getHeaderHeights: () => ReadonlyMap<string, number>;
  /**
   * Fit the viewport to the given canvas-space rects. padding is in screen pixels.
   * animate defaults to true; pass false to jump instantly.
   */
  fitView: (
    rects: Array<{ x: number; y: number; width: number; height: number }>,
    padding?: number,
    animate?: boolean
  ) => void;
  /** Returns the transient layout override for a container node, or undefined if none. */
  layoutOverride: (id: string) => ChildLayoutPolicy | undefined;
  /** Set or clear a transient layout override for a container node. Pass undefined to clear. */
  setLayoutOverride: (id: string, policy: ChildLayoutPolicy | undefined) => void;
  /** Ticks on every setLayoutOverride call (even re-applying the current layout). */
  layoutApply: () => { id: string; seq: number } | null;
}

export const CanvasContext = createContext<CanvasContextValue>();

export function useCanvasContext(): CanvasContextValue {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error('useCanvasContext must be used within a Canvas component');
  }
  return context;
}
