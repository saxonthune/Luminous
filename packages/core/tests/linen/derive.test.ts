import { describe, it, expect } from 'vitest';
import { moduleManifest, resumeContract, traceFrom } from '../../src/linen/derive.ts';
import { KIND_DESCRIPTORS } from '../../src/linen/kind-descriptors.ts';
import type { KindDescriptor } from '../../src/linen/kind-descriptors.ts';
import type { LinenDocument } from '../../src/linen/types.ts';

function twoModules(): LinenDocument {
  return {
    v: 1,
    modules: [
      { id: 'worker', name: 'Worker' },
      { id: 'feed-poller', name: 'FeedPoller', parent: 'worker' },
      { id: 'kv', name: 'KV' },
    ],
    contracts: [{ id: 'snapshot', name: 'RenderSnapshot', owner: 'kv' }],
    nodes: [
      { id: 'start', kind: 'entry', module: 'feed-poller' },
      { id: 'branch', kind: 'switch', module: 'feed-poller' },
      { id: 'shape-a', kind: 'transformation', module: 'feed-poller' },
      { id: 'shape-b', kind: 'transformation', module: 'feed-poller' },
      { id: 'store', kind: 'pass', module: 'feed-poller', to: 'kv' },
      { id: 'done', kind: 'release-control', module: 'feed-poller' },
    ],
    edges: [
      { from: 'start', to: 'branch' },
      { from: 'branch', to: 'shape-a' },
      { from: 'branch', to: 'shape-b' },
      { from: 'shape-a', to: 'store' },
      { from: 'shape-b', to: 'store' },
      { from: 'store', to: 'done' },
      { from: 'kv', to: 'snapshot' },
    ],
  };
}

describe('traceFrom', () => {
  it('orders a branched Trace depth-first in edge order', () => {
    const order = traceFrom(twoModules(), 'start').map(n => n.id);
    expect(order).toEqual(['start', 'branch', 'shape-a', 'store', 'done', 'shape-b']);
  });

  it('returns [] for an unknown start', () => {
    expect(traceFrom(twoModules(), 'ghost')).toEqual([]);
  });

  it('does not follow an Edge to a Contract', () => {
    const order = traceFrom(twoModules(), 'start').map(n => n.id);
    expect(order).not.toContain('snapshot');
  });
});

describe('resumeContract', () => {
  it('derives the Contract connected to the Module passed to', () => {
    const contract = resumeContract(twoModules(), 'store');
    expect(contract?.id).toBe('snapshot');
  });

  it('returns undefined when the target Module has no Contract connected', () => {
    const doc = twoModules();
    doc.edges = doc.edges.filter(e => e.from !== 'kv');
    expect(resumeContract(doc, 'store')).toBeUndefined();
  });

  it('returns undefined for a non-Pass node', () => {
    expect(resumeContract(twoModules(), 'start')).toBeUndefined();
  });
});

describe('moduleManifest', () => {
  it('reports the passes leaving a Module subtree with derived resume Contracts', () => {
    const manifest = moduleManifest(twoModules(), 'worker');
    expect(manifest.passes).toEqual([{ node: 'store', to: 'kv', resumeContract: 'snapshot' }]);
  });

  it('reports outbound edges and their Contract targets', () => {
    const manifest = moduleManifest(twoModules(), 'kv');
    expect(manifest.outbound).toEqual([{ from: 'kv', to: 'snapshot' }]);
    expect(manifest.contracts).toEqual(['snapshot']);
  });

  it('keeps a pass inside the subtree out of the manifest', () => {
    const manifest = moduleManifest(twoModules(), 'feed-poller');
    expect(manifest.passes).toEqual([{ node: 'store', to: 'kv', resumeContract: 'snapshot' }]);
    const worker = moduleManifest(twoModules(), 'worker');
    expect(worker.outbound).toEqual([]);
  });
});

describe('KIND_DESCRIPTORS', () => {
  it('every descriptor satisfies the descriptor shape with a glyph id', () => {
    for (const descriptor of KIND_DESCRIPTORS as readonly KindDescriptor[]) {
      expect(descriptor.kind.length).toBeGreaterThan(0);
      expect(descriptor.term.length).toBeGreaterThan(0);
      expect(descriptor.gloss.length).toBeGreaterThan(0);
      expect(descriptor.glyph.length).toBeGreaterThan(0);
    }
  });
});
