import { test, expect } from 'vitest';
import { leadingTreeLayout, visibleTreeLayout } from '../src/leadingTreeLayout';

test('first children align with their parent while later subtrees stay below every descendant', () => {
  const sizes = new Map([['root', { w: 100, h: 40 }], ['first', { w: 80, h: 60 }], ['grandchild', { w: 90, h: 200 }], ['second', { w: 80, h: 50 }]]);
  const children = new Map([['root', ['first', 'second']], ['first', ['grandchild']]]);
  const p = leadingTreeLayout(['root'], children, sizes, { x: 20, y: 10 });
  expect(p.get('root')!.y).toBe(p.get('first')!.y);
  expect(p.get('first')!.y).toBe(p.get('grandchild')!.y);
  expect(p.get('second')!.y).toBeGreaterThanOrEqual(p.get('grandchild')!.y + 210);
  expect(p.get('first')!.x).toBeGreaterThanOrEqual(p.get('root')!.x + 120);
});
test('rejects cycles, reused children and unreachable nodes instead of emitting overlapping geometry', () => {
  const sizes = new Map([['a', { w: 10, h: 10 }], ['b', { w: 10, h: 10 }]]);
  expect(() => leadingTreeLayout(['a'], new Map([['a', ['b']], ['b', ['a']]]), sizes)).toThrow(/acyclic/);
  expect(() => leadingTreeLayout(['a'], new Map([['a', ['b', 'b']]]), sizes)).toThrow(/parentage/);
  expect(() => leadingTreeLayout(['a'], new Map(), sizes)).toThrow(/unreachable/);
});

test('collapse frees subtree demand and expansion restores space without overlapping later branches', () => {
  const sizes = new Map([['instance', { w: 100, h: 50 }], ['reading', { w: 100, h: 50 }], ['conversation', { w: 100, h: 70 }], ['turn', { w: 100, h: 180 }], ['commentary', { w: 100, h: 160 }], ['researcher', { w: 100, h: 60 }]]);
  const children = new Map([['instance', ['reading', 'researcher']], ['reading', ['conversation', 'commentary']], ['conversation', ['turn']]]);
  const expanded = visibleTreeLayout(['instance'], children, sizes, new Set());
  const collapsed = visibleTreeLayout(['instance'], children, sizes, new Set(['reading']));
  expect(collapsed.has('conversation')).toBe(false);
  expect(collapsed.get('researcher')!.y).toBe(66);
  expect(expanded.get('researcher')!.y).toBe(372);
  expect(collapsed.get('reading')).toEqual(expanded.get('reading'));
  const nested = visibleTreeLayout(['instance'], children, sizes, new Set(['conversation']));
  expect(nested.has('turn')).toBe(false);
  expect(nested.get('commentary')!.y).toBe(86);
  expect(nested.get('researcher')!.y).toBe(262);
  expect(visibleTreeLayout(['instance'], children, sizes, new Set())).toEqual(expanded);
});
