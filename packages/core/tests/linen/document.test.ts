import { describe, it, expect } from 'vitest';
import { emptyLinenDocument, parseLinenDocument, serializeLinenDocument } from '../../src/linen/document.ts';
import type { LinenDocument } from '../../src/linen/types.ts';

const fixture: LinenDocument = {
  v: 1,
  modules: [
    { id: 'worker', name: 'Worker' },
    { id: 'feed-poller', name: 'FeedPoller', parent: 'worker' },
    { id: 'kv', name: 'KV' },
  ],
  contracts: [{ id: 'snapshot', name: 'RenderSnapshot', owner: 'kv', text: '{ trains: TrainPose[] }' }],
  nodes: [
    { id: 'alarm', kind: 'entry', module: 'feed-poller', annotation: 'alarm fires' },
    { id: 'guard', kind: 'filter', module: 'feed-poller' },
    { id: 'bail', kind: 'return', module: 'feed-poller' },
    { id: 'store', kind: 'pass', module: 'feed-poller', to: 'kv', x: 10, y: 20 },
    { id: 'shape', kind: 'type', module: 'feed-poller', contract: 'snapshot' },
    { id: 'done', kind: 'release-control', module: 'feed-poller' },
  ],
  edges: [
    { from: 'alarm', to: 'guard' },
    { from: 'guard', to: 'bail' },
    { from: 'guard', to: 'store' },
    { from: 'store', to: 'shape' },
    { from: 'shape', to: 'done' },
    { from: 'kv', to: 'snapshot' },
  ],
};

describe('parseLinenDocument', () => {
  it('round-trips through serialize', () => {
    const text = serializeLinenDocument(fixture);
    const result = parseLinenDocument(text);
    expect(result).toEqual({ ok: true, doc: fixture });
  });

  it('round-trips the empty document', () => {
    const result = parseLinenDocument(serializeLinenDocument(emptyLinenDocument()));
    expect(result).toEqual({ ok: true, doc: emptyLinenDocument() });
  });

  it('rejects an unknown kind, listing the allowed kinds', () => {
    const text = JSON.stringify({
      v: 1,
      modules: [{ id: 'm', name: 'M' }],
      contracts: [],
      nodes: [{ id: 'n', kind: 'widget', module: 'm' }],
      edges: [],
    });
    const result = parseLinenDocument(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some(i => i.includes('nodes[0].kind') && i.includes('entry') && i.includes('release-control'))).toBe(true);
    }
  });

  it('rejects a Pass without "to"', () => {
    const text = JSON.stringify({
      v: 1,
      modules: [{ id: 'm', name: 'M' }],
      contracts: [],
      nodes: [{ id: 'p', kind: 'pass', module: 'm' }],
      edges: [],
    });
    const result = parseLinenDocument(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].to: must be a string');
  });

  it('rejects "to" on a non-Pass node', () => {
    const text = JSON.stringify({
      v: 1,
      modules: [{ id: 'm', name: 'M' }],
      contracts: [],
      nodes: [{ id: 'n', kind: 'switch', module: 'm', to: 'm' }],
      edges: [],
    });
    const result = parseLinenDocument(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].to: only a Pass names a Module passed to');
  });

  it('rejects an id shared between a module and a node', () => {
    const text = JSON.stringify({
      v: 1,
      modules: [{ id: 'x', name: 'M' }],
      contracts: [],
      nodes: [{ id: 'x', kind: 'entry', module: 'x' }],
      edges: [],
    });
    const result = parseLinenDocument(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(i => i.includes('duplicate id "x"'))).toBe(true);
  });

  it('rejects an edge referencing an unknown id', () => {
    const text = JSON.stringify({
      v: 1,
      modules: [{ id: 'm', name: 'M' }],
      contracts: [],
      nodes: [{ id: 'n', kind: 'entry', module: 'm' }],
      edges: [{ from: 'n', to: 'ghost' }],
    });
    const result = parseLinenDocument(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('edges[0].to: references unknown id "ghost"');
  });

  it('rejects a module parent cycle', () => {
    const text = JSON.stringify({
      v: 1,
      modules: [
        { id: 'a', name: 'A', parent: 'b' },
        { id: 'b', name: 'B', parent: 'a' },
      ],
      contracts: [],
      nodes: [],
      edges: [],
    });
    const result = parseLinenDocument(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(i => i.includes('module parent cycle'))).toBe(true);
  });

  it('rejects an unsupported version', () => {
    const result = parseLinenDocument(JSON.stringify({ v: 99, modules: [], contracts: [], nodes: [], edges: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('v: unsupported version 99 (current is 1)');
  });
});
