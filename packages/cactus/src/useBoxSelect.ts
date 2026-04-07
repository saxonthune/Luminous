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
  /** The selection rectangle in screen coordinates, or null if not dragging — signal accessor */
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
      if (!e.shiftKey) return;

      const target = e.target as HTMLElement;
      if (target.closest?.('[data-no-pan]')) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const currentX = moveEvent.clientX;
        const currentY = moveEvent.clientY;

        const rect = {
          x: Math.min(startX, currentX),
          y: Math.min(startY, currentY),
          width: Math.abs(currentX - startX),
          height: Math.abs(currentY - startY),
        };
        setSelectionRect(rect);

        const t = options.transform();
        const containerRect = container.getBoundingClientRect();
        const canvasRect = {
          x: (rect.x - containerRect.left - t.x) / t.k,
          y: (rect.y - containerRect.top - t.y) / t.k,
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

function rectsIntersect(
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
