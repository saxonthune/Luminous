import { createSignal, onMount, onCleanup } from 'solid-js';
import type { Transform } from './useViewport.js';

export interface NodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseBoxSelectOptions {
  /** Current viewport transform — accessor for reactive updates */
  transform: () => Transform;
  /** Container element accessor */
  containerEl: () => HTMLElement | undefined;
  /** Returns current node rects in canvas coordinates for hit-testing */
  getNodeRects: () => NodeRect[];
  /** What starts a marquee: 'shift-drag' (default) needs Shift held; 'drag'
      marquees on plain left-drag over the background (Excalidraw-style — the
      host should disable left-drag panning) and clears the selection on a
      plain background click. */
  trigger?: 'shift-drag' | 'drag';
  /** Called when selection changes */
  onSelectionChange?: (selectedIds: string[]) => void;
  /** When provided, report hits to this callback instead of managing internal selectedIds state */
  onBoxSelectHits?: (hitIds: string[]) => void;
}

export interface UseBoxSelectResult {
  /** Currently selected node IDs — signal accessor */
  selectedIds: () => string[];
  /** Clear selection programmatically */
  clearSelection: () => void;
  /** The selection rectangle in container-relative coordinates, or null if not dragging — signal accessor */
  selectionRect: () => { x: number; y: number; width: number; height: number } | null;
}

export function useBoxSelect(options: UseBoxSelectOptions): UseBoxSelectResult {
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [selectionRect, setSelectionRect] = createSignal<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const clearSelection = () => {
    setSelectedIds([]);
    options.onSelectionChange?.([]);
  };

  onMount(() => {
    const container = options.containerEl();
    if (!container) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const trigger = options.trigger ?? 'shift-drag';
      if (trigger === 'shift-drag' && !e.shiftKey) return;

      const target = e.target as HTMLElement;
      if (target.closest?.('[data-no-pan]')) return;
      if (target.closest?.('[data-container-id]')) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        moved = true;
        const currentX = moveEvent.clientX;
        const currentY = moveEvent.clientY;

        // Container-relative, so the rendered rect lines up when the canvas
        // doesn't start at the viewport origin (e.g. below an app header).
        const containerRect = container.getBoundingClientRect();
        const rect = {
          x: Math.min(startX, currentX) - containerRect.left,
          y: Math.min(startY, currentY) - containerRect.top,
          width: Math.abs(currentX - startX),
          height: Math.abs(currentY - startY),
        };
        setSelectionRect(rect);

        const t = options.transform();
        const canvasRect = {
          x: (rect.x - t.x) / t.k,
          y: (rect.y - t.y) / t.k,
          width: rect.width / t.k,
          height: rect.height / t.k,
        };

        const nodeRects = options.getNodeRects();
        const hits = nodeRects
          .filter((nr) => rectsIntersect(canvasRect, nr))
          .map((nr) => nr.id);

        if (options.onBoxSelectHits) {
          options.onBoxSelectHits(hits);
        } else {
          setSelectedIds(hits);
          options.onSelectionChange?.(hits);
        }
      };

      const handlePointerUp = () => {
        // A plain background click (no drag) clears the selection in 'drag' mode.
        if (!moved && trigger === 'drag') {
          if (options.onBoxSelectHits) options.onBoxSelectHits([]);
          else clearSelection();
        }
        setSelectionRect(null);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    };

    container.addEventListener('pointerdown', handlePointerDown);
    onCleanup(() => container.removeEventListener('pointerdown', handlePointerDown));
  });

  return { selectedIds, clearSelection, selectionRect };
}

export function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
