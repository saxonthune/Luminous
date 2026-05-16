/**
 * Disclosure level → DOM contract.
 *
 * Approach: register the pack, retrieve renderers via getNodeRenderer, and
 * mount them with a fixed `level`. This exercises the full renderer-per-level
 * path without coupling to canvas transform internals.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { render } from 'solid-js/web';
import type { JSX } from 'solid-js';
import { buildGraph, registerPack, resetRegistry, getNodeRenderer } from '@luminous/core';
import type { Node, RenderContext, View } from '@luminous/core';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';

const testView: View = {
  id: 'test',
  name: 'Test',
  nodeRoles: {},
  edgeRoles: {},
  layers: {},
  layout: { algorithm: 'manual' },
};

const emptyGraph = buildGraph([], []);

function makeCtx(level: RenderContext['level']): RenderContext {
  return {
    level,
    zoom: () => 1,
    view: testView,
    graph: emptyGraph,
    hasChildren: () => false,
    inspect: () => undefined,
    sectionColorOf: () => undefined,
  };
}

function mkStateNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'state.test',
    kind: 'statechart.state',
    props: { name: 'TestState', surface: 'TestView', description: 'a description', tags: ['initial'] },
    tags: [],
    ...overrides,
  };
}

let container: HTMLDivElement;
let cleanup: (() => void) | undefined;

beforeAll(() => {
  registerPack(rtpStatechartPack);
});

afterAll(() => {
  resetRegistry();
});

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

describe('statechart.state disclosure levels', () => {
  it('peek renderer exists and renders compact content', () => {
    const node = mkStateNode();
    const renderer = getNodeRenderer('statechart.state', 'peek');
    expect(renderer).toBeDefined();
    const el = mount(() => renderer!(node, makeCtx(() => 'peek')));
    // peek shows the surface/name only, no description
    expect(el.textContent).toContain('TestView');
    expect(el.textContent).not.toContain('a description');
  });

  it('card renderer renders title and tags', () => {
    const node = mkStateNode();
    const renderer = getNodeRenderer('statechart.state', 'card');
    expect(renderer).toBeDefined();
    const el = mount(() => renderer!(node, makeCtx(() => 'card')));
    expect(el.textContent).toContain('TestState');
    expect(el.textContent).toContain('initial');
  });

  it('open renderer renders title, surface, description, and tags', () => {
    const node = mkStateNode();
    const renderer = getNodeRenderer('statechart.state', 'open');
    expect(renderer).toBeDefined();
    const el = mount(() => renderer!(node, makeCtx(() => 'open')));
    expect(el.textContent).toContain('TestState');
    expect(el.textContent).toContain('TestView');
    expect(el.textContent).toContain('a description');
    expect(el.textContent).toContain('initial');
  });

  it('peek and open produce different DOM content', () => {
    const node = mkStateNode();
    const peekRenderer = getNodeRenderer('statechart.state', 'peek')!;
    const openRenderer = getNodeRenderer('statechart.state', 'open')!;

    const peekEl = mount(() => peekRenderer(node, makeCtx(() => 'peek')));
    const peekText = peekEl.textContent ?? '';
    cleanup?.();
    container.remove();
    cleanup = undefined;

    const openEl = mount(() => openRenderer(node, makeCtx(() => 'open')));
    const openText = openEl.textContent ?? '';

    expect(openText.length).toBeGreaterThan(peekText.length);
    expect(openText).toContain('a description');
    expect(peekText).not.toContain('a description');
  });
});

describe('rtp.concept disclosure levels', () => {
  it('peek renderer exists', () => {
    const renderer = getNodeRenderer('rtp.concept', 'peek');
    expect(renderer).toBeDefined();
  });

  it('open renderer shows purpose and state', () => {
    const node: Node = {
      id: 'concept.Collection',
      kind: 'rtp.concept',
      props: { name: 'Collection', purpose: 'manage items', state: 'items: Set<Item>', operationalPrinciple: 'add then use' },
      tags: [],
    };
    const renderer = getNodeRenderer('rtp.concept', 'open')!;
    const el = mount(() => renderer(node, makeCtx(() => 'open')));
    expect(el.textContent).toContain('Collection');
    expect(el.textContent).toContain('manage items');
    expect(el.textContent).toContain('items: Set<Item>');
    expect(el.textContent).toContain('add then use');
  });
});
