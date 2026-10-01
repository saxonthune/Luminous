// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { addDenimNode, exportDenimDatabase, listDenimWorkspaces, openDenimDatabase, putDenimWorkspace } from '@luminous/core/denim';
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
    const childId = await session.differentiate('journey', 'Action', 'Create the journey');
    expect(childId).toBeTypeOf('string');
    const child = session.state.graph.nodes.find((node) => node.id === childId);
    expect(child).toMatchObject({ type: 'Action', text: 'Create the journey' });

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

  it('keeps duplicate Journey workspaces independent and restores their JSON payloads', async () => {
    let database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    addDenimNode(database, { id: 'extra', type: 'Resource', text: 'Existing API' });
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1', 'tabs-test');

    await session.openJourney('journey');
    const firstId = session.state.activeTabId;
    await session.openJourney('journey');
    const secondId = session.state.activeTabId;
    expect(secondId).not.toBe(firstId);
    expect(session.state.tabs.filter((tab) => tab.kind === 'workspace')).toHaveLength(2);

    session.activateTab(firstId);
    session.setCamera(firstId, { x: 40, y: 60, k: 1.4 });
    await session.includeNode('extra');
    expect(session.state.graph.nodes.map((node) => node.id)).toContain('extra');
    await session.moveNode('extra', { x: 320, y: 180 });
    expect(session.state.tabs.find((tab) => tab.id === firstId)?.positions.extra).toEqual({ x: 320, y: 180 });

    session.activateTab(secondId);
    session.setCamera(secondId, { x: -30, y: 10, k: 0.8 });
    expect(session.state.graph.nodes.map((node) => node.id)).not.toContain('extra');
    expect(session.state.tabs.find((tab) => tab.id === secondId)?.positions.extra).toBeUndefined();
    expect(session.state.cameras[firstId]).toEqual({ x: 40, y: 60, k: 1.4 });
    expect(session.state.cameras[secondId]).toEqual({ x: -30, y: 10, k: 0.8 });
    expect(listDenimWorkspaces(database).map((record) => record.id)).toContain(firstId);

    const bytes = exportDenimDatabase(database);
    await session.dispose();
    database = await openDenimDatabase(bytes, wasmBinary);
    const restored = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r2', 'tabs-test');
    expect(restored.state.tabs.filter((tab) => tab.kind === 'workspace')).toHaveLength(2);
    expect(restored.state.tabs.find((tab) => tab.id === firstId)).toMatchObject({
      sources: [{ kind: 'journey', journeyId: 'journey' }],
      includedNodeIds: ['extra'],
      positions: { extra: { x: 320, y: 180 } },
    });
    await restored.dispose();
  });

  it('persists a pulled-in node separately from graph connections', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    addDenimNode(database, { id: 'resource', type: 'Resource', text: 'Existing API' });
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1');

    await session.includeNode('resource', 'pinned:journeys');

    expect(session.state.graph.nodes.map((node) => node.id)).toEqual(['journey', 'resource']);
    expect(session.state.graph.edges).toEqual([]);
    expect(listDenimWorkspaces(database)).toHaveLength(1);
    await session.dispose();
  });

  it('composes multiple source queries into one Tab View', async () => {
    const database = await openDenimDatabase(undefined, wasmBinary);
    addDenimNode(database, { id: 'journey', type: 'Journey', text: 'Build a journey' });
    addDenimNode(database, { id: 'capability', type: 'Capability', text: 'Store journeys' });
    putDenimWorkspace(database, { id: 'combined', payload: {
      version: 1,
      id: 'combined',
      kind: 'workspace',
      title: 'Combined workspace',
      sources: [{ kind: 'journey', journeyId: 'journey' }, { kind: 'capabilities' }],
      includedNodeIds: [],
      positions: {},
    } });
    const session = createDenimSession(database, async (_bytes, revision) => `${revision}-next`, 'r1');

    session.activateTab('combined');

    expect(session.state.graph.nodes.map((node) => node.id)).toEqual(['journey', 'capability']);
    await session.dispose();
  });
});
