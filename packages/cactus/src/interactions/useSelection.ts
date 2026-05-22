import { createSignal } from 'solid-js';

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
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      if (selectedIds().includes(nodeId)) {
        setSelectedIds(selectedIds().filter((id) => id !== nodeId));
      } else {
        setSelectedIds([...selectedIds(), nodeId]);
      }
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
