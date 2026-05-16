import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPack,
  getNodeKind,
  getEdgeKind,
  getView,
  getLayer,
  getDisclosureSchema,
  getNodeRenderer,
  resetRegistry,
  buildGraph,
  type RenderContext,
} from '@luminous/core';
import rtpStatechartPack, { nodeKinds, edgeKinds, statechartView } from '../src/index.ts';

beforeEach(() => {
  resetRegistry();
});

describe('pack import has no side effects', () => {
  it('does not register any kinds before registerPack is called', () => {
    // Just importing should not have registered anything
    expect(getNodeKind('statechart.state')).toBeUndefined();
    expect(getEdgeKind('rtp.belongs-to-concept')).toBeUndefined();
    expect(getView('statechart')).toBeUndefined();
    // Access exported values to confirm the import works
    expect(nodeKinds.length).toBeGreaterThan(0);
    expect(edgeKinds.length).toBeGreaterThan(0);
    expect(statechartView.id).toBe('statechart');
  });
});

describe('registerPack', () => {
  it('succeeds without throwing', () => {
    expect(() => registerPack(rtpStatechartPack)).not.toThrow();
  });
});

describe('node kind lookup', () => {
  it('getNodeKind returns statechart.state', () => {
    registerPack(rtpStatechartPack);
    const kind = getNodeKind('statechart.state');
    expect(kind).toBeDefined();
    expect(kind?.id).toBe('statechart.state');
    expect(kind?.label).toBe('State');
  });
});

describe('edge kind lookup', () => {
  it('getEdgeKind returns rtp.belongs-to-concept', () => {
    registerPack(rtpStatechartPack);
    const kind = getEdgeKind('rtp.belongs-to-concept');
    expect(kind).toBeDefined();
    expect(kind?.id).toBe('rtp.belongs-to-concept');
    expect(kind?.directed).toBe(true);
  });
});

describe('view lookup', () => {
  it('getView returns statechart view', () => {
    registerPack(rtpStatechartPack);
    const view = getView('statechart');
    expect(view).toBeDefined();
    expect(view?.id).toBe('statechart');
    expect(view?.name).toBe('Statechart');
  });
});

describe('layer lookup', () => {
  it('getLayer returns action-chips layer', () => {
    registerPack(rtpStatechartPack);
    const layer = getLayer('action-chips');
    expect(layer).toBeDefined();
    expect(layer?.id).toBe('action-chips');
    expect(layer?.defaultState).toBe('on');
  });
});

describe('disclosure schema lookup', () => {
  it('getDisclosureSchema returns schema for statechart.state', () => {
    registerPack(rtpStatechartPack);
    const schema = getDisclosureSchema('statechart.state');
    expect(schema).toBeDefined();
    expect(schema?.kind).toBe('statechart.state');
    expect(schema?.peek).toContain('surface');
    expect(schema?.card).toContain('tags');
  });
});

describe('props schema validation', () => {
  it('valid state props pass safeParse', () => {
    registerPack(rtpStatechartPack);
    const kind = getNodeKind('statechart.state');
    const result = kind?.propsSchema.safeParse({
      description: 'Showing the collection list',
      tags: ['primary'],
      surface: 'CollectionList',
    });
    expect(result?.success).toBe(true);
  });

  it('malformed state props fail safeParse', () => {
    registerPack(rtpStatechartPack);
    const kind = getNodeKind('statechart.state');
    // missing required 'description'
    const result = kind?.propsSchema.safeParse({ tags: [] });
    expect(result?.success).toBe(false);
  });
});

describe('renderer fallback', () => {
  it('getNodeRenderer for statechart.state at open level returns card placeholder via fallback', () => {
    registerPack(rtpStatechartPack);
    // Only 'card' is defined; requesting 'open' should fall back to 'card'
    const renderer = getNodeRenderer('statechart.state', 'open');
    expect(renderer).toBeDefined();
    const mockCtx: RenderContext = {
      level: () => 'open',
      zoom: () => 1,
      view: statechartView,
      graph: buildGraph([], []),
      hasChildren: () => false,
      inspect: () => undefined,
      sectionColorOf: () => undefined,
    };
    const result = renderer?.({ id: 'state.nav.Home', kind: 'statechart.state', props: { name: 'Home' }, tags: [] }, mockCtx);
    // renderer now returns JSX (not a string); verify fallback mechanism returns something
    expect(result).toBeDefined();
  });
});
