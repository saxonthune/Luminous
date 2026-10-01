// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';
import {
  addDenimEdge, addDenimNode, deleteDenimNode, exportDenimDatabase, getDenimGraph,
  clearDenimSequence, connectDenimChild, createDenimChild, getJourneyGraph, initializeDenimSequence,
  listJourneys, listTopLevelResources, openDenimDatabase,
  PARENT_CHILD, updateDenimEdgePriority, updateDenimNode,
  hydrateDenimDatabase,
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
      edges: [{ id: 'contains-action', type: PARENT_CHILD, sourceId: 'journey', targetId: 'action', priority: null }],
    });

    const reopened = await openDenimDatabase(exportDenimDatabase(db), wasmBinary);
    expect(getDenimGraph(reopened)).toEqual(getDenimGraph(db));
  });

  it('migrates existing databases with unsequenced edges', async () => {
    const SQL = await initSqlJs({ wasmBinary: wasmBinary.slice().buffer as ArrayBuffer });
    const legacy = new SQL.Database();
    legacy.exec(`
      CREATE TABLE nodes (id TEXT PRIMARY KEY, type TEXT NOT NULL, text TEXT NOT NULL);
      CREATE TABLE edges (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE
      );
      INSERT INTO nodes VALUES ('journey', 'Journey', 'Build a journey');
      INSERT INTO nodes VALUES ('action', 'Action', 'Create a journey');
      INSERT INTO edges VALUES ('edge', 'parent-child', 'journey', 'action');
      PRAGMA user_version = 2;
    `);

    const migrated = await openDenimDatabase(legacy.export(), wasmBinary);
    expect(getDenimGraph(migrated).edges).toEqual([{
      id: 'edge', type: PARENT_CHILD, sourceId: 'journey', targetId: 'action', priority: null,
    }]);
    expect(migrated.exec('PRAGMA user_version')[0].values[0][0]).toBe(3);
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

  it('deletes a node and cascades all incident edges', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'parent', type: 'Journey', text: 'Journey' });
    addDenimNode(db, { id: 'target', type: 'Action', text: 'Action' });
    addDenimNode(db, { id: 'other', type: 'Resource', text: 'Resource' });
    addDenimEdge(db, { id: 'incoming', type: PARENT_CHILD, sourceId: 'parent', targetId: 'target' });
    addDenimEdge(db, { id: 'outgoing', type: 'uses', sourceId: 'target', targetId: 'other' });

    deleteDenimNode(db, 'target');

    expect(getDenimGraph(db)).toEqual({
      nodes: [
        { id: 'parent', type: 'Journey', text: 'Journey' },
        { id: 'other', type: 'Resource', text: 'Resource' },
      ],
      edges: [],
    });
  });

  it('updates an edge priority as a safe integer', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Journey' });
    addDenimNode(db, { id: 'action', type: 'Action', text: 'Action' });
    addDenimEdge(db, { id: 'edge', type: PARENT_CHILD, sourceId: 'journey', targetId: 'action' });

    updateDenimEdgePriority(db, 'edge', 12.75);

    expect(getDenimGraph(db).edges[0].priority).toBe(12.75);
    expect(() => updateDenimEdgePriority(db, 'edge', Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });

  it('stores sequence priority on child edges and appends new children to an initialized sequence', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    createDenimChild(db, 'journey', { id: 'first-child', type: 'Action', text: 'First child' }, 'edge-first');
    createDenimChild(db, 'journey', { id: 'second-child', type: 'Action', text: 'Second child' }, 'edge-second');

    expect(getDenimGraph(db).edges.map((edge) => edge.priority)).toEqual([null, null]);
    initializeDenimSequence(db, 'journey', ['second-child', 'first-child']);
    createDenimChild(db, 'journey', { id: 'third-child', type: 'Action', text: 'Third child' }, 'edge-third');
    addDenimNode(db, { id: 'existing', type: 'Action', text: 'Existing action' });
    connectDenimChild(db, 'journey', 'existing', 'edge-existing');

    expect(getDenimGraph(db).edges.map((edge) => [edge.targetId, edge.priority])).toEqual([
      ['first-child', 2], ['second-child', 1], ['third-child', 3], ['existing', 4],
    ]);

    db.run('UPDATE edges SET priority = NULL WHERE id = ?', ['edge-second']);
    expect(() => createDenimChild(db, 'journey', { id: 'rejected-child', type: 'Action', text: 'Rejected' }, 'edge-rejected'))
      .toThrow(/incomplete/);
    expect(getDenimGraph(db).nodes.some((node) => node.id === 'rejected-child')).toBe(false);

    clearDenimSequence(db, 'journey');
    expect(getDenimGraph(db).edges.every((edge) => edge.priority === null)).toBe(true);
  });

  it('hydrates a new database with the starter Journey and Action', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    hydrateDenimDatabase(db);

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
        priority: null,
      }],
    });
  });
});
