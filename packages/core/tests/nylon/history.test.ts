// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { memoryNylonHistory, NylonHistory, type NylonActionRequest } from '../../src/nylon/history.ts';
import { executeNylonAction, type NylonAction } from '../../src/nylon/actions.ts';
import type { NylonDocument } from '../../src/nylon/types.ts';

const document = (): NylonDocument => ({
  v: 1,
  transformations: [{ id: 'parent', name: 'Parent' }, { id: 'a', name: 'A', parent: 'parent', x: 450, y: 150 }],
  contracts: [{ id: 'c', name: 'C', parent: 'parent', x: 40, y: 100 }],
  arcs: [{ from: 'a', to: 'c' }],
});
async function run(history: NylonHistory, action: NylonAction, origin: 'ui' | 'cli' = 'ui') {
  const { revision } = await history.read();
  const result = await history.dispatch({ actionId: crypto.randomUUID(), baseRevision: revision, origin, action });
  if (!result.ok) throw new Error(result.error);
  return result.snapshot;
}

describe('Nylon action history', () => {
  it('restores exact DAG and Space results across shared UI/CLI undo and redo', async () => {
    const history = memoryNylonHistory(document());
    const initial = await history.read();
    const dag = await run(history, { op: 'layout.dag', id: 'parent', direction: 'TD' }, 'cli');
    expect(dag.document).not.toEqual(initial.document);
    expect(dag.undo.at(-1)).toMatchObject({ origin: 'cli', label: 'DAG layout' });
    expect((await run(history, { op: 'undo' })).document).toEqual(initial.document);
    expect((await run(history, { op: 'redo' })).document).toEqual(dag.document);
    const spaced = await run(history, { op: 'layout.space', id: 'parent' });
    if (spaced.undo.length > dag.undo.length) {
      expect((await run(history, { op: 'undo' })).document).toEqual(dag.document);
      expect((await run(history, { op: 'redo' })).document).toEqual(spaced.document);
    }
  });

  it('undoes a batch, reparenting, and differentiation without losing IDs or Arcs', async () => {
    const history = memoryNylonHistory(document());
    const initial = await history.read();
    const differentiated = await run(history, { op: 'differentiate', id: 'a' });
    expect(differentiated.undo).toHaveLength(1);
    expect((await run(history, { op: 'undo' })).document).toEqual(initial.document);
    expect((await run(history, { op: 'redo' })).document).toEqual(differentiated.document);
    const moved = await run(history, { op: 'node.reparent', id: 'c', parent: null });
    expect((await run(history, { op: 'undo' })).document).toEqual(differentiated.document);
    expect((await run(history, { op: 'redo' })).document).toEqual(moved.document);
    const batch = await run(history, { op: 'batch', operations: [
      { op: 'node.add', nodeKind: 'transformation', node: { id: 'new', name: 'New' } },
      { op: 'node.move', id: 'new', dx: 100, dy: 200 },
    ] });
    expect(batch.undo).toHaveLength(moved.undo.length + 1);
    expect((await run(history, { op: 'undo' })).document).toEqual(moved.document);
    expect((await run(history, { op: 'redo' })).document).toEqual(batch.document);
  });

  it('serializes concurrent callers and recognizes retries before checking stale revisions', async () => {
    const history = memoryNylonHistory(document());
    const { revision } = await history.read();
    const request: NylonActionRequest = { actionId: 'move', baseRevision: revision, origin: 'ui',
      action: { op: 'node.move', id: 'a', dx: 100, dy: 0 } };
    const [first, repeated, stale] = await Promise.all([
      history.dispatch(request), history.dispatch(request), history.dispatch({ ...request, actionId: 'other', origin: 'cli' }),
    ]);
    expect(first.ok).toBe(true);
    expect(repeated).toMatchObject({ ok: true, replayed: true });
    expect(stale).toMatchObject({ ok: false, conflict: true });
    expect((await history.read()).undo).toHaveLength(1);
    expect(await history.dispatch({ ...request, action: { op: 'undo' } })).toMatchObject({ ok: false });
    await run(history, { op: 'undo' });
    const replay = await history.dispatch(request);
    expect(replay).toMatchObject({ ok: true, replayed: true, snapshot: { document: document() } });
  });

  it('does not commit dry runs, invalid actions, no-ops, or failed storage writes', async () => {
    const initial = JSON.stringify(document());
    let text = initial;
    let refuse = true;
    const history = new NylonHistory({ read: async () => text, write: async (next) => {
      if (refuse) throw new Error('Disk full');
      text = next;
    } });
    const before = await history.read();
    const request: NylonActionRequest = { actionId: 'test', baseRevision: before.revision, origin: 'api',
      action: { op: 'node.move', id: 'a', dx: 10, dy: 0 } };
    expect(await history.dispatch({ ...request, dryRun: true })).toMatchObject({ ok: true });
    expect(await history.read()).toEqual(before);
    expect(await history.dispatch(request)).toMatchObject({ ok: false, error: 'Disk full' });
    expect(await history.read()).toEqual(before);
    refuse = false;
    expect(await history.dispatch(request)).toMatchObject({ ok: true });
    const changed = await history.read();
    await run(history, { op: 'node.move', id: 'a', dx: 0, dy: 0 });
    expect(await history.read()).toEqual(changed);
    const failed = await history.dispatch({ ...request, actionId: 'bad', baseRevision: changed.revision,
      action: { op: 'batch', operations: [
        { op: 'node.move', id: 'a', dx: 10, dy: 0 },
        { op: 'node.move', id: 'missing', dx: 10, dy: 0 },
      ] } });
    expect(failed.ok).toBe(false);
    expect(await history.read()).toEqual(changed);
  });

  it('clears both history branches on external edits, including invalid files', async () => {
    let text = JSON.stringify(document());
    const history = new NylonHistory({ read: async () => text, write: async (next) => { text = next; } });
    await run(history, { op: 'node.move', id: 'a', dx: 100, dy: 0 });
    const undone = await run(history, { op: 'undo' });
    text += ' ';
    const external = await history.read();
    expect(external.revision).not.toBe(undone.revision);
    expect(external.undo).toEqual([]);
    expect(external.redo).toEqual([]);
    await run(history, { op: 'node.move', id: 'a', dx: 100, dy: 0 });
    text = '{';
    await expect(history.read()).rejects.toThrow();
    text = JSON.stringify(document());
    expect((await history.read()).undo).toEqual([]);
  });

  it('bounds history and discards redo after a new change', async () => {
    let text = JSON.stringify(document());
    const history = new NylonHistory({ read: async () => text, write: async (next) => { text = next; } }, 2);
    for (let i = 0; i < 3; i++) await run(history, { op: 'node.move', id: 'a', dx: 1, dy: 0 });
    expect((await history.read()).undo).toHaveLength(2);
    await run(history, { op: 'undo' });
    expect((await run(history, { op: 'node.update', id: 'a', patch: { name: 'Changed' } })).redo).toEqual([]);
  });

  it('uses explicit covered/collapsed geometry identically for all callers', async () => {
    const doc = document();
    doc.transformations.push({ id: 'inner', name: 'Inner', parent: 'a', x: 400, y: 100 });
    doc.arcs[0].from = 'inner';
    const action: NylonAction = { op: 'layout.dag', id: 'parent', direction: 'LR', context: { covered: ['a'] } };
    const expected = executeNylonAction(doc, action);
    expect(expected.ok).toBe(true);
    const actual = await run(memoryNylonHistory(doc), action, 'cli');
    if (expected.ok) expect(actual.document).toEqual(expected.doc);
    expect(executeNylonAction(doc, { ...action, context: { covered: ['a'], collapsed: ['a'] } }).ok).toBe(false);
  });
});
