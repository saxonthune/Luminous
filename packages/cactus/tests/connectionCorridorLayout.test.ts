import { expect, test } from 'vitest';
import { connectionCorridorLayout } from '../src/connectionCorridorLayout.js';

const states = new Map([
  ['home', { w: 340, h: 77 }],
  ['library', { w: 340, h: 77 }],
  ['details', { w: 340, h: 77 }],
]);
const connection = (id: string, source: string, target: string, ordering = true) => ({ id, source, target, ordering, w: 144, h: 44 });

test('parallel and reverse transitions reserve a shared corridor before placing states', async () => {
  const result = await connectionCorridorLayout(states, [
    connection('open', 'home', 'library'),
    connection('back', 'library', 'home', false),
    connection('alternative', 'library', 'home', false),
    connection('details-open', 'library', 'details'),
    connection('details-close', 'details', 'library', false),
  ]);
  const p = result.positions;
  expect(p.get('home')!.x + 340).toBeLessThan(p.get('open')!.x);
  expect(p.get('open')!.x + 144).toBeLessThan(p.get('library')!.x);
  expect(p.get('open')!.x).toBe(p.get('back')!.x);
  expect(p.get('back')!.y - p.get('open')!.y).toBe(64);
  expect(p.get('alternative')!.y - p.get('back')!.y).toBe(64);
  const rects = [...p].map(([id, point]) => ({ ...point, ...result.sizes.get(id)! }));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(false);
  }
});

test('top-down layouts separate forward and return lanes horizontally', async () => {
  const result = await connectionCorridorLayout(new Map([...states].slice(0, 2)), [
    connection('open', 'home', 'library'), connection('back', 'library', 'home', false),
  ], 'DOWN');
  expect(result.positions.get('back')!.x - result.positions.get('open')!.x).toBe(164);
  expect(result.positions.get('open')!.y).toBe(result.positions.get('back')!.y);
});

test('ordering cycles require the caller to identify return links', async () => {
  await expect(connectionCorridorLayout(new Map([...states].slice(0, 2)), [
    connection('open', 'home', 'library'), connection('back', 'library', 'home'),
  ])).rejects.toThrow('Forward connection graph contains a cycle');
});

test('two disconnected trees stack vertically using their complete bounds', async () => {
  const result = await connectionCorridorLayout(new Map([
    ['a', { w: 340, h: 77 }], ['b', { w: 340, h: 77 }],
    ['usage-a', { w: 520, h: 300 }], ['usage-b', { w: 520, h: 500 }],
  ]), [
    connection('go', 'a', 'b'), connection('back', 'b', 'a', false),
    connection('usage-go', 'usage-a', 'usage-b'), connection('usage-back', 'usage-b', 'usage-a', false),
  ]);
  const upper = ['a', 'b', 'go', 'back'];
  const lower = ['usage-a', 'usage-b', 'usage-go', 'usage-back'];
  const bottom = Math.max(...upper.map(id => result.positions.get(id)!.y + result.sizes.get(id)!.h));
  const top = Math.min(...lower.map(id => result.positions.get(id)!.y));
  expect(top - bottom).toBe(160);
});
