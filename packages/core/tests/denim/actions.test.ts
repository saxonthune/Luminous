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
    addDenimNode(db, { id: 'existing', type: 'Resource', text: 'Existing' });

    const created = applyDenimAction(db, { op: 'journey.create', id: 'second', text: 'Second' });
    const child = applyDenimAction(db, {
      op: 'node.differentiate', parentId: 'journey', id: 'action', edgeId: 'journey-action', text: 'Action',
    });
    applyDenimAction(db, { op: 'edge.connect', parentId: 'action', childId: 'existing', edgeId: 'action-existing' });
    applyDenimAction(db, { op: 'node.update', id: 'existing', patch: { type: 'Capability', text: 'Updated' } });

    expect(created.nodeId).toBe('second');
    expect(child.nodeId).toBe('action');
    expect(getDenimGraph(db)).toMatchObject({
      nodes: [
        { id: 'journey', type: 'Journey', text: 'Journey' },
        { id: 'existing', type: 'Capability', text: 'Updated' },
        { id: 'second', type: 'Journey', text: 'Second' },
        { id: 'action', type: 'Action', text: 'Action' },
      ],
      edges: [
        { id: 'journey-action', sourceId: 'journey', targetId: 'action' },
        { id: 'action-existing', sourceId: 'action', targetId: 'existing' },
      ],
    });
    expect(() => applyDenimAction(db, { op: 'edge.connect', parentId: 'journey', childId: 'action' }))
      .toThrow(/already connected/);
    expect(() => applyDenimAction(db, { op: 'edge.connect', parentId: 'existing', childId: 'journey' }))
      .toThrow(/cycle/);
    db.close();
  });

  it('implements both delete scopes and repairs saved view references', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Journey' });
    applyDenimAction(db, { op: 'node.differentiate', parentId: 'journey', id: 'parent', edgeId: 'j-p', text: 'Parent' });
    applyDenimAction(db, { op: 'node.differentiate', parentId: 'parent', id: 'child', edgeId: 'p-c', text: 'Child' });
    addDenimNode(db, { id: 'other-journey', type: 'Journey', text: 'Other Journey' });
    applyDenimAction(db, { op: 'node.differentiate', parentId: 'other-journey', id: 'other-child', edgeId: 'oj-oc', text: 'Other Child' });
    const opened = applyDenimAction(db, { op: 'view.openJourney', journeyId: 'journey', tabId: 'journey-view' });

    applyDenimAction(db, { op: 'node.delete', id: 'parent', scope: 'node' });
    expect(getDenimGraph(db).nodes.map((node) => node.id)).toEqual(['journey', 'child', 'other-journey', 'other-child']);
    expect(getDenimGraph(db).edges.map((edge) => edge.id)).toEqual(['oj-oc']);
    expect(readDenimSnapshot(db).views.find((view) => view.id === opened.tabId)?.includedNodeIds).toContain('child');

    applyDenimAction(db, { op: 'node.delete', id: 'journey', scope: 'subtree' });
    expect(getDenimGraph(db).nodes.map((node) => node.id)).toEqual(['child', 'other-journey', 'other-child']);
    applyDenimAction(db, { op: 'node.delete', id: 'other-journey', scope: 'subtree' });
    expect(getDenimGraph(db).nodes.map((node) => node.id)).toEqual(['child']);
    expect(readDenimSnapshot(db).views.map((view) => view.id)).toEqual([
      'pinned:journeys', 'pinned:capabilities', 'pinned:resources',
    ]);
    db.close();
  });

  it('applies view and sequence actions and reports the graph with available views', async () => {
    const db = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(db, { id: 'journey', type: 'Journey', text: 'Journey' });
    addDenimNode(db, { id: 'a', type: 'Action', text: 'A' });
    addDenimNode(db, { id: 'b', type: 'Action', text: 'B' });
    addDenimNode(db, { id: 'resource', type: 'Resource', text: 'Resource' });
    applyDenimAction(db, { op: 'edge.connect', parentId: 'journey', childId: 'a', edgeId: 'j-a' });
    applyDenimAction(db, { op: 'edge.connect', parentId: 'journey', childId: 'b', edgeId: 'j-b' });
    applyDenimAction(db, { op: 'sequence.initialize', parentId: 'journey', orderedChildIds: ['b', 'a'] });
    applyDenimAction(db, { op: 'edge.priority.set', edgeId: 'j-a', priority: 7.5 });
    applyDenimAction(db, { op: 'view.includeNode', tabId: 'pinned:journeys', nodeId: 'resource' });
    applyDenimAction(db, { op: 'view.node.move', tabId: 'pinned:journeys', nodeId: 'resource', position: { x: 60, y: 90 } });
    applyDenimAction(db, { op: 'view.sequenceMode.set', tabId: 'pinned:journeys', parentId: 'journey', mode: 'priority' });
    const opened = applyDenimAction(db, { op: 'view.openJourney', journeyId: 'journey', tabId: 'journey-view' });

    const snapshot = readDenimSnapshot(db);
    const journeys = snapshot.views.find((view) => view.id === 'pinned:journeys')!;
    expect(journeys.includedNodeIds).toContain('resource');
    expect(journeys.positions.resource).toEqual({ x: 60, y: 90 });
    expect(journeys.sequenceModes.journey).toBe('priority');
    expect(snapshot.graph.edges.find((edge) => edge.id === 'j-a')?.priority).toBe(7.5);
    expect(opened.tabId).toBe('journey-view');

    applyDenimAction(db, { op: 'sequence.clear', parentId: 'journey' });
    expect(getDenimGraph(db).edges.every((edge) => edge.priority === null)).toBe(true);
    applyDenimAction(db, { op: 'view.close', tabId: 'journey-view' });
    expect(readDenimSnapshot(db).views.some((view) => view.id === 'journey-view')).toBe(false);
    expect(() => applyDenimAction(db, { op: 'view.close', tabId: 'pinned:journeys' })).toThrow(/Pinned/);
    db.close();
  });

  it('publishes a discoverable catalog for the full action vocabulary', () => {
    expect(DENIM_ACTION_CATALOG.map(({ op }) => op)).toEqual([
      'journey.create', 'node.differentiate', 'edge.connect', 'node.update', 'node.delete',
      'edge.priority.set', 'sequence.initialize', 'sequence.clear', 'view.sequenceMode.set',
      'view.includeNode', 'view.node.move', 'view.openJourney', 'view.close',
    ]);
  });
});
