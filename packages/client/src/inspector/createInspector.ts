import { createSignal, createEffect } from 'solid-js';
import { useCanvasContext } from '@luminous/cactus';
import type { InspectorContextValue } from './InspectorContext';

/**
 * Factory for inspector state. Must be called within a Canvas component tree
 * (requires CanvasContext). Syncs with canvas selection automatically.
 */
export function createInspector(): InspectorContextValue {
  const canvas = useCanvasContext();
  const [stack, setStack] = createSignal<string[]>([]);
  const [debugMode, setDebugMode] = createSignal(false);

  const target = () => {
    const s = stack();
    return s.length > 0 ? s[s.length - 1] : null;
  };

  const open = (id: string, opts?: { debug?: boolean }) => {
    setDebugMode(opts?.debug ?? false);
    setStack((prev) => [...prev, id]);
  };
  const back = () => {
    setDebugMode(false);
    setStack((prev) => prev.slice(0, -1));
  };
  const close = () => {
    setDebugMode(false);
    setStack([]);
  };

  createEffect(() => {
    const ids = canvas.selectedIds();
    if (ids.length === 1) {
      const id = ids[0];
      if (id !== target()) {
        setDebugMode(false);
        setStack([id]);
      }
    } else if (ids.length === 0) {
      close();
    }
    // multiple ids selected: leave inspector as-is
  });

  return { target, open, back, close, stack, debugMode };
}
