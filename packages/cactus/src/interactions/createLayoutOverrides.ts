import { createSignal } from 'solid-js';
import type { ChildLayoutPolicy } from '../layout-types.js';

export interface LayoutOverridesResult {
  layoutOverride: (id: string) => ChildLayoutPolicy | undefined;
  setLayoutOverride: (id: string, policy: ChildLayoutPolicy | undefined) => void;
}

/** Manages transient per-container layout policy overrides (session state, not persisted). */
export function createLayoutOverrides(): LayoutOverridesResult {
  const [overrides, setOverrides] = createSignal<Map<string, ChildLayoutPolicy>>(new Map());

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
  };

  return { layoutOverride, setLayoutOverride };
}
