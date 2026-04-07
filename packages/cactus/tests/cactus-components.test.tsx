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
