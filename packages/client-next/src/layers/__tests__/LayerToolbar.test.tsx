import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render } from 'solid-js/web';
import type { Layer } from '@luminous/core';
import { LayerToolbar } from '../LayerToolbar';
import { defaultLayerStateStore } from '../layerState';

const LAYERS: Layer[] = [
  { id: 'layer-a', name: 'Transitions', edgeKinds: ['rtp.transition'], defaultState: 'on' },
  { id: 'layer-b', name: 'Actions', edgeKinds: ['rtp.action'], defaultState: 'peek' },
];

let container: HTMLDivElement;
let dispose: () => void;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  dispose?.();
  container?.parentNode?.removeChild(container);
});

describe('LayerToolbar', () => {
  it('renders both layer names', () => {
    dispose = render(
      () => (
        <LayerToolbar
          canvasId="test-canvas"
          viewId="test-view-names"
          layers={LAYERS}
        />
      ),
      container,
    );

    expect(container.textContent).toContain('Transitions');
    expect(container.textContent).toContain('Actions');
  });

  it('default states are highlighted (data-active=true)', () => {
    dispose = render(
      () => (
        <LayerToolbar
          canvasId="test-canvas"
          viewId="test-view-defaults"
          layers={LAYERS}
        />
      ),
      container,
    );

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    const activeButtons = Array.from(buttons).filter(b => b.dataset.active === 'true');
    const activeLabels = activeButtons.map(b => b.textContent?.trim());

    // Layer A default is 'on', Layer B default is 'peek'
    expect(activeLabels).toContain('on');
    expect(activeLabels).toContain('peek');
  });

  it('clicking off button for layer 1 updates store and localStorage', async () => {
    dispose = render(
      () => (
        <LayerToolbar
          canvasId="test-canvas"
          viewId="test-view-click"
          layers={LAYERS}
        />
      ),
      container,
    );

    // Find the 'off' button in the first layer's segmented control
    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    const offButtons = Array.from(buttons).filter(b => b.textContent?.trim() === 'off');
    // First 'off' button belongs to layer-a
    offButtons[0].click();

    const key = { canvasId: 'test-canvas', viewId: 'test-view-click', layerId: 'layer-a' };
    expect(defaultLayerStateStore.getState(key, 'on')()).toBe('off');
    expect(localStorage.getItem('luminous:layer-state:test-canvas:test-view-click:layer-a')).toBe('off');
  });
});
