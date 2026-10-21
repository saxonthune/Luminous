// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { addDenimNode, createDenimChild, exportDenimDatabase, getDenimGraph, listDenimBoards, openDenimDatabase, putDenimBoard } from '@luminous/core/denim';
import { createDenimSession, DenimPersistenceConflict } from '../DenimSession';

const wasmBinary = new Uint8Array(await readFile(new URL('../../../../../core/node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url)));

describe('DenimSession', () => {
  it('refreshes the active journey projection and saves changes in order', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    const saved: Uint8Array[] = [];
    const session = createDenimSession(database, async (bytes, revision) => {
      saved.push(bytes.slice());
      return `${revision}-next`;
    }, 'r1');

    expect(session.state.graph.nodes.map((node) => node.id)).toEqual(['journey']);
    session.openJourney('journey');
    const childId = await session.differentiate('journey', 'Create the journey');
    expect(childId).toBeTypeOf('string');
    const child = session.state.graph.nodes.find((node) => node.id === childId);
    expect(child).toMatchObject({ type: 'Journey', text: 'Create the journey' });

    await session.updateNode(child!.id, { type: 'Capability' });
    expect(session.state.graph.nodes.find((node) => node.id === child!.id)?.type).toBe('Capability');
    expect(session.state.dirty).toBe(false);
    expect(session.state.saving).toBe(false);
    expect(saved).toHaveLength(3);

    await session.dispose();
  });

  it('keeps edits visible and dirty when file persistence fails', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    const session = createDenimSession(database, async () => { throw new Error('disk is unavailable'); }, 'r1');

    await session.createJourney('Draft');

    expect(session.state.graph.nodes).toMatchObject([{ type: 'Journey', text: 'Draft' }]);
    expect(session.state.dirty).toBe(true);
    expect(session.state.error).toBe('disk is unavailable');
    await expect(session.dispose()).rejects.toThrow(/unsaved changes/);
    await session.discard();
  });

  it('marks a stale file revision as a conflict', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    const session = createDenimSession(database, async () => { throw new DenimPersistenceConflict('Revision changed'); }, 'r1');

    await session.createJourney('Local edit');

    expect(session.state.dirty).toBe(true);
    expect(session.state.conflict).toBe(true);
    expect(session.state.error).toBe('Revision changed');
    await session.discard();
  });

  it('keeps duplicate Journey Boards independent and restores their JSON payloads', async () => {
    let database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    addDenimNode(database, { id: 'extra', type: 'Instance', text: 'Existing API' });
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1', 'tabs-test');

    await session.openJourney('journey');
    const firstId = session.state.activeBoardId;
    await session.openJourney('journey');
    const secondId = session.state.activeBoardId;
    expect(secondId).not.toBe(firstId);
    expect(session.state.boards.filter((board) => board.kind === 'board')).toHaveLength(2);

    session.activateBoard(firstId);
    session.setCamera(firstId, { x: 40, y: 60, k: 1.4 });
    await session.setNodeLoaded('extra', true);
    expect(session.state.graph.nodes.map((node) => node.id)).toContain('extra');
    await session.moveNode('extra', { x: 320, y: 180 });
    expect(session.state.boards.find((board) => board.id === firstId)?.positions.extra).toEqual({ x: 320, y: 180 });

    session.activateBoard(secondId);
    session.setCamera(secondId, { x: -30, y: 10, k: 0.8 });
    expect(session.state.graph.nodes.map((node) => node.id)).not.toContain('extra');
    expect(session.state.boards.find((board) => board.id === secondId)?.positions.extra).toBeUndefined();
    expect(session.state.cameras[firstId]).toEqual({ x: 40, y: 60, k: 1.4 });
    expect(session.state.cameras[secondId]).toEqual({ x: -30, y: 10, k: 0.8 });
    expect(listDenimBoards(database).map((record) => record.id)).toContain(firstId);

    const bytes = exportDenimDatabase(database);
    await session.dispose();
    database = await openDenimDatabase(bytes, wasmBinary);
    const restored = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r2', 'tabs-test');
    expect(restored.state.boards.filter((board) => board.kind === 'board')).toHaveLength(2);
    expect(restored.state.boards.find((board) => board.id === firstId)).toMatchObject({
      sources: [{ kind: 'journey', journeyId: 'journey' }],
      loadedNodeIds: expect.arrayContaining(['extra']),
      positions: { extra: { x: 320, y: 180 } },
    });
    await restored.dispose();
  });

  it('persists a pulled-in node separately from graph connections', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    addDenimNode(database, { id: 'resource', type: 'Instance', text: 'Existing API' });
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1');

    await session.setNodeLoaded('resource', true, 'pinned:journeys');

    expect(session.state.graph.nodes.map((node) => node.id)).toEqual(['journey', 'resource']);
    expect(session.state.graph.edges).toEqual([]);
    expect(listDenimBoards(database)).toHaveLength(1);
    await session.dispose();
  });

  it('deletes a node and removes it from board Board state', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    createDenimChild(database, 'journey', { id: 'action', type: 'User Action', text: 'Create it' }, 'journey-action');
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1');
    await session.openJourney('journey');
    await session.moveNode('action', { x: 120, y: 180 });

    await session.deleteNode('action');

    expect(session.state.graph.nodes.map((node) => node.id)).toEqual(['journey']);
    expect(getDenimGraph(database).edges).toEqual([]);
    expect(session.state.boards.find((board) => board.id === session.state.activeBoardId)?.positions.action).toBeUndefined();
    await session.dispose();
  });

  it('deletes one node while keeping its descendants floating in the active board', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    createDenimChild(database, 'journey', { id: 'action', type: 'User Action', text: 'Create it' }, 'journey-action');
    createDenimChild(database, 'action', { id: 'capability', type: 'Capability', text: 'Persist it' }, 'action-capability');
    createDenimChild(database, 'capability', { id: 'resource', type: 'Instance', text: 'Database' }, 'capability-resource');
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1');
    await session.openJourney('journey');

    await session.deleteNodeOnly('action');

    expect(session.state.graph.nodes.map((node) => node.id)).toEqual(['journey', 'capability', 'resource']);
    expect(session.state.graph.edges.map((edge) => edge.id)).toEqual(['capability-resource']);
    expect(session.state.boards.find((board) => board.id === session.state.activeBoardId)?.loadedNodeIds)
      .toEqual(['capability', 'resource']);
    expect(getDenimGraph(database).nodes.map((node) => node.id)).toEqual(['journey', 'capability', 'resource']);
    await session.dispose();
  });

  it('deletes a node and all descendants through the recursive delete action', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    createDenimChild(database, 'journey', { id: 'action', type: 'User Action', text: 'Create it' }, 'journey-action');
    createDenimChild(database, 'action', { id: 'capability', type: 'Capability', text: 'Persist it' }, 'action-capability');
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1');
    await session.openJourney('journey');

    await session.deleteNode('action');

    expect(session.state.graph.nodes.map((node) => node.id)).toEqual(['journey']);
    expect(getDenimGraph(database).nodes.map((node) => node.id)).toEqual(['journey']);
    await session.dispose();
  });

  it('updates a sequence priority and persists the edge edit', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    createDenimChild(database, 'journey', { id: 'action', type: 'User Action', text: 'Create it' }, 'journey-action');
    const saved: Uint8Array[] = [];
    const session = createDenimSession(database, async (bytes, revision) => {
      saved.push(bytes.slice());
      return `${revision}-next`;
    }, 'r1');
    await session.openJourney('journey');
    saved.length = 0;

    await session.setEdgePriority('journey-action', 7.25);

    expect(session.state.graph.edges[0].priority).toBe(7.25);
    expect(session.state.dirty).toBe(false);
    expect(saved).toHaveLength(1);
    await session.dispose();
  });

  it('composes multiple source queries into one Board projection', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    addDenimNode(database, { id: 'capability', type: 'Capability', text: 'Store journeys' });
    putDenimBoard(database, { id: 'combined', payload: {
      version: 1,
      id: 'combined',
      kind: 'board',
      title: 'Combined board',
      sources: [{ kind: 'journey', journeyId: 'journey' }, { kind: 'capabilities' }],
      positions: {},
      sequenceModes: {},
    } });
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1');

    session.activateBoard('combined');

    expect(session.state.graph.nodes.map((node) => node.id)).toEqual(['journey', 'capability']);
    await session.setSequenceMode('journey', 'priority');
    expect(session.state.boards.find((board) => board.id === 'combined')?.sequenceModes.journey).toBe('priority');
    session.selectBoard('journeys');
    expect(session.state.boards.find((board) => board.id === 'pinned:journeys')?.sequenceModes.journey).toBeUndefined();
    await session.dispose();
  });

  it('recognizes valid existing-node connection targets', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Journey' });
    createDenimChild(database, 'journey', { id: 'action', type: 'User Action', text: 'Action' }, 'journey-action');
    createDenimChild(database, 'action', { id: 'capability', type: 'Capability', text: 'Capability' }, 'action-capability');
    addDenimNode(database, { id: 'resource', type: 'Instance', text: 'Instance' });
    const session = createDenimSession(database, async (_bytes, revision) => revision, 'r1');

    expect(session.canConnectExisting('journey', 'resource')).toBe(true);
    expect(session.canConnectExisting('journey', 'action')).toBe(false);
    expect(session.canConnectExisting('capability', 'journey')).toBe(false);
    expect(session.canConnectExisting('journey', 'journey')).toBe(false);
    await session.dispose();
  });
});
