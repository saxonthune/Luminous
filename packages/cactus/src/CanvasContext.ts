import { createContext, useContext } from 'solid-js';
import type { Transform } from './useViewport.js';
import type { ConnectionDragState } from './useConnectionDrag.js';

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
}

export const CanvasContext = createContext<CanvasContextValue>();

export function useCanvasContext(): CanvasContextValue {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error('useCanvasContext must be used within a Canvas component');
  }
  return context;
}
