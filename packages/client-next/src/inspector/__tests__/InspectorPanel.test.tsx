import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { buildGraph } from '@luminous/canvas-core';
import type { View } from '@luminous/canvas-core';
import { InspectorContext, type InspectorContextValue } from '../InspectorContext';
import { InspectorPanel } from '../InspectorPanel';

beforeAll(() => {
  if (typeof PointerEvent === 'undefined') {
    // @ts-expect-error
    globalThis.PointerEvent = class PointerEvent extends MouseEvent {};
  }
});

const MINIMAL_VIEW: View = {
  id: 'test-view',
  name: 'Test View',
  nodeRoles: {},
  edgeRoles: {},
  layers: {},
  layout: { algorithm: 'manual' },
};

const graph = buildGraph(
  [
    { id: 'state-a', kind: 'statechart.state', props: { label: 'Idle' }, tags: [] },
    { id: 'state-b', kind: 'statechart.state', props: { label: 'Active' }, tags: [] },
  ],
  [
    {
      id: 'transition-1',
      kind: 'statechart.transition',
      from: 'state-a',
      to: 'state-b',
      props: { event: 'CLICK', description: 'foo' },
      tags: [],
    },
  ],
);

function makeInspectorValue(initialStack: string[]): {
  value: InspectorContextValue;
  stackSignal: () => readonly string[];
} {
  const [stack, setStack] = createSignal<string[]>(initialStack);
  const target = () => {
    const s = stack();
    return s.length > 0 ? s[s.length - 1] : null;
  };
  const open = (id: string) => setStack((prev) => [...prev, id]);
  const back = () => setStack((prev) => prev.slice(0, -1));
  const close = () => setStack([]);
  return { value: { target, open, back, close, stack }, stackSignal: stack };
}

let container: HTMLDivElement;
let dispose: () => void;

afterEach(() => {
  dispose?.();
  container?.parentNode?.removeChild(container);
});

describe('InspectorPanel', () => {
  it('renders edge props in fallback mode', () => {
    const { value } = makeInspectorValue(['transition-1']);
    container = document.createElement('div');
    document.body.appendChild(container);

    dispose = render(
      () => (
        <InspectorContext.Provider value={value}>
          <InspectorPanel graph={graph} view={MINIMAL_VIEW} />
        </InspectorContext.Provider>
      ),
      container,
    );

    expect(container.textContent).toContain('CLICK');
    expect(container.textContent).toContain('foo');
  });

  it('shows nothing when stack is empty', () => {
    const { value } = makeInspectorValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);

    dispose = render(
      () => (
        <InspectorContext.Provider value={value}>
          <InspectorPanel graph={graph} view={MINIMAL_VIEW} />
        </InspectorContext.Provider>
      ),
      container,
    );

    expect(container.textContent).toBe('');
  });

  it('close button empties the stack', () => {
    const { value } = makeInspectorValue(['transition-1']);
    container = document.createElement('div');
    document.body.appendChild(container);

    dispose = render(
      () => (
        <InspectorContext.Provider value={value}>
          <InspectorPanel graph={graph} view={MINIMAL_VIEW} />
        </InspectorContext.Provider>
      ),
      container,
    );

    const closeBtn = container.querySelector<HTMLButtonElement>('button[title="Close"]');
    expect(closeBtn).not.toBeNull();
    closeBtn!.click();

    expect(value.target()).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows Not in graph for unknown id', () => {
    const { value } = makeInspectorValue(['no-such-id']);
    container = document.createElement('div');
    document.body.appendChild(container);

    dispose = render(
      () => (
        <InspectorContext.Provider value={value}>
          <InspectorPanel graph={graph} view={MINIMAL_VIEW} />
        </InspectorContext.Provider>
      ),
      container,
    );

    expect(container.textContent).toContain('Not in graph');
  });

  it('renders node props for node id', () => {
    const { value } = makeInspectorValue(['state-a']);
    container = document.createElement('div');
    document.body.appendChild(container);

    dispose = render(
      () => (
        <InspectorContext.Provider value={value}>
          <InspectorPanel graph={graph} view={MINIMAL_VIEW} />
        </InspectorContext.Provider>
      ),
      container,
    );

    expect(container.textContent).toContain('Idle');
  });
});
