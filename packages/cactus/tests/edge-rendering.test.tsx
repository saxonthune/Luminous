/**
 * Test: Edge rendering via EdgeDeclaration
 *
 * Verifies that Canvas draws SVG line elements in the edge layer when edges
 * are provided, using the node rect registry populated by NodeContainer.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render } from 'solid-js/web';
import { Canvas } from '../src/Canvas';
import { NodeContainer } from '../src/NodeContainer';
import type { EdgeDeclaration } from '../src/types';

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

function renderIntoContainer(ui: () => unknown): { container: HTMLElement; cleanup: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const cleanup = render(ui as () => import('solid-js').JSX.Element, container);
  return { container, cleanup };
}

/** Query the two edge SVG layers (lines layer and labels layer). */
function getEdgeLayers(container: HTMLElement): { lines: Element | null; labels: Element | null } {
  return {
    lines: container.querySelector('[data-cactus-edge-layer-lines]'),
    labels: container.querySelector('[data-cactus-edge-layer-labels]'),
  };
}

describe('Canvas edge rendering', () => {
  it('renders an SVG line between two nodes', () => {
    const edges: EdgeDeclaration[] = [
      {
        id: 'e1',
        sourceId: 'node-a',
        targetId: 'node-b',
        styling: { arrowHead: false, dash: 'solid' },
      },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 300} y={() => 200} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { lines } = getEdgeLayers(container);
    expect(lines).not.toBeNull();

    const line = lines!.querySelector('line');
    expect(line).not.toBeNull();

    // Edge-to-edge routing: line from src center (130,120) toward tgt center
    // (330,220) exits src box (60x40) at the perimeter, not the center.
    // dx=200, dy=100; t = min(30/200, 20/100) = 0.15
    // src exit = (130+0.15*200, 120+0.15*100) = (160, 135)
    // tgt exit = (330-30, 220-15) = (300, 205)
    expect(line!.getAttribute('x1')).toBe('160');
    expect(line!.getAttribute('y1')).toBe('135');
    expect(line!.getAttribute('x2')).toBe('300');
    expect(line!.getAttribute('y2')).toBe('205');

    cleanup();
  });

  it('renders an arrowhead path when arrowHead: true', () => {
    const edges: EdgeDeclaration[] = [
      {
        id: 'e1',
        sourceId: 'node-a',
        targetId: 'node-b',
        styling: { arrowHead: true },
      },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 0} y={() => 0} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 200} y={() => 0} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { lines } = getEdgeLayers(container);
    expect(lines).not.toBeNull();
    const path = lines!.querySelector('path');
    expect(path).not.toBeNull();

    cleanup();
  });

  it('does NOT render edge SVG layer when no edges prop provided', () => {
    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { lines, labels } = getEdgeLayers(container);
    expect(lines).toBeNull();
    expect(labels).toBeNull();

    cleanup();
  });

  it('truncates labelText longer than 28 characters', () => {
    const longLabel = 'this label is definitely longer than twenty-eight characters';
    const edges: EdgeDeclaration[] = [
      {
        id: 'e1',
        sourceId: 'node-a',
        targetId: 'node-b',
        labelText: longLabel,
      },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 300} y={() => 200} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { labels } = getEdgeLayers(container);
    expect(labels).not.toBeNull();

    const text = labels!.querySelector('text');
    expect(text).not.toBeNull();
    expect(text!.textContent).toMatch(/…$/);
    expect(text!.textContent!.length).toBeLessThanOrEqual(29);

    cleanup();
  });

  it('shows short labelText without truncation', () => {
    const shortLabel = 'short label';
    const edges: EdgeDeclaration[] = [
      {
        id: 'e1',
        sourceId: 'node-a',
        targetId: 'node-b',
        labelText: shortLabel,
      },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 300} y={() => 200} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { labels } = getEdgeLayers(container);
    const text = labels!.querySelector('text');
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe(shortLabel);

    cleanup();
  });

  it('reveals full labelText in a foreignObject on click, collapses on second click', async () => {
    const longLabel = 'this label is definitely longer than twenty-eight characters';
    const edges: EdgeDeclaration[] = [
      {
        id: 'e1',
        sourceId: 'node-a',
        targetId: 'node-b',
        labelText: longLabel,
      },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 300} y={() => 200} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { labels } = getEdgeLayers(container);
    expect(labels).not.toBeNull();

    // No popover before click
    expect(labels!.querySelector('foreignObject')).toBeNull();

    // Click truncated label
    const text = labels!.querySelector('text')!;
    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Popover should appear with full text
    const fo = labels!.querySelector('foreignObject');
    expect(fo).not.toBeNull();
    expect(fo!.textContent).toContain(longLabel);

    // Click the same label text again to toggle (collapse)
    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(labels!.querySelector('foreignObject')).toBeNull();

    cleanup();
  });

  it('skips edge line when source node is not registered', () => {
    const edges: EdgeDeclaration[] = [
      {
        id: 'e1',
        sourceId: 'node-a',
        targetId: 'node-missing',
      },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { lines: linesLayer } = getEdgeLayers(container);
    // SVG layer exists (edges prop is non-empty), but no line should be drawn
    // because node-missing is not registered.
    const lines = linesLayer?.querySelectorAll('line') ?? [];
    expect(lines.length).toBe(0);

    cleanup();
  });
});
