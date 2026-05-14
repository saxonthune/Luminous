import { createContext, useContext } from 'solid-js';

export type InspectTarget = string; // node or edge id

export interface InspectorContextValue {
  /** Current panel target — top of the back-stack, or null. */
  target: () => InspectTarget | null;
  /** Push a new target onto the back-stack. */
  open: (id: InspectTarget) => void;
  /** Pop one entry. */
  back: () => void;
  /** Empty the back-stack and close the panel. */
  close: () => void;
  /** Full back-stack (oldest → newest). */
  stack: () => readonly InspectTarget[];
}

export const InspectorContext = createContext<InspectorContextValue>();

export function useInspector(): InspectorContextValue {
  const ctx = useContext(InspectorContext);
  if (!ctx) {
    throw new Error('useInspector must be used within InspectorContext.Provider');
  }
  return ctx;
}
