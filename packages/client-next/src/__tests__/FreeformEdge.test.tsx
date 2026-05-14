import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { CanvasContext, type CanvasContextValue } from '@luminous/cactus';
import { FreeformEdge } from '../FreeformEdge';
import type { Edge } from '../api';

beforeAll(() => {
  if (typeof PointerEvent === 'undefined') {
    // jsdom may not implement PointerEvent — shim with MouseEvent
    // @ts-expect-error
    globalThis.PointerEvent = class PointerEvent extends MouseEvent {};
  }
});

const EDGE: Edge = {
  id: 'edge-001',
  fromId: 'node-a',
  toId: 'node-b',
  label: null,
};

function makeContext(): CanvasContextValue & { selectedIds: () => string[] } {
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  return {
    transform: () => ({ x: 0, y: 0, k: 1 }),
    screenToCanvas: (x, y) => ({ x, y }),
    startConnection: () => {},
    connectionDrag: () => null,
    selectedIds,
    clearSelection: () => setSelectedIds([]),
    isSelected: (id) => selectedIds().includes(id),
    onNodePointerDown: () => {},
    setSelectedIds,
    ctrlHeld: () => false,
  };
}

const getAbsoluteRect = (id: string) =>
  id === 'node-a'
    ? { x: 0, y: 0, w: 100, h: 50 }
    : { x: 200, y: 200, w: 100, h: 50 };

let container: SVGSVGElement;
let dispose: () => void;

afterEach(() => {
  dispose?.();
  container?.parentNode?.removeChild(container);
});

describe('FreeformEdge selection', () => {
  it('hit-region path has data-edge-id attribute', () => {
    const ctx = makeContext();
    container = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(container);

    dispose = render(
      () => (
        <CanvasContext.Provider value={ctx}>
          <FreeformEdge edge={EDGE} getAbsoluteRect={getAbsoluteRect} />
        </CanvasContext.Provider>
      ),
      container,
    );

    const hitPath = container.querySelector('[data-edge-id="edge-001"]');
    expect(hitPath).not.toBeNull();
  });

  it('pointerdown on hit region selects the edge', () => {
    const ctx = makeContext();
    container = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(container);

    dispose = render(
      () => (
        <CanvasContext.Provider value={ctx}>
          <FreeformEdge edge={EDGE} getAbsoluteRect={getAbsoluteRect} />
        </CanvasContext.Provider>
      ),
      container,
    );

    const hitPath = container.querySelector<Element>('[data-edge-id="edge-001"]')!;
    hitPath.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(ctx.selectedIds()).toEqual(['edge-001']);
  });

  it('shift+pointerdown extends selection without replacing', () => {
    const ctx = makeContext();
    ctx.setSelectedIds(['other-node']);
    container = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(container);

    dispose = render(
      () => (
        <CanvasContext.Provider value={ctx}>
          <FreeformEdge edge={EDGE} getAbsoluteRect={getAbsoluteRect} />
        </CanvasContext.Provider>
      ),
      container,
    );

    const hitPath = container.querySelector<Element>('[data-edge-id="edge-001"]')!;
    hitPath.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, shiftKey: true }));

    expect(ctx.selectedIds()).toContain('other-node');
    expect(ctx.selectedIds()).toContain('edge-001');
  });
});
