import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { ViewSwitcher } from '../ViewSwitcher.tsx';
import type { View } from '@luminous/canvas-core';

const views: View[] = [
  {
    id: 'statechart',
    name: 'Statechart',
    nodeRoles: {},
    edgeRoles: {},
    layers: {},
    layout: { algorithm: 'elk' },
  },
  {
    id: 'concept-map',
    name: 'Concept map',
    nodeRoles: {},
    edgeRoles: {},
    layers: {},
    layout: { algorithm: 'force' },
  },
];

let container: HTMLElement;
let dispose: () => void;

afterEach(() => {
  dispose?.();
  container?.parentNode?.removeChild(container);
});

describe('ViewSwitcher', () => {
  it('renders both view names as options', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    dispose = render(
      () => <ViewSwitcher views={views} activeViewId="statechart" onChange={() => {}} />,
      container,
    );

    const options = container.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toBe('Statechart');
    expect(options[1].textContent).toBe('Concept map');
  });

  it('shows the active view as selected', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    dispose = render(
      () => <ViewSwitcher views={views} activeViewId="concept-map" onChange={() => {}} />,
      container,
    );

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('concept-map');
  });

  it('calls onChange with the new view id when selection changes', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const onChange = vi.fn();
    dispose = render(
      () => <ViewSwitcher views={views} activeViewId="statechart" onChange={onChange} />,
      container,
    );

    const select = container.querySelector('select') as HTMLSelectElement;
    select.value = 'concept-map';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith('concept-map');
  });
});
