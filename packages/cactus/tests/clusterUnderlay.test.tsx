import { describe, it, expect } from 'vitest';
import { render } from 'solid-js/web';
import { Canvas, ClusterUnderlay } from '../src/Canvas';
import type { ClusterDeclaration } from '../src/types';
import type { NodeRect } from '../src/CanvasContext';

function renderIntoContainer(ui: () => unknown): { container: HTMLElement; cleanup: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const cleanup = render(ui as () => import('solid-js').JSX.Element, container);
  return { container, cleanup };
}

describe('ClusterUnderlay', () => {
  it('renders a tinted rect stamped with data-cluster-id, bounding its members with padding', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, w: 100, h: 50 }],
      ['b', { x: 200, y: 100, w: 100, h: 50 }],
    ]);
    const clusters: ClusterDeclaration[] = [{ id: 'c1', memberIds: ['a', 'b'] }];

    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} zoomScale={() => 1} layer="rects" />
    ));

    const el = container.querySelector('[data-cluster-id="c1"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.left).toBe('-16px');
    expect(el.style.top).toBe('-16px');
    expect(el.style.width).toBe('332px');
    expect(el.style.height).toBe('182px');
    cleanup();
  });

  it('renders nothing for a cluster with no registered member rects', () => {
    const clusters: ClusterDeclaration[] = [{ id: 'empty', memberIds: ['ghost'] }];
    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => new Map()} zoomScale={() => 1} layer="rects" />
    ));
    expect(container.querySelector('[data-cluster-id="empty"]')).toBeNull();
    cleanup();
  });

  it('renders the label text when set', () => {
    const rects = new Map<string, NodeRect>([['a', { x: 0, y: 0, w: 100, h: 50 }]]);
    const clusters: ClusterDeclaration[] = [{ id: 'c1', memberIds: ['a'], label: 'My Cluster' }];
    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} zoomScale={() => 1} layer="labels" />
    ));
    expect(container.textContent).toContain('My Cluster');
    cleanup();
  });

  it('does not make the label interactive when onLabelEdit is absent', () => {
    const rects = new Map<string, NodeRect>([['a', { x: 0, y: 0, w: 100, h: 50 }]]);
    const clusters: ClusterDeclaration[] = [{ id: 'c1', memberIds: ['a'], label: 'My Cluster' }];
    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} zoomScale={() => 1} layer="labels" />
    ));
    const label = Array.from(container.querySelectorAll('div')).reverse().find((d) => d.textContent === 'My Cluster')!;
    expect(label.style.pointerEvents).toBe('none');
    cleanup();
  });

  it('drags the cluster by its label: canvas-space deltas after the threshold, end on pointerup', () => {
    const rects = new Map<string, NodeRect>([['a', { x: 0, y: 0, w: 100, h: 50 }]]);
    const drags: Array<[number, number]> = [];
    let started = 0;
    let ended = 0;
    const clusters: ClusterDeclaration[] = [
      {
        id: 'c1',
        memberIds: ['a'],
        label: 'My Cluster',
        onDragStart: () => { started++; },
        onDrag: (dx, dy) => { drags.push([dx, dy]); },
        onDragEnd: () => { ended++; },
      },
    ];
    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} zoomScale={() => 2} layer="labels" />
    ));

    const label = Array.from(container.querySelectorAll('div')).reverse().find((d) => d.textContent === 'My Cluster')!;
    expect(label.style.pointerEvents).toBe('auto');
    expect(label.style.cursor).toBe('grab');

    // jsdom has no PointerEvent; MouseEvent with the pointer event type works
    // since the handlers only read button/clientX/clientY.
    label.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 11, clientY: 11 }));
    expect(started).toBe(0);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, clientY: 20 }));
    expect(started).toBe(1);
    expect(drags).toEqual([[10, 5]]);
    window.dispatchEvent(new MouseEvent('pointerup', {}));
    expect(ended).toBe(1);

    cleanup();
  });

  it('swaps the label for an input on double-click and commits on Enter', () => {
    const rects = new Map<string, NodeRect>([['a', { x: 0, y: 0, w: 100, h: 50 }]]);
    let committed: string | null = null;
    const clusters: ClusterDeclaration[] = [
      { id: 'c1', memberIds: ['a'], label: 'My Cluster', onLabelEdit: (v) => { committed = v; } },
    ];
    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} zoomScale={() => 1} layer="labels" />
    ));

    const label = Array.from(container.querySelectorAll('div')).reverse().find((d) => d.textContent === 'My Cluster')!;
    expect(label.style.pointerEvents).toBe('auto');
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = 'Renamed';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(committed).toBe('Renamed');
    expect(container.querySelector('input')).toBeNull();

    cleanup();
  });

  it('cancels edit on Escape without calling onLabelEdit', () => {
    const rects = new Map<string, NodeRect>([['a', { x: 0, y: 0, w: 100, h: 50 }]]);
    let called = false;
    const clusters: ClusterDeclaration[] = [
      { id: 'c1', memberIds: ['a'], label: 'My Cluster', onLabelEdit: () => { called = true; } },
    ];
    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} zoomScale={() => 1} layer="labels" />
    ));

    const label = Array.from(container.querySelectorAll('div')).reverse().find((d) => d.textContent === 'My Cluster')!;
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'Changed';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(called).toBe(false);
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('My Cluster');

    cleanup();
  });

  it('does not call onLabelEdit when the committed value is unchanged or empty', () => {
    const rects = new Map<string, NodeRect>([['a', { x: 0, y: 0, w: 100, h: 50 }]]);
    let calls = 0;
    const clusters: ClusterDeclaration[] = [
      { id: 'c1', memberIds: ['a'], label: 'My Cluster', onLabelEdit: () => { calls++; } },
    ];
    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} zoomScale={() => 1} layer="labels" />
    ));

    const findLabel = () =>
      Array.from(container.querySelectorAll('div')).reverse().find((d) => d.textContent === 'My Cluster')!;

    findLabel().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    let input = container.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    expect(calls).toBe(0);

    findLabel().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    input = container.querySelector('input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    expect(calls).toBe(0);

    cleanup();
  });

  // The node layer's full-canvas wrapper hit-tests over everything painted
  // before it, so labels must render in a layer AFTER it or the pointer can
  // never reach them (drag/rename would silently dead-end).
  it('Canvas renders the cluster-labels layer after the node-layer wrapper', () => {
    const clusters: ClusterDeclaration[] = [{ id: 'c1', memberIds: ['a'], label: 'My Cluster' }];
    const { container, cleanup } = renderIntoContainer(() => (
      <Canvas clusters={clusters}>
        <div data-testid="node-child" />
      </Canvas>
    ));

    const labelsLayer = container.querySelector('[data-cactus-cluster-labels]');
    expect(labelsLayer).not.toBeNull();
    const nodeLayer = container.querySelector('[data-testid="node-child"]')!.parentElement!;
    expect(nodeLayer.compareDocumentPosition(labelsLayer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    cleanup();
  });
});
