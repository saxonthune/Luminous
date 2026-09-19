import { expect, it, vi } from 'vitest';
import { memoryNylonHistory, type NylonActionRequest, type NylonActionResponse } from '@luminous/core/nylon/history';
import { createNylonActionController } from '../actionController.ts';

async function harness() {
  const history = memoryNylonHistory({ v: 1,
    transformations: [{ id: 'a', name: 'A', x: 10, y: 20 }], contracts: [], arcs: [] });
  const initial = await history.read();
  const requests: { request: NylonActionRequest; resolve: (value: NylonActionResponse) => void; reject: (error: Error) => void }[] = [];
  const onError = vi.fn();
  const read = vi.fn(() => history.read());
  const onChange = vi.fn();
  const controller = createNylonActionController({ initial, read, onError, onChange,
    send: (request) => new Promise((resolve, reject) => requests.push({ request, resolve, reject })) });
  const ack = async (index: number) => {
    const response = await history.dispatch(requests[index].request);
    requests[index].resolve(response);
    await Promise.resolve();
    return response;
  };
  const x = () => controller.state().snapshot.document.transformations[0].x;
  return { controller, history, initial, requests, onError, onChange, read, ack, x };
}

it('displays multiple moves immediately and sends each once against the preceding confirmed revision', async () => {
  const h = await harness();
  expect(h.controller.dispatch({ op: 'selection.move', ids: ['a'], dx: 5, dy: 0 })).toBe(true);
  expect(h.x()).toBe(15);
  expect(h.controller.dispatch({ op: 'selection.move', ids: ['a'], dx: 8, dy: 0 })).toBe(true);
  expect(h.x()).toBe(23);
  const displayRevision = h.controller.state().snapshot.revision;
  expect(h.requests).toHaveLength(1);
  const first = await h.ack(0);
  expect(h.requests).toHaveLength(2);
  expect(h.x()).toBe(23);
  expect(h.controller.state().snapshot.revision).toBe(displayRevision);
  if (first.ok) expect(h.requests[1].request.baseRevision).toBe(first.snapshot.revision);
  await h.ack(1);
  expect(h.x()).toBe(23);
  expect(h.controller.state().saving).toBe(false);
  expect(h.onError).not.toHaveBeenCalled();
  expect((await h.history.read()).undo).toHaveLength(2);
});

it('previews differentiation, layout, undo and redo through the same queue', async () => {
  const h = await harness();
  h.controller.dispatch({ op: 'differentiate', id: 'a' });
  const differentiated = h.controller.state().snapshot.document;
  expect(differentiated.transformations).toHaveLength(3);
  h.controller.dispatch({ op: 'layout.dag', id: 'a', direction: 'TD' });
  const layout = h.controller.state().snapshot.document;
  expect(layout).not.toEqual(differentiated);
  h.controller.dispatch({ op: 'undo' });
  expect(h.controller.state().snapshot.document).toEqual(differentiated);
  h.controller.dispatch({ op: 'redo' });
  expect(h.controller.state().snapshot.document).toEqual(layout);
  for (let index = 0; index < 4; index++) await h.ack(index);
  expect(h.controller.state().snapshot.document).toEqual(layout);
  expect(h.onError).not.toHaveBeenCalled();
});

it('can optimistically undo pre-existing CLI history immediately after opening a document', async () => {
  const h = await harness();
  await h.history.dispatch({ actionId: 'cli', baseRevision: h.initial.revision, origin: 'cli',
    action: { op: 'node.move', id: 'a', dx: 100, dy: 0 } });
  await h.controller.refresh();
  expect(h.x()).toBe(110);
  h.controller.dispatch({ op: 'undo' });
  expect(h.x()).toBe(10);
  h.controller.dispatch({ op: 'redo' });
  expect(h.x()).toBe(110);
  await h.ack(0);
  await h.ack(1);
  expect(h.onError).not.toHaveBeenCalled();
});

it('discards dependent queued previews on a conflict and refreshes without replaying them', async () => {
  const h = await harness();
  h.controller.dispatch({ op: 'node.move', id: 'a', dx: 10, dy: 0 });
  h.controller.dispatch({ op: 'differentiate', id: 'a' });
  await h.history.dispatch({ actionId: 'external', baseRevision: h.initial.revision, origin: 'cli',
    action: { op: 'node.update', id: 'a', patch: { name: 'External' } } });
  await h.ack(0);
  await vi.waitFor(() => expect(h.controller.state().refreshing).toBe(false));
  expect(h.requests).toHaveLength(1);
  expect(h.controller.state().snapshot.document).toEqual((await h.history.read()).document);
  expect(h.controller.state().snapshot.document.transformations).toHaveLength(1);
  expect(h.onError).toHaveBeenCalled();
});

it('does not overwrite pending previews with own notifications or unchanged confirmations during a new gesture', async () => {
  const h = await harness();
  h.controller.dispatch({ op: 'node.move', id: 'a', dx: 10, dy: 0 });
  const gestureRevision = h.controller.state().snapshot.revision;
  h.controller.changed('next', h.requests[0].request.actionId);
  expect(h.read).not.toHaveBeenCalled();
  await h.ack(0);
  expect(h.controller.dispatch({ op: 'node.move', id: 'a', dx: 20, dy: 0 }, gestureRevision)).toBe(true);
  expect(h.x()).toBe(40);
  await h.ack(1);
  expect(h.onError).not.toHaveBeenCalled();
});

it('rejects a gesture based on a display that has since changed', async () => {
  const h = await harness();
  h.controller.dispatch({ op: 'node.move', id: 'a', dx: 1, dy: 0 });
  expect(h.controller.dispatch({ op: 'node.move', id: 'a', dx: 99, dy: 0 }, h.initial.revision)).toBe(false);
  expect(h.x()).toBe(11);
  await h.ack(0);
});

it('blocks further actions after an unconfirmed save and failed refresh, then recovers explicitly', async () => {
  const h = await harness();
  h.controller.dispatch({ op: 'node.move', id: 'a', dx: 10, dy: 0 });
  h.read.mockRejectedValueOnce(new Error('Offline'));
  h.requests[0].reject(new Error('Response lost'));
  await vi.waitFor(() => expect(h.controller.state().blocked).toBe(true));
  expect(h.controller.dispatch({ op: 'node.move', id: 'a', dx: 1, dy: 0 })).toBe(false);
  await h.controller.refresh();
  expect(h.controller.state().blocked).toBe(false);
  expect(h.x()).toBe(10);
});

it('drops queued actions when a retry returns divergent authoritative history', async () => {
  const h = await harness();
  h.controller.dispatch({ op: 'node.move', id: 'a', dx: 10, dy: 0 });
  h.controller.dispatch({ op: 'undo' });
  const applied = await h.history.dispatch(h.requests[0].request);
  if (!applied.ok) throw new Error(applied.error);
  h.requests[0].resolve({ ...applied, snapshot: { ...applied.snapshot, undo: [] }, replayed: true });
  await vi.waitFor(() => expect(h.controller.state().saving).toBe(false));
  expect(h.requests).toHaveLength(1);
  expect(h.onError).toHaveBeenCalled();
});

it('ignores late responses after disposal', async () => {
  const h = await harness();
  h.controller.dispatch({ op: 'node.move', id: 'a', dx: 10, dy: 0 });
  h.controller.dispose();
  h.onChange.mockClear();
  await h.ack(0);
  expect(h.onChange).not.toHaveBeenCalled();
  expect(h.controller.dispatch({ op: 'undo' })).toBe(false);
});

it('finishes already accepted queued saves after the view detaches', async () => {
  const h = await harness();
  h.controller.dispatch({ op: 'node.move', id: 'a', dx: 10, dy: 0 });
  h.controller.dispatch({ op: 'node.move', id: 'a', dx: 20, dy: 0 });
  h.controller.dispose();
  h.onChange.mockClear();
  await h.ack(0);
  expect(h.requests).toHaveLength(2);
  await h.ack(1);
  expect((await h.history.read()).document.transformations[0].x).toBe(40);
  expect(h.onChange).not.toHaveBeenCalled();
});
