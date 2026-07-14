import { describe, it, expect } from 'vitest';
import { render } from 'solid-js/web';
import { ClusterUnderlay } from '../src/Canvas';
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
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} />
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
      <ClusterUnderlay clusters={clusters} getNodeRects={() => new Map()} />
    ));
    expect(container.querySelector('[data-cluster-id="empty"]')).toBeNull();
    cleanup();
  });

  it('renders the label text when set', () => {
    const rects = new Map<string, NodeRect>([['a', { x: 0, y: 0, w: 100, h: 50 }]]);
    const clusters: ClusterDeclaration[] = [{ id: 'c1', memberIds: ['a'], label: 'My Cluster' }];
    const { container, cleanup } = renderIntoContainer(() => (
      <ClusterUnderlay clusters={clusters} getNodeRects={() => rects} />
    ));
    expect(container.textContent).toContain('My Cluster');
    cleanup();
  });
});
