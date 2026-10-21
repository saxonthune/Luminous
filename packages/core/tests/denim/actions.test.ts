// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  addDenimNode,
  getDenimGraph,
  openDenimDatabase,
} from '../../src/denim/database.ts';
import {
  applyDenimAction,
  DENIM_ACTION_CATALOG,
  readDenimSnapshot,
} from '../../src/denim/actions.ts';

const wasmBinary = new Uint8Array(await readFile(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url)));

describe('Denim actions', () => {
  it('applies graph actions and rejects invalid connections', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Journey' });
    addDenimNode(db, { id: 'existing', type: 'Instance', text: 'Existing' });

    const created = applyDenimAction(db, { op: 'journey.create', id: 'second', text: 'Second' });
    const child = applyDenimAction(db, {
      op: 'node.differentiate', parentId: 'journey', id: 'action', edgeId: 'journey-action', text: 'Action',
    });
    const nested = applyDenimAction(db, {
      op: 'node.differentiate', parentId: 'action', id: 'nested', edgeId: 'action-nested', text: 'Nested',
    });
    applyDenimAction(db, { op: 'edge.connect', parentId: 'action', childId: 'existing', edgeId: 'action-existing' });
    applyDenimAction(db, { op: 'node.update', id: 'existing', patch: { type: 'Capability', text: 'Updated' } });

    expect(created.nodeId).toBe('second');
    expect(child.nodeId).toBe('action');
    expect(nested.nodeId).toBe('nested');
    expect(getDenimGraph(db)).toMatchObject({
      nodes: [
        { id: 'journey', type: 'Journey', text: 'Journey' },
        { id: 'existing', type: 'Capability', text: 'Updated' },
        { id: 'second', type: 'Journey', text: 'Second' },
        { id: 'action', type: 'Journey', text: 'Action' },
        { id: 'nested', type: 'Journey', text: 'Nested' },
      ],
      edges: [
        { id: 'journey-action', sourceId: 'journey', targetId: 'action' },
        { id: 'action-nested', sourceId: 'action', targetId: 'nested' },
        { id: 'action-existing', sourceId: 'action', targetId: 'existing' },
      ],
    });
    expect(() => applyDenimAction(db, { op: 'edge.connect', parentId: 'journey', childId: 'action' }))
      .toThrow(/already connected/);
    expect(() => applyDenimAction(db, { op: 'edge.connect', parentId: 'existing', childId: 'journey' }))
      .toThrow(/cycle/);
    db.close();
  });

  it('implements both delete scopes and repairs saved board references', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Journey' });
    applyDenimAction(db, { op: 'node.differentiate', parentId: 'journey', id: 'parent', edgeId: 'j-p', text: 'Parent' });
    applyDenimAction(db, { op: 'node.differentiate', parentId: 'parent', id: 'child', edgeId: 'p-c', text: 'Child' });
    addDenimNode(db, { id: 'other-journey', type: 'Journey', text: 'Other Journey' });
    applyDenimAction(db, { op: 'node.differentiate', parentId: 'other-journey', id: 'other-child', edgeId: 'oj-oc', text: 'Other Child' });
    const opened = applyDenimAction(db, { op: 'board.openJourney', journeyId: 'journey', boardId: 'journey-board' });

    applyDenimAction(db, { op: 'node.delete', id: 'parent', scope: 'node' });
    expect(getDenimGraph(db).nodes.map((node) => node.id)).toEqual(['journey', 'child', 'other-journey', 'other-child']);
    expect(getDenimGraph(db).edges.map((edge) => edge.id)).toEqual(['oj-oc']);
    expect(readDenimSnapshot(db).boards.find((board) => board.id === opened.boardId)?.loadedNodeIds).toContain('child');

    applyDenimAction(db, { op: 'node.delete', id: 'journey', scope: 'subtree' });
    expect(getDenimGraph(db).nodes.map((node) => node.id)).toEqual(['child', 'other-journey', 'other-child']);
    applyDenimAction(db, { op: 'node.delete', id: 'other-journey', scope: 'subtree' });
    expect(getDenimGraph(db).nodes.map((node) => node.id)).toEqual(['child']);
    expect(readDenimSnapshot(db).boards.map((board) => board.id)).toEqual([
      'pinned:journeys', 'pinned:capabilities', 'pinned:instances',
    ]);
    db.close();
  });

  it('deletes a single edge and preserves both endpoint Nodes', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'parent', type: 'Journey', text: 'Parent' });
    addDenimNode(db, { id: 'child', type: 'User Action', text: 'Child' });
    applyDenimAction(db, { op: 'edge.connect', parentId: 'parent', childId: 'child', edgeId: 'parent-child' });

    expect(applyDenimAction(db, { op: 'edge.delete', edgeId: 'parent-child' })).toMatchObject({ changed: true });
    expect(getDenimGraph(db)).toEqual({
      nodes: [
        { id: 'parent', type: 'Journey', text: 'Parent' },
        { id: 'child', type: 'User Action', text: 'Child' },
      ],
      edges: [],
    });
    expect(() => applyDenimAction(db, { op: 'edge.delete', edgeId: 'missing' })).toThrow(/Edge not found/);
    db.close();
  });

  it('applies board and sequence actions and reports the graph with available boards', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Journey' });
    addDenimNode(db, { id: 'a', type: 'User Action', text: 'A' });
    addDenimNode(db, { id: 'b', type: 'User Action', text: 'B' });
    addDenimNode(db, { id: 'resource', type: 'Instance', text: 'Instance' });
    applyDenimAction(db, { op: 'edge.connect', parentId: 'journey', childId: 'a', edgeId: 'j-a' });
    applyDenimAction(db, { op: 'edge.connect', parentId: 'journey', childId: 'b', edgeId: 'j-b' });
    applyDenimAction(db, { op: 'sequence.initialize', parentId: 'journey', orderedChildIds: ['b', 'a'] });
    applyDenimAction(db, { op: 'edge.priority.set', edgeId: 'j-a', priority: 7.5 });
    applyDenimAction(db, { op: 'board.node.load.set', boardId: 'pinned:journeys', nodeId: 'resource', loaded: true });
    applyDenimAction(db, { op: 'board.node.move', boardId: 'pinned:journeys', nodeId: 'resource', position: { x: 60, y: 90 } });
    applyDenimAction(db, { op: 'board.sequenceMode.set', boardId: 'pinned:journeys', parentId: 'journey', mode: 'priority' });
    const opened = applyDenimAction(db, { op: 'board.openJourney', journeyId: 'journey', boardId: 'journey-board' });

    const snapshot = readDenimSnapshot(db);
    const journeys = snapshot.boards.find((board) => board.id === 'pinned:journeys')!;
    expect(journeys.loadedNodeIds).toContain('resource');
    expect(journeys.positions.resource).toEqual({ x: 60, y: 90 });
    expect(journeys.sequenceModes.journey).toBe('priority');
    expect(snapshot.graph.edges.find((edge) => edge.id === 'j-a')?.priority).toBe(7.5);
    expect(opened.boardId).toBe('journey-board');

    applyDenimAction(db, { op: 'sequence.clear', parentId: 'journey' });
    expect(getDenimGraph(db).edges.every((edge) => edge.priority === null)).toBe(true);
    applyDenimAction(db, { op: 'board.close', boardId: 'journey-board' });
    expect(readDenimSnapshot(db).boards.some((board) => board.id === 'journey-board')).toBe(false);
    expect(() => applyDenimAction(db, { op: 'board.close', boardId: 'pinned:journeys' })).toThrow(/Pinned/);
    db.close();
  });

  it('publishes a discoverable catalog for the full action vocabulary', () => {
    expect(DENIM_ACTION_CATALOG.map(({ op }) => op)).toEqual([
      'journey.create', 'node.type.create', 'node.type.rename', 'node.create', 'node.upsert', 'edge.upsert',
      'node.differentiate', 'edge.connect', 'edge.delete', 'container.attach', 'container.detach', 'container.create',
      'node.update', 'node.delete', 'edge.priority.set', 'sequence.initialize', 'sequence.clear', 'sequence.node.move', 'sequence.node.insertAfter',
      'sequenceContainer.create', 'sequenceContainer.presentation.set', 'board.read', 'board.create',
      'board.container.move', 'board.container.resize', 'container.node.create', 'container.nodes.create',
      'board.sequenceMode.set', 'board.node.load.set', 'board.node.move', 'board.nodes.move',
      'board.openJourney', 'board.close',
    ]);
  });
});
