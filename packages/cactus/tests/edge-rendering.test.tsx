/**
 * Test: Edge rendering via EdgeDeclaration
 *
 * Verifies that Canvas draws SVG line elements in the edge layer when edges
 * are provided, using the node rect registry populated by NodeContainer.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { Canvas } from '../src/Canvas';
import type { CanvasRef } from '../src/Canvas';
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
  it('uses the host projection of selected IDs for edge emphasis', () => {
    let canvasRef: CanvasRef | undefined;
    const edges: EdgeDeclaration[] = [
      { id: 'child-edge', sourceId: 'child', targetId: 'other' },
      { id: 'unrelated-edge', sourceId: 'x', targetId: 'y' },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas
        ref={(ref) => { canvasRef = ref; }}
        edges={edges}
        edgeEmphasisNodeIds={(selected) => selected.includes('parent') ? [...selected, 'child'] : selected}
      >
        <NodeContainer nodeId="parent" x={() => 0} y={() => 0} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="child" x={() => 100} y={() => 0} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="other" x={() => 200} y={() => 0} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="x" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="y" x={() => 200} y={() => 100} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    canvasRef!.setSelectedIds(['parent']);
    const routes = container.querySelectorAll('[data-cactus-edge-layer-lines] polyline');
    expect(routes[0].getAttribute('opacity')).toBe('1');
    expect(routes[1].getAttribute('opacity')).toBe('0.15');

    cleanup();
  });

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

  it('renders a dotted cubic Bézier when requested by edge styling', () => {
    const edges: EdgeDeclaration[] = [{
      id: 'curved',
      sourceId: 'node-a',
      targetId: 'node-b',
      styling: { curve: 'bezier', dash: 'dotted' },
    }];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 0} y={() => 0} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 200} y={() => 80} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const visiblePath = container.querySelector('[data-cactus-edge-layer-lines] path:not([data-edge-id])');
    expect(visiblePath?.getAttribute('d')).toContain(' C ');
    expect(visiblePath?.getAttribute('stroke-dasharray')).toBeTruthy();

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

  it('renders an invisible hit line with data-edge-id alongside the visible line', () => {
    const edges: EdgeDeclaration[] = [
      { id: 'e1', sourceId: 'node-a', targetId: 'node-b', styling: { width: 2 } },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 300} y={() => 200} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { lines } = getEdgeLayers(container);
    const hitLine = lines!.querySelector('line[data-edge-id="e1"]');
    expect(hitLine).not.toBeNull();
    expect(hitLine!.getAttribute('stroke')).toBe('transparent');
    expect(Number(hitLine!.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(12);

    cleanup();
  });

  it('counter-scales edge strokes, dashes, arrowheads, and hit targets while zooming out', () => {
    let canvasRef: CanvasRef | undefined;
    const edges: EdgeDeclaration[] = [
      { id: 'e1', sourceId: 'node-a', targetId: 'node-b', styling: { width: 1.5, dash: 'dashed', arrowHead: true } },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas ref={(ref) => { canvasRef = ref; }} edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 300} y={() => 200} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    canvasRef!.setView({ x: 0, y: 0, k: 0.2 }, false);
    const visibleLine = container.querySelector('[data-cactus-edge-layer-lines] polyline')!;
    const hitLine = container.querySelector('[data-cactus-edge-layer-lines] line[data-edge-id="e1"]')!;
    const arrow = container.querySelector('[data-cactus-edge-layer-lines] path')!;

    expect(Number(visibleLine.getAttribute('stroke-width')) * 0.2).toBeCloseTo(0.85);
    expect(Number(hitLine.getAttribute('stroke-width')) * 0.2).toBeCloseTo(12);
    expect(visibleLine.getAttribute('stroke-dasharray')).toBe('17 8.5');
    expect(arrow.getAttribute('d')).toContain('L ');

    cleanup();
  });

  it('opens edgeContextMenu on right-click over an edge hit line', () => {
    const edges: EdgeDeclaration[] = [
      { id: 'e1', sourceId: 'node-a', targetId: 'node-b' },
    ];

    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas
        edges={edges}
        edgeContextMenu={(edgeId) =>
          edgeId === 'e1'
            ? { id: 'edge-menu', items: [{ type: 'action', action: { id: 'delete', label: 'Delete' } }] }
            : undefined
        }
      >
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 300} y={() => 200} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const { lines } = getEdgeLayers(container);
    const hitLine = lines!.querySelector('line[data-edge-id="e1"]')!;
    hitLine.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));

    expect(document.body.textContent).toContain('Delete');

    cleanup();
  });

  it('renders a multi-segment route in its declared bands and keeps every hit target on the semantic edge', () => {
    const edges: EdgeDeclaration[] = [
      {
        id: 'e1', sourceId: 'node-a', targetId: 'node-b', styling: { arrowHead: true },
        routeBuilder: () => ({
          points: [{ x: 60, y: 20 }, { x: 130, y: 20 }, { x: 130, y: 120 }, { x: 200, y: 120 }],
          segmentLayers: [1, 3, 3],
        }),
      },
    ];
    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => 0} y={() => 0} w={() => 60} h={() => 40} visualBand={() => 0} />
        <NodeContainer nodeId="node-b" x={() => 200} y={() => 100} w={() => 60} h={() => 40} visualBand={() => 4} />
      </Canvas>
    ));

    expect(container.querySelector('[data-cactus-edge-route-band="1"]')).not.toBeNull();
    expect(container.querySelector('[data-cactus-edge-route-band="3"]')).not.toBeNull();
    const hits = container.querySelectorAll('line[data-edge-id="e1"]');
    expect(hits).toHaveLength(3);
    expect([...hits].every((line) => line.getAttribute('data-edge-id') === 'e1')).toBe(true);
    const arrow = container.querySelector('[data-cactus-edge-route-band="3"] path');
    expect(arrow?.getAttribute('d')).toContain('M 200 120');
    cleanup();
  });

  it('does not clip route bands to the screen-sized canvas wrapper', () => {
    const edges: EdgeDeclaration[] = [
      {
        id: 'offscreen-route', sourceId: 'node-a', targetId: 'node-b',
        routeBuilder: () => ({
          points: [{ x: -6000, y: 1200 }, { x: 8000, y: 1200 }],
          segmentLayers: [-1],
        }),
      },
    ];
    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges}>
        <NodeContainer nodeId="node-a" x={() => -6060} y={() => 1180} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 8000} y={() => 1180} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    const band = container.querySelector('[data-cactus-edge-route-band="-1"]') as SVGElement;
    expect(band.style.overflow).toBe('visible');
    expect(band.querySelector('line[data-edge-id="offscreen-route"]')).not.toBeNull();
    cleanup();
  });

  it('computes shared route geometry once and holds it fixed while routing is frozen', () => {
    const [x, setX] = createSignal(0);
    const [frozen, setFrozen] = createSignal(false);
    let routeCalls = 0;
    const edges: EdgeDeclaration[] = [{
      id: 'shared-route', sourceId: 'node-a', targetId: 'node-b',
      routeBuilder: () => {
        routeCalls++;
        return {
          points: [{ x: x() + 60, y: 20 }, { x: 130, y: 20 }, { x: 200, y: 20 }],
          segmentLayers: [1, 3],
        };
      },
    }];
    const { cleanup } = renderIntoContainer(() => (
      <Canvas edges={edges} freezeEdgeRouting={frozen}>
        <NodeContainer nodeId="node-a" x={x} y={() => 0} w={() => 60} h={() => 40} />
        <NodeContainer nodeId="node-b" x={() => 200} y={() => 0} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    expect(routeCalls).toBe(1);
    setFrozen(true);
    setX(50);
    expect(routeCalls).toBe(1);
    setFrozen(false);
    expect(routeCalls).toBe(2);
    cleanup();
  });

  it('exposes getSelectedIds on CanvasRef, empty when nothing is selected', () => {
    let ref: CanvasRef | undefined;

    const { cleanup } = renderIntoContainer(() => (
      <Canvas ref={(r) => { ref = r; }}>
        <NodeContainer nodeId="node-a" x={() => 100} y={() => 100} w={() => 60} h={() => 40} />
      </Canvas>
    ));

    expect(ref).toBeDefined();
    expect(ref!.getSelectedIds()).toEqual([]);

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
