import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import type { JSX } from 'solid-js';
import { buildGraph } from '@luminous/core';
import type { Node, RenderContext } from '@luminous/core';
import StateCard from '../StateCard.tsx';
import CompositeCard from '../CompositeCard.tsx';
import TransitionCard from '../TransitionCard.tsx';
import ActionCard from '../ActionCard.tsx';
import ConceptCard from '../ConceptCard.tsx';

const mockCtx: RenderContext = {
  level: () => 'card',
  zoom: () => 1,
  view: {
    id: 'statechart',
    name: 'Statechart',
    nodeRoles: {},
    edgeRoles: {},
    layers: {},
    layout: { algorithm: 'elk' },
  },
  graph: buildGraph([], []),
  hasChildren: () => false,
  inspect: () => undefined,
  sectionColorOf: () => undefined,
};

function mkNode(overrides: Partial<Node>): Node {
  return {
    id: 'test.node',
    kind: 'statechart.state',
    props: {},
    tags: [],
    ...overrides,
  };
}

let container: HTMLDivElement;
let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  container?.remove();
  cleanup = undefined;
});

function mount(fn: () => unknown): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  cleanup = render(fn as () => JSX.Element, container);
  return container;
}

describe('StateCard', () => {
  it('renders tag pills for each tag', () => {
    const node = mkNode({
      kind: 'statechart.state',
      props: { description: 'A state', tags: ['initial', 'reviewed'] },
    });
    const el = mount(() => StateCard(node, mockCtx));
    expect(el.textContent).toContain('initial');
    expect(el.textContent).toContain('reviewed');
  });

  it('renders surface in monospace when present', () => {
    const node = mkNode({
      kind: 'statechart.state',
      props: { description: 'A state', surface: 'MyView', tags: [] },
    });
    const el = mount(() => StateCard(node, mockCtx));
    expect(el.textContent).toContain('MyView');
  });

  it('renders reads badge when reads is present', () => {
    const node = mkNode({
      kind: 'statechart.state',
      props: { description: 'A state', reads: ['items'], tags: [] },
    });
    const el = mount(() => StateCard(node, mockCtx));
    expect(el.textContent).toContain('reads:');
    expect(el.textContent).toContain('items');
  });
});

describe('CompositeCard', () => {
  it('renders the parallel glyph when parallel is true', () => {
    const node = mkNode({
      id: 'composite.flow',
      kind: 'statechart.composite',
      props: { description: 'Parallel composite', tags: [], parallel: true },
    });
    const el = mount(() => CompositeCard(node, mockCtx));
    expect(el.textContent).toContain('‖');
  });

  it('does not render parallel glyph when parallel is false', () => {
    const node = mkNode({
      id: 'composite.flow',
      kind: 'statechart.composite',
      props: { description: 'Sequential composite', tags: [], parallel: false },
    });
    const el = mount(() => CompositeCard(node, mockCtx));
    expect(el.textContent).not.toContain('‖');
  });
});

describe('TransitionCard', () => {
  it('renders the event chip', () => {
    const node = mkNode({
      id: 'transition.state.CLICK',
      kind: 'statechart.transition',
      props: { event: 'CLICK', description: 'User clicks', actions: [] },
    });
    const el = mount(() => TransitionCard(node, mockCtx));
    expect(el.textContent).toContain('CLICK');
  });

  it('renders action list when actions are present', () => {
    const node = mkNode({
      id: 'transition.state.SUBMIT',
      kind: 'statechart.transition',
      props: { event: 'SUBMIT', description: 'Submit form', actions: ['save', 'notify'] },
    });
    const el = mount(() => TransitionCard(node, mockCtx));
    expect(el.textContent).toContain('save');
    expect(el.textContent).toContain('notify');
  });
});

describe('ActionCard', () => {
  it('renders signature and derived concept label', () => {
    const node = mkNode({
      id: 'action.concept.Collection.create',
      kind: 'rtp.action',
      props: { name: 'create', signature: 'create(name)', description: '', conceptId: 'concept.Collection' },
    });
    const el = mount(() => ActionCard(node, mockCtx));
    expect(el.textContent).toContain('create(name)');
    expect(el.textContent).toContain('Collection');
  });

  it('sets data-orphan to false on root element', () => {
    const node = mkNode({
      id: 'action.concept.Collection.create',
      kind: 'rtp.action',
      props: { name: 'create', signature: 'create(name)', description: '', conceptId: 'concept.Collection' },
    });
    const el = mount(() => ActionCard(node, mockCtx));
    const root = el.firstElementChild;
    expect(root?.getAttribute('data-orphan')).toBe('false');
  });
});

describe('ConceptCard', () => {
  it('renders purpose text', () => {
    const node = mkNode({
      id: 'concept.Collection',
      kind: 'rtp.concept',
      props: {
        name: 'Collection',
        purpose: 'manage items',
        state: '',
        operationalPrinciple: '',
      },
    });
    const el = mount(() => ConceptCard(node, mockCtx));
    expect(el.textContent).toContain('manage items');
    expect(el.textContent).toContain('Collection');
  });
});
