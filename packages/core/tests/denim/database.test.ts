// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  addDenimEdge, addDenimNode, exportDenimDatabase, getDenimGraph,
  createDenimChild, getJourneyGraph, listJourneys, listTopLevelResources, openDenimDatabase,
  PARENT_CHILD, updateDenimNode,
  seedDenimDatabase,
} from '../../src/denim/database.ts';

const wasmBinary = new Uint8Array(await readFile(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url)));

describe('Denim SQLite database', () => {
  it('stores an open node and edge graph and permits type labels to change', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    addDenimNode(db, { id: 'action', type: 'Action', text: 'Create a journey' });
    addDenimEdge(db, { id: 'contains-action', type: PARENT_CHILD, sourceId: 'journey', targetId: 'action' });
    updateDenimNode(db, 'action', { type: 'Step' });

    expect(getJourneyGraph(db, 'journey')).toEqual({
      nodes: [
        { id: 'journey', type: 'Journey', text: 'Build a journey' },
        { id: 'action', type: 'Step', text: 'Create a journey' },
      ],
      edges: [{ id: 'contains-action', type: PARENT_CHILD, sourceId: 'journey', targetId: 'action' }],
    });

    const reopened = await openDenimDatabase(exportDenimDatabase(db), wasmBinary);
    expect(getDenimGraph(reopened)).toEqual(getDenimGraph(db));
  });

  it('finds resources without a Resource parent and rejects parent cycles', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'hosting', type: 'Resource', text: 'Hosting' });
    addDenimNode(db, { id: 'worker', type: 'Resource', text: 'Worker' });
    addDenimEdge(db, { id: 'hosting-worker', type: PARENT_CHILD, sourceId: 'hosting', targetId: 'worker' });
    expect(listTopLevelResources(db).map((node) => node.id)).toEqual(['hosting']);
    expect(() => addDenimEdge(db, { id: 'worker-hosting', type: PARENT_CHILD, sourceId: 'worker', targetId: 'hosting' })).toThrow(/cycle/);
  });

  it('rolls back a differentiated node when its parent edge cannot be inserted', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Build a journey' });

    expect(() => createDenimChild(db, 'missing-parent', { id: 'child', type: 'Action', text: 'Child' }, 'edge'))
      .toThrow();
    expect(getDenimGraph(db)).toEqual({
      nodes: [{ id: 'journey', type: 'Journey', text: 'Build a journey' }],
      edges: [],
    });
  });

  it('seeds a new database with the starter Journey and Action', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    seedDenimDatabase(db);

    expect(listJourneys(db)).toEqual([
      { id: 'a-user-builds-a-journey', type: 'Journey', text: 'A user builds a journey' },
    ]);
    expect(getJourneyGraph(db, 'a-user-builds-a-journey')).toEqual({
      nodes: [
        { id: 'a-user-builds-a-journey', type: 'Journey', text: 'A user builds a journey' },
        { id: 'user-creates-a-new-journey', type: 'Action', text: 'User creates a new journey' },
      ],
      edges: [{
        id: 'journey-has-action-user-creates-a-new-journey',
        type: PARENT_CHILD,
        sourceId: 'a-user-builds-a-journey',
        targetId: 'user-creates-a-new-journey',
      }],
    });
  });
});
