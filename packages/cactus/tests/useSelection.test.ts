import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { useSelection, type UseSelectionResult } from '../src/interactions/useSelection';

// jsdom has no PointerEvent; the hook only reads button/shiftKey/ctrlKey/metaKey.
const pointerDown = (init: MouseEventInit) =>
  new MouseEvent('pointerdown', init) as unknown as PointerEvent;

function withSelection(fn: (sel: UseSelectionResult) => void) {
  createRoot((dispose) => {
    fn(useSelection({}));
    dispose();
  });
}

describe('useSelection buttons', () => {
  // Right-click opens a context menu that acts on the whole selection —
  // collapsing to the clicked node would silently defeat bulk actions.
  it('right-click on a member keeps the multi-selection', () => {
    withSelection((sel) => {
      sel.setSelectedIds(['a', 'b', 'c']);
      sel.onNodePointerDown('b', pointerDown({ button: 2 }));
      expect(sel.selectedIds()).toEqual(['a', 'b', 'c']);
    });
  });

  it('right-click on a non-member selects just that node', () => {
    withSelection((sel) => {
      sel.setSelectedIds(['a', 'b']);
      sel.onNodePointerDown('z', pointerDown({ button: 2 }));
      expect(sel.selectedIds()).toEqual(['z']);
    });
  });

  it('middle-click leaves the selection alone', () => {
    withSelection((sel) => {
      sel.setSelectedIds(['a', 'b']);
      sel.onNodePointerDown('z', pointerDown({ button: 1 }));
      expect(sel.selectedIds()).toEqual(['a', 'b']);
    });
  });

  it('plain left-click replaces, modifier left-click toggles', () => {
    withSelection((sel) => {
      sel.setSelectedIds(['a', 'b']);
      sel.onNodePointerDown('z', pointerDown({ button: 0 }));
      expect(sel.selectedIds()).toEqual(['z']);
      sel.onNodePointerDown('a', pointerDown({ button: 0, shiftKey: true }));
      expect(sel.selectedIds()).toEqual(['z', 'a']);
      sel.onNodePointerDown('z', pointerDown({ button: 0, ctrlKey: true }));
      expect(sel.selectedIds()).toEqual(['a']);
    });
  });
});
