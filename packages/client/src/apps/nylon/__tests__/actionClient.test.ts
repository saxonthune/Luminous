import { afterEach, expect, it, vi } from 'vitest';
import { memoryNylonHistory, type NylonActionRequest } from '@luminous/core/nylon/history';
import { sendNylonAction } from '../actionClient.ts';

afterEach(() => vi.unstubAllGlobals());

it('retries a lost response with identical input without applying the action twice', async () => {
  const session = memoryNylonHistory({ v: 1, transformations: [{ id: 'a', name: 'A' }], contracts: [], arcs: [] });
  const { revision } = await session.read();
  const bodies: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(init.body as string);
    const { path: _path, ...request } = JSON.parse(init.body as string);
    const result = await session.dispatch(request);
    if (bodies.length === 1) throw new TypeError('Response lost after commit');
    return { json: async () => result };
  }));
  const request: NylonActionRequest = { actionId: 'retry', baseRevision: revision, origin: 'ui',
    action: { op: 'node.move', id: 'a', dx: 20, dy: 0 } };
  expect(await sendNylonAction('test.nylon.json', request)).toMatchObject({ ok: true, replayed: true });
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  const next = await session.read();
  expect(next.undo).toHaveLength(1);
  expect(next.document.transformations[0].x).toBe(20);
});

it('does not retry a refused action', async () => {
  const fetcher = vi.fn(async () => ({ json: async () => ({ ok: false, conflict: true, error: 'Refresh' }) }));
  vi.stubGlobal('fetch', fetcher);
  expect(await sendNylonAction('test.nylon.json', { actionId: 'stale', baseRevision: 'old', origin: 'ui', action: { op: 'undo' } }))
    .toMatchObject({ ok: false, conflict: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
