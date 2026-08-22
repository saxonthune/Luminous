import { createSignal } from 'solid-js';
import { DRAG_THRESHOLD } from './useGesture.js';

export interface UseSelectionOptions {
  onSelectionChange?: (selectedIds: string[]) => void;
}

export interface UseSelectionResult {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  isSelected: (id: string) => boolean;
  onNodePointerDown: (nodeId: string, event: PointerEvent) => void;
  clearSelection: () => void;
  mergeBoxSelection: (ids: string[]) => void;
}

export function useSelection(options: UseSelectionOptions): UseSelectionResult {
  const [selectedIds, setSelectedIdsInternal] = createSignal<string[]>([]);

  const setSelectedIds = (ids: string[]) => {
    setSelectedIdsInternal(ids);
    options.onSelectionChange?.(ids);
  };

  const clearSelection = () => setSelectedIds([]);

  const isSelected = (id: string) => selectedIds().includes(id);

  const mergeBoxSelection = (ids: string[]) => setSelectedIds(ids);

  const onNodePointerDown = (nodeId: string, event: PointerEvent) => {
    // Right-click: the context menu acts on the whole selection, so keep a
    // selection the node is already part of; otherwise select just the node.
    if (event.button === 2) {
      if (!selectedIds().includes(nodeId)) setSelectedIds([nodeId]);
      return;
    }
    if (event.button !== 0) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      if (selectedIds().includes(nodeId)) {
        setSelectedIds(selectedIds().filter((id) => id !== nodeId));
      } else {
        setSelectedIds([...selectedIds(), nodeId]);
      }
    } else if (selectedIds().includes(nodeId)) {
      // A plain press on a selected node keeps the selection, so a drag
      // moves the whole selection; it collapses to just this node only
      // when the press ends without becoming a drag.
      const startX = event.clientX;
      const startY = event.clientY;
      const teardown = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      const onMove = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) >= DRAG_THRESHOLD) teardown();
      };
      const onUp = () => {
        setSelectedIds([nodeId]);
        teardown();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    } else {
      setSelectedIds([nodeId]);
    }
  };

  return {
    selectedIds,
    setSelectedIds,
    isSelected,
    onNodePointerDown,
    clearSelection,
    mergeBoxSelection,
  };
}
