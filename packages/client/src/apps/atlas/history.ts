import { createSignal } from 'solid-js';
import type { AtlasAction } from '@luminous/core/atlas';

export interface HistoryEntry {
  label: string;
  do: AtlasAction[];
  undo: AtlasAction[];
}

export interface AtlasHistory {
  record: (entry: HistoryEntry) => void;
  undo: () => AtlasAction[] | null;
  redo: () => AtlasAction[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

export function useAtlasHistory(): AtlasHistory {
  const [past, setPast] = createSignal<HistoryEntry[]>([]);
  const [future, setFuture] = createSignal<HistoryEntry[]>([]);

  function record(entry: HistoryEntry): void {
    setPast((p) => [...p, entry]);
    setFuture([]);
  }

  function undo(): AtlasAction[] | null {
    const p = past();
    if (p.length === 0) return null;
    const entry = p[p.length - 1]!;
    setPast(p.slice(0, -1));
    setFuture((f) => [...f, entry]);
    return entry.undo;
  }

  function redo(): AtlasAction[] | null {
    const f = future();
    if (f.length === 0) return null;
    const entry = f[f.length - 1]!;
    setFuture(f.slice(0, -1));
    setPast((p) => [...p, entry]);
    return entry.do;
  }

  function canUndo(): boolean {
    return past().length > 0;
  }

  function canRedo(): boolean {
    return future().length > 0;
  }

  function clear(): void {
    setPast([]);
    setFuture([]);
  }

  return { record, undo, redo, canUndo, canRedo, clear };
}
