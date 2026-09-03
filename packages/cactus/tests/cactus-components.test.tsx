/**
 * Test: Canvas Engine Component Rendering
 *
 * Component tests for canvas engine components. These test DOM structure
 * and basic interactions without needing d3-zoom or real browser dimensions.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from 'solid-js/web';

// jsdom does not include PointerEvent — polyfill it
beforeAll(() => {
  if (typeof PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
      }
    }
    (globalThis as Record<string, unknown>).PointerEvent = PointerEventPolyfill;
  }
});
import { ConnectionHandle } from '../src/ConnectionHandle';
import { NodeContainer } from '../src/NodeContainer';
import { counterScaleFactor, counterScaleSlotState } from '../src/CounterScale';
import { ScreenSpaceAnchor, screenSpaceAnchorOffset } from '../src/ScreenSpaceAnchor';
import { ResizeHandle } from '../src/ResizeHandle';
import { CanvasContext } from '../src/CanvasContext';
import type { CanvasContextValue } from '../src/CanvasContext';

function renderIntoContainer(ui: () => unknown): { container: HTMLElement; cleanup: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const cleanup = render(ui as () => import('solid-js').JSX.Element, container);
  return { container, cleanup };
}

describe('ConnectionHandle', () => {
  it('renders target handle with data attributes', () => {
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="target" id="body" nodeId="node-1" />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('data-connection-target')).toBe('true');
    expect(el.getAttribute('data-node-id')).toBe('node-1');
    expect(el.getAttribute('data-handle-id')).toBe('body');
    cleanup();
  });

  it('renders source handle without target data attributes', () => {
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="source" id="E" nodeId="node-1" />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('data-connection-target')).toBeNull();
    expect(el.getAttribute('data-node-id')).toBeNull();
    expect(el.getAttribute('data-handle-id')).toBeNull();
    cleanup();
  });

  it('fires onStartConnection on pointerdown for source type', () => {
    const onStart = vi.fn();
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="source" id="E" nodeId="node-1" onStartConnection={onStart} />
    );
    const el = container.firstElementChild as HTMLElement;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onStart).toHaveBeenCalledWith('node-1', 'E', expect.any(Number), expect.any(Number));
    cleanup();
  });

  it('does NOT fire onStartConnection for target type', () => {
    const onStart = vi.fn();
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="target" id="body" nodeId="node-1" onStartConnection={onStart} />
    );
    const el = container.firstElementChild as HTMLElement;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onStart).not.toHaveBeenCalled();
    cleanup();
  });

  it('renders children', () => {
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="source" id="E" nodeId="node-1">
        <span data-testid="child">Arrow</span>
      </ConnectionHandle>
    );
    expect(container.querySelector('[data-testid="child"]')).toBeDefined();
    cleanup();
  });

  it('applies custom class', () => {
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="source" id="E" nodeId="node-1" class="custom-class" />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toBe('custom-class');
    cleanup();
  });

  it('applies custom style', () => {
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="source" id="E" nodeId="node-1" style={{ "background-color": 'red', width: '20px' }} />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.backgroundColor).toBe('red');
    expect(el.style.width).toBe('20px');
    cleanup();
  });

  it('target without id omits data-handle-id', () => {
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="target" nodeId="node-1" />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('data-connection-target')).toBe('true');
    expect(el.getAttribute('data-node-id')).toBe('node-1');
    expect(el.getAttribute('data-handle-id')).toBeNull();
    cleanup();
  });

  it('source without id calls onStartConnection with null handle', () => {
    const onStart = vi.fn();
    const { container, cleanup } = renderIntoContainer(() =>
      <ConnectionHandle type="source" nodeId="node-1" onStartConnection={onStart} />
    );
    const el = container.firstElementChild as HTMLElement;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onStart).toHaveBeenCalledWith('node-1', null, expect.any(Number), expect.any(Number));
    cleanup();
  });
});

const mockCanvasCtx: CanvasContextValue = {
  transform: () => ({ x: 0, y: 0, k: 1 }),
  screenToCanvas: (x, y) => ({ x, y }),
  startConnection: () => {},
  connectionDrag: () => null,
  selectedIds: () => [],
  clearSelection: () => {},
  isSelected: () => false,
  onNodePointerDown: () => {},
  setSelectedIds: () => {},
  ctrlHeld: () => false,
  registerNodeRect: () => {},
  unregisterNodeRect: () => {},
  getNodeRects: () => new Map(),
  registerHeaderHeight: () => {},
  unregisterHeaderHeight: () => {},
  getHeaderHeights: () => new Map(),
  fitView: () => {},
  layoutOverride: () => undefined,
  setLayoutOverride: () => {},
  layoutApply: () => null,
};

function renderNodeContainer(ui: () => import('solid-js').JSX.Element) {
  return renderIntoContainer(() => (
    <CanvasContext.Provider value={mockCanvasCtx}>
      {ui()}
    </CanvasContext.Provider>
  ));
}

describe('counterScaleFactor', () => {
  it('inverts camera zoom around the reference zoom', () => {
    expect(counterScaleFactor(0.5)).toBe(2);
  });

  it('clamps the local scale to consumer bounds', () => {
    expect(counterScaleFactor(0.25, 1, 1, 1.5)).toBe(1.5);
    expect(counterScaleFactor(2, 1, 0.75, 1.5)).toBe(0.75);
  });

  it('normalizes reversed bounds', () => {
    expect(counterScaleFactor(0.5, 1, 3, 1)).toBe(2);
  });
});

describe('counterScaleSlotState', () => {
  it('derives projected capacity and inverse scale without measuring during zoom', () => {
    expect(counterScaleSlotState({ zoom: 0.5, width: 200, height: 80 })).toEqual({
      scale: 2,
      screenWidth: 100,
      screenHeight: 40,
      visible: true,
    });
  });

  it('hides a unit whose projected allocation cannot meet its screen floor', () => {
    expect(counterScaleSlotState({
      zoom: 0.5,
      width: 80,
      height: 30,
      minScreenWidth: 48,
      minScreenHeight: 18,
    }).visible).toBe(false);
  });

  it('uses separate exit and re-entry boundaries', () => {
    const common = {
      zoom: 1,
      width: 49,
      height: 20,
      minScreenWidth: 50,
      minScreenHeight: 20,
      hysteresis: 2,
    };
    expect(counterScaleSlotState({ ...common, wasVisible: true }).visible).toBe(true);
    expect(counterScaleSlotState({ ...common, wasVisible: false }).visible).toBe(false);
  });
});

describe('screenSpaceAnchorOffset', () => {
  it('pins a bottom-right visual around its world anchor', () => {
    expect(screenSpaceAnchorOffset(16, 20, 'right', 'bottom')).toEqual({
      left: -16,
      top: -20,
      origin: 'right bottom',
    });
  });

  it('centers a visual around its world anchor', () => {
    expect(screenSpaceAnchorOffset(16, 20)).toEqual({
      left: -8,
      top: -10,
      origin: 'center center',
    });
  });
});

describe('ScreenSpaceAnchor', () => {
  it('pins an inversely scaled visual to a canvas point', () => {
    const zoomedContext: CanvasContextValue = {
      ...mockCanvasCtx,
      transform: () => ({ x: 0, y: 0, k: 0.5 }),
    };
    const { container, cleanup } = renderIntoContainer(() => (
      <CanvasContext.Provider value={zoomedContext}>
        <ScreenSpaceAnchor
          x={() => 100}
          y={() => 200}
          width={16}
          height={16}
          horizontal="right"
          vertical="bottom"
        >
          <span>handle</span>
        </ScreenSpaceAnchor>
      </CanvasContext.Provider>
    ));
    const anchor = container.querySelector('[data-cactus-screen-space-anchor]') as HTMLElement;
    const visual = container.querySelector('[data-cactus-counter-scale]') as HTMLElement;
    expect(anchor.style.left).toBe('100px');
    expect(anchor.style.top).toBe('200px');
    expect(visual.style.left).toBe('-16px');
    expect(visual.style.top).toBe('-16px');
    expect(visual.style.transform).toBe('scale(2)');
    cleanup();
  });

  it('renders an anchored ResizeHandle outside Node content', () => {
    const onResize = vi.fn();
    const { container, cleanup } = renderNodeContainer(() => (
      <ResizeHandle
        nodeId="container"
        rect={() => ({ x: 10, y: 20, w: 100, h: 80 })}
        onResizePointerDown={onResize}
      />
    ));
    const anchor = container.querySelector('[data-cactus-screen-space-anchor]') as HTMLElement;
    const handle = container.querySelector('[data-cactus-resize-handle]') as HTMLElement;
    expect(anchor.style.left).toBe('110px');
    expect(anchor.style.top).toBe('100px');
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onResize).toHaveBeenCalledWith(
      'container',
      { horizontal: 'right', vertical: 'bottom' },
      expect.any(PointerEvent),
    );
    cleanup();
  });
});

describe('NodeContainer', () => {
  it('renders backing div with data-soft-container when softContainer returns true', () => {
    const { container, cleanup } = renderNodeContainer(() =>
      <NodeContainer nodeId="n1" x={() => 0} y={() => 0} w={() => 120} h={() => 60} softContainer={() => true} />
    );
    const backing = container.querySelector('[data-soft-container="true"]');
    expect(backing).not.toBeNull();
    cleanup();
  });

  it('does not render backing div when softContainer is omitted', () => {
    const { container, cleanup } = renderNodeContainer(() =>
      <NodeContainer nodeId="n2" x={() => 0} y={() => 0} w={() => 120} h={() => 60} />
    );
    const backing = container.querySelector('[data-soft-container="true"]');
    expect(backing).toBeNull();
    cleanup();
  });

  it('does not render backing div when softContainer returns false', () => {
    const { container, cleanup } = renderNodeContainer(() =>
      <NodeContainer nodeId="n3" x={() => 0} y={() => 0} w={() => 120} h={() => 60} softContainer={() => false} />
    );
    const backing = container.querySelector('[data-soft-container="true"]');
    expect(backing).toBeNull();
    cleanup();
  });
});
