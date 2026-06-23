import { createSignal } from 'solid-js';
import type { ChildLayoutPolicy } from '../layout-types.js';

export interface LayoutOverridesResult {
  layoutOverride: (id: string) => ChildLayoutPolicy | undefined;
  setLayoutOverride: (id: string, policy: ChildLayoutPolicy | undefined) => void;
  /**
   * Fires on every setLayoutOverride call, carrying the target container id and
   * a monotonic seq. Distinct from the override value: re-applying the current
   * layout still ticks this, so consumers can treat clicking the active layout
   * as an explicit "apply" action (e.g. to discard manual drags).
   */
  layoutApply: () => { id: string; seq: number } | null;
}

/** Manages transient per-container layout policy overrides (session state, not persisted). */
export function createLayoutOverrides(): LayoutOverridesResult {
  const [overrides, setOverrides] = createSignal<Map<string, ChildLayoutPolicy>>(new Map());
  const [apply, setApply] = createSignal<{ id: string; seq: number } | null>(null);
  let seq = 0;

  const layoutOverride = (id: string): ChildLayoutPolicy | undefined => overrides().get(id);

  const setLayoutOverride = (id: string, policy: ChildLayoutPolicy | undefined) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (policy === undefined) {
        next.delete(id);
      } else {
        next.set(id, policy);
      }
      return next;
    });
    seq += 1;
    setApply({ id, seq });
  };

  return { layoutOverride, setLayoutOverride, layoutApply: apply };
}
