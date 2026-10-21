#!/usr/bin/env node


import { readFile, writeFile } from 'node:fs/promises';
import {
  addDenimNode, connectDenimChild, createDenimChild, exportDenimDatabase, getDenimGraph,
  getJourneyGraph, listCapabilities, listDenimNodeTypes, listJourneys, listTopLevelInstances,
  openDenimDatabase, seedDefaultDenimNodeTypes, seedDenimDatabase, updateDenimNode,
} from '../packages/core/src/denim/database.ts';
import type { DenimAction } from '../packages/core/src/denim/actions.ts';
import type { DenimQuery } from '../packages/core/src/denim/queries.ts';
import { readDenimBoards } from '../packages/core/src/denim/actions.ts';
import {
  checkNylonDocument, doctorNylonDocument, parseNylonDocument, serializeNylonDocument,
  type DifferentiateOptions, type NylonDocument, type NylonBatchOperation,
} from '../packages/core/src/nylon/index.ts';
import type { NylonAction, NylonLayoutContext } from '../packages/core/src/nylon/actions.ts';
import type { NylonSnapshot, NylonActionResponse } from '../packages/core/src/nylon/history.ts';

const argv = process.argv.slice(2);

function takeOption(name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined) fail(`${name} requires a value`);
  argv.splice(index, 2);
  return value;
}

function takeFlag(name: string): boolean {
  const index = argv.indexOf(name);
  if (index === -1) return false;
  argv.splice(index, 1);
  return true;
}

const serverUrl = (takeOption('--server') ?? process.env.LUMINOUS_SERVER_URL ?? 'http://localhost:4080').replace(/\/$/, '');
const dryRun = takeFlag('--dry-run');

function usage(): never {
  console.error(`Usage:
  just cli hemp generate|items|crates|list|read|check|write|layout|move
  just denim journeys <database>
  just denim boards <database>
  just denim list|actions|queries [--server URL]
  just denim query <database> <query.json> [--server URL]
  just denim snapshot <database> [--server URL]
  just denim action <database> <action.json> [--server URL]
  just denim batch <database> <actions.json> [--server URL]
  just denim journey <database> <journey-id>
  just denim capabilities|resources <database>
  just denim init|seed <database>
  just denim types seed <database>
  just denim node add <database> --id ID --type TYPE --text TEXT [--parent ID]
  just denim node set <database> <node-id> [--type TYPE] [--text TEXT]
  just denim connect <database> <parent-id> <existing-node-id>
  just cli nylon list [--server URL]
  just cli nylon read <path> [--server URL]
  just cli nylon history <path> [--server URL]
  just cli nylon undo <path> [--server URL]
  just cli nylon redo <path> [--server URL]
  just cli nylon export <path> [--server URL]
  just cli nylon check <path> [--server URL]
  just cli nylon doctor <path> [--dry-run] [--server URL]
  just cli nylon write <path> <local-file> [--server URL]
  just cli nylon batch <path> <operations-file> [--dry-run] [--server URL]
  just cli nylon action <path> <action-file> [--dry-run] [--server URL]
  just cli nylon node add <path> <transformation|contract> --id ID --name NAME [--parent ID|root] [--x N --y N] [--kind KIND] [--prose TEXT|--text TEXT] [--needs JSON]
  just cli nylon node update <path> <id> [--name NAME] [--kind KIND] [--prose TEXT|--text TEXT] [--needs JSON]
  just cli nylon node reparent <path> <id> <parent-id|root>
  just cli nylon node move <path> <id> <dx> <dy>
  just cli nylon node delete <path> <id> [--cascade]
  just cli nylon arc add <path> <from> <to>
  just cli nylon arc remove <path> <from> <to>
  just cli nylon arc replace <path> <old-from> <old-to> <new-from> <new-to>
  just cli nylon arc insert <path> <from> <to> --transformation-id ID --transformation-name NAME --contract-id ID --contract-name NAME [--parent ID|root] [--transformation-x N --transformation-y N --contract-x N --contract-y N]
  just cli nylon contract-pair set <path> <transformation-id> --input ID --output ID
  just cli nylon contract-pair clear <path> <transformation-id>
  just cli nylon contract-pair move <path> <transformation-id> <dx> <dy>
  just cli nylon layout dag <path> <transformation-id> <LR|TD|RL|DT>
  just cli nylon layout space <path> <transformation-id>
  just cli nylon differentiate <path> <transformation-id> [--first NAME] [--contract NAME] [--second NAME] [--server URL]

Nylon mutating commands accept --dry-run.
Layouts accept --collapsed '["id"]' and --covered '["id"]'; default: all expanded.`);
  process.exit(2);
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${serverUrl}${path}`, { signal: AbortSignal.timeout(10_000), ...init });
  if (!response.ok) fail(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response;
}

const revisions = new Map<string, string>();

async function readSnapshot(path: string): Promise<NylonSnapshot> {
  const response = await request(`/api/nylon/document/${encodeURIComponent(path)}`);
  const result = await response.json() as { snapshot: NylonSnapshot };
  revisions.set(path, result.snapshot.revision);
  return result.snapshot;
}

async function readDocument(path: string): Promise<NylonDocument> {
  return (await readSnapshot(path)).document;
}

function denimUsage(): never {
  console.log(`Usage: just denim <command>

Sequence Containers (running storage server):
  just denim sequence read <database> <owner-id>
  just denim sequence insert <database> <owner-id> --text TEXT [--type TYPE]
    [--parent ID] [--before ID | --after ID] [--placement below|right] [--board ID] [--layout]
  just denim sequence indent|outdent <database> <owner-id> <node-id> [--from-parent ID] [--layout] [--board ID]
  just denim sequence move <database> <owner-id> <node-id> --from-parent ID --parent ID [--before ID | --after ID] [--layout] [--board ID]
  just denim sequence layout <database> <owner-id> [--board ID]

Board is inferred only when the container is loaded on exactly one Board.
Placement is relative to the anchor (or last sibling/parent); default: below.

Read a local Denim database:
  just denim boards <database>
  just denim journeys <database>
  just denim types seed <database>

Use the running storage server (default http://localhost:4080):
  just denim list
  just denim actions
  just denim queries
  just denim snapshot <database>
  just denim query <database> <query.json>
  just denim action <database> <action.json>
  just denim batch <database> <actions.json>

Pass --server URL to use a different storage server. The browser client port
(usually 5200) is not the storage server port.`);
  process.exit(0);
}

async function denimCli(): Promise<void> {
  const command = argv.shift();
  if (command === 'help' || command === '--help' || command === '-h' || command === undefined) denimUsage();
  if (command === 'sequence') {
    const operation = argv.shift();
    const path = argv.shift();
    const ownerNodeId = argv.shift();
    const boardOption = takeOption('--board');
    const parentId = takeOption('--parent');
    const fromParentId = takeOption('--from-parent');
    const beforeNodeId = takeOption('--before');
    const afterNodeId = takeOption('--after');
    const text = takeOption('--text');
    const type = takeOption('--type');
    const relativePlacement = takeOption('--placement');
    const layout = takeFlag('--layout');
    const nodeId = argv.shift();
    if (!path || !ownerNodeId || argv.length) fail('Usage: sequence read|insert|indent|outdent|move|layout <database> <owner-id> [node-id] [options]');
    if (!['read', 'insert', 'indent', 'outdent', 'move', 'layout'].includes(operation ?? '')) fail('Unknown sequence command');
    if (relativePlacement && !['below', 'right'].includes(relativePlacement)) fail('--placement must be below or right');
    const snapshot = await (await request(`/api/denim/snapshot/${encodeURIComponent(path)}`)).json() as {
      revision: string; boards: Array<{ id: string; containers: Record<string, { sequenceContainerId?: string }> }>;
    };
    const needsBoard = operation === 'insert' || operation === 'layout' || layout;
    const matches = snapshot.boards.filter(board => board.containers[ownerNodeId]?.sequenceContainerId);
    const boardId = boardOption ?? (matches.length === 1 ? matches[0]!.id : undefined);
    if (needsBoard && !boardId) fail('Specify --board ID (the Sequence Container must be loaded on that Board)');
    let action: DenimAction;
    if (operation === 'read') action = { op: 'sequenceContainer.read', ownerNodeId };
    else if (operation === 'layout') action = { op: 'sequenceContainer.layout', ownerNodeId, boardId: boardId! };
    else if (operation === 'insert') {
      if (text === undefined) fail('insert requires --text');
      action = { op: 'sequence.node.insert', ownerNodeId, boardId: boardId!, text, type, parentId, beforeNodeId, afterNodeId,
        relativePlacement: relativePlacement as 'below' | 'right' | undefined };
    } else {
      if (!nodeId) fail(`${operation} requires a node ID`);
      if (operation === 'move') {
        if (!parentId || !fromParentId) fail('move requires --parent and --from-parent');
        action = { op: 'sequence.node.move', ownerNodeId, nodeId, fromParentId, parentId, beforeNodeId, afterNodeId };
      } else action = { op: operation === 'indent' ? 'sequence.node.indent' : 'sequence.node.outdent', ownerNodeId, nodeId, fromParentId };
    }
    if (nodeId && ['read', 'insert', 'layout'].includes(operation!)) fail('Unexpected positional argument');
    const actions: DenimAction[] = [action];
    if (layout && operation !== 'layout') actions.push({ op: 'sequenceContainer.layout', ownerNodeId, boardId: boardId! });
    const response = await request('/api/denim/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, baseRevision: snapshot.revision, actionId: crypto.randomUUID(), actions }),
    });
    const result = await response.json() as { results: unknown[]; revision: string };
    console.log(JSON.stringify({ results: result.results, revision: result.revision }, null, 2));
    return;
  }
  if (command === 'list') {
    if (argv.length) denimUsage();
    const response = await request('/api/documents');
    const body = await response.json() as { documents?: Array<{ path: string }> };
    for (const item of body.documents ?? []) if (item.path.endsWith('.denim.sqlite')) console.log(item.path);
    return;
  }
  if (command === 'actions') {
    if (argv.length) denimUsage();
    const response = await request('/api/denim/actions');
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }
  if (command === 'queries') {
    if (argv.length) denimUsage();
    const response = await request('/api/denim/queries');
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }
  if (command === 'query') {
    const path = argv.shift(); const queryFile = argv.shift();
    if (!path || !queryFile || argv.length) denimUsage();
    let query: DenimQuery;
    try { query = JSON.parse(await readFile(queryFile, 'utf8')) as DenimQuery; }
    catch (cause) { fail(`Could not read Denim query JSON: ${cause instanceof Error ? cause.message : String(cause)}`); }
    const response = await request('/api/denim/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, query }),
    });
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }
  if (command === 'snapshot') {
    const path = argv.shift(); if (!path || argv.length) denimUsage();
    const response = await request(`/api/denim/snapshot/${encodeURIComponent(path)}`);
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }
  if (command === 'action') {
    const path = argv.shift(); const actionFile = argv.shift();
    if (!path || !actionFile || argv.length) denimUsage();
    let action: DenimAction;
    try { action = JSON.parse(await readFile(actionFile, 'utf8')) as DenimAction; }
    catch (cause) { fail(`Could not read Denim action JSON: ${cause instanceof Error ? cause.message : String(cause)}`); }
    const snapshotResponse = await request(`/api/denim/snapshot/${encodeURIComponent(path)}`);
    const snapshot = await snapshotResponse.json() as { revision: string };
    const response = await request('/api/denim/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, baseRevision: snapshot.revision, actionId: crypto.randomUUID(), action }),
    });
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }
  if (command === 'batch') {
    const path = argv.shift(); const actionsFile = argv.shift();
    if (!path || !actionsFile || argv.length) denimUsage();
    let actions: DenimAction[];
    try {
      const parsed: unknown = JSON.parse(await readFile(actionsFile, 'utf8'));
      if (!Array.isArray(parsed) || parsed.length === 0) fail('Denim batch file must contain a nonempty array of actions');
      actions = parsed as DenimAction[];
    } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith('Denim batch file')) throw cause;
      fail(`Could not read Denim batch JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    const snapshotResponse = await request(`/api/denim/snapshot/${encodeURIComponent(path)}`);
    const snapshot = await snapshotResponse.json() as { revision: string };
    const response = await request('/api/denim/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, baseRevision: snapshot.revision, actionId: crypto.randomUUID(), actions }),
    });
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }
  if (command === 'init') {
    const path = argv.shift(); if (!path || argv.length) denimUsage();
    const db = await openDenimDatabase();
    await writeFile(path, exportDenimDatabase(db), { flag: 'wx' });
    console.log(JSON.stringify({ ok: true, path })); return;
  }
  if (command === 'seed') {
    const path = argv.shift(); if (!path || argv.length) denimUsage();
    const db = await openDenimDatabase();
    seedDenimDatabase(db);
    await writeFile(path, exportDenimDatabase(db), { flag: 'wx' });
    console.log(JSON.stringify({ ok: true, path, graph: getDenimGraph(db) }, null, 2)); return;
  }
  if (command === 'types') {
    const action = argv.shift();
    const path = argv.shift();
    if (action !== 'seed' || !path || argv.length) denimUsage();
    const db = await openDenimDatabase(new Uint8Array(await readFile(path)));
    seedDefaultDenimNodeTypes(db);
    await writeFile(path, exportDenimDatabase(db));
    console.log(JSON.stringify({
      ok: true,
      path,
      types: listDenimNodeTypes(db),
    }, null, 2));
    return;
  }
  if (command === 'node') {
    const action = argv.shift();
    const path = argv.shift(); if (!path) denimUsage();
    if (action === 'add') {
      const id = requiredOption('--id');
      const type = requiredOption('--type');
      const text = requiredOption('--text');
      const parent = takeOption('--parent');
      if (argv.length) denimUsage();
      const db = await openDenimDatabase(new Uint8Array(await readFile(path)));
      if (parent) createDenimChild(db, parent, { id, type, text }, `${parent}-${id}`);
      else addDenimNode(db, { id, type, text });
      await writeFile(path, exportDenimDatabase(db));
      console.log(JSON.stringify({ ok: true, id, type, text, parent }, null, 2)); return;
    }
    if (action === 'set') {
      const id = argv.shift(); if (!id) denimUsage();
      const type = takeOption('--type');
      const text = takeOption('--text');
      if (argv.length || (type === undefined && text === undefined)) denimUsage();
      const db = await openDenimDatabase(new Uint8Array(await readFile(path)));
      updateDenimNode(db, id, { type, text });
      await writeFile(path, exportDenimDatabase(db));
      console.log(JSON.stringify(getDenimGraph(db).nodes.find((node) => node.id === id), null, 2)); return;
    }
    denimUsage();
  }
  const path = argv.shift();
  if (!path) denimUsage();
  const db = await openDenimDatabase(new Uint8Array(await readFile(path)));
  const save = async () => writeFile(path, exportDenimDatabase(db));
  if (command === 'journeys') {
    if (argv.length) denimUsage();
    console.log(JSON.stringify(listJourneys(db), null, 2)); return;
  }
  if (command === 'boards') {
    if (argv.length) denimUsage();
    console.log(JSON.stringify(readDenimBoards(db), null, 2)); return;
  }
  if (command === 'journey') {
    const id = argv.shift(); if (!id || argv.length) denimUsage();
    console.log(JSON.stringify(getJourneyGraph(db, id), null, 2)); return;
  }
  if (command === 'capabilities') {
    if (argv.length) denimUsage();
    console.log(JSON.stringify(listCapabilities(db), null, 2)); return;
  }
  if (command === 'resources') {
    if (argv.length) denimUsage();
    console.log(JSON.stringify(listTopLevelInstances(db), null, 2)); return;
  }
  if (command === 'connect') {
    const parentId = argv.shift(); const existingId = argv.shift();
    if (!parentId || !existingId || argv.length) denimUsage();
    connectDenimChild(db, parentId, existingId, `${parentId}-${existingId}-${crypto.randomUUID().slice(0, 8)}`);
    await save();
    console.log(JSON.stringify({ ok: true, parentId, existingId }, null, 2)); return;
  }
  denimUsage();
}

function requiredOption(name: string): string {
  const value = takeOption(name);
  if (value === undefined) fail(`${name} is required`);
  return value;
}

function finiteNumber(text: string | undefined, name: string): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) fail(`${name} must be a finite number`);
  return value;
}

function needsOption(): string[] | undefined {
  const text = takeOption('--needs');
  if (text === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('--needs must be a JSON array of strings');
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    fail('--needs must be a JSON array of strings');
  }
  return parsed;
}

function parentOption(): string | null | undefined {
  const parent = takeOption('--parent');
  return parent === undefined ? undefined : parent === 'root' ? null : parent;
}

async function finishMutation(path: string, action: NylonAction, extra: Record<string, unknown> = {}): Promise<void> {
  if (!revisions.has(path)) await readSnapshot(path);
  const body = JSON.stringify({ path, action, dryRun, origin: 'cli',
    actionId: crypto.randomUUID(), baseRevision: revisions.get(path) });
  let result: NylonActionResponse;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${serverUrl}/api/nylon/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(10_000),
      });
      result = await response.json() as NylonActionResponse;
      break;
    } catch (error) {
      if (attempt >= 1) throw error;
    }
  }
  if (!result.ok) fail(result.error);
  console.log(JSON.stringify({ ok: true, dryRun, path, ...extra,
    revision: result.snapshot.revision, document: result.snapshot.document,
    undo: result.snapshot.undo, redo: result.snapshot.redo }, null, 2));
}

function layoutContext(): NylonLayoutContext {
  const readIds = (flag: string): string[] => {
    const text = takeOption(flag);
    if (text === undefined) return [];
    const ids: unknown = JSON.parse(text);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) fail(`${flag} must be a JSON array of IDs`);
    return ids as string[];
  };
  return { collapsed: readIds('--collapsed'), covered: readIds('--covered') };
}

async function main(): Promise<void> {
  if (argv[0] === 'hemp') {
    const { hempCli } = await import('./hemp-cli.ts');
    return hempCli(argv.slice(1), serverUrl, dryRun);
  }
  if (argv[0] === 'denim') {
    argv.shift();
    return denimCli();
  }
  if (argv.shift() !== 'nylon') usage();
  const command = argv.shift();
  if (command === 'list') {
    const response = await request('/api/documents');
    const body = await response.json() as { documents?: Array<{ path: string }> };
    for (const item of body.documents ?? []) {
      if (item.path.endsWith('.nylon.json')) console.log(item.path);
    }
    return;
  }

  if (command === 'node') {
    const action = argv.shift();
    const path = argv.shift();
    if (!path) usage();
    await readSnapshot(path);
    if (action === 'add') {
      const kind = argv.shift();
      const id = requiredOption('--id');
      const name = requiredOption('--name');
      const parent = parentOption();
      const x = finiteNumber(takeOption('--x'), '--x');
      const y = finiteNumber(takeOption('--y'), '--y');
      const needs = needsOption();
      const contractKind = takeOption('--kind');
      const prose = takeOption('--prose');
      const text = takeOption('--text');
      if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
      if (kind === 'transformation') {
        if (text !== undefined || contractKind !== undefined) fail('a Transformation cannot use --text or --kind');
        await finishMutation(path, { op: 'node.add', nodeKind: 'transformation', node: { id, name, parent, x, y, prose, needs } });
        return;
      }
      if (kind === 'contract') {
        if (prose !== undefined || needs !== undefined) fail('a Contract cannot use --prose or --needs');
        await finishMutation(path, { op: 'node.add', nodeKind: 'contract', node: { id, name, kind: contractKind, parent, x, y, text } });
        return;
      }
      fail('node add kind must be transformation or contract');
    }
    const id = argv.shift();
    if (!id) usage();
    if (action === 'update') {
      const name = takeOption('--name');
      const kind = takeOption('--kind');
      const prose = takeOption('--prose');
      const text = takeOption('--text');
      const needs = needsOption();
      if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
      await finishMutation(path, { op: 'node.update', id, patch: { name, kind, prose, text, needs } });
      return;
    }
    if (action === 'reparent') {
      const parent = argv.shift();
      if (!parent || argv.length > 0) usage();
      await finishMutation(path, { op: 'node.reparent', id, parent: parent === 'root' ? null : parent });
      return;
    }
    if (action === 'move') {
      const dx = finiteNumber(argv.shift(), 'dx');
      const dy = finiteNumber(argv.shift(), 'dy');
      if (dx === undefined || dy === undefined || argv.length > 0) usage();
      await finishMutation(path, { op: 'node.move', id, dx, dy });
      return;
    }
    if (action === 'delete') {
      const cascade = takeFlag('--cascade');
      if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
      await finishMutation(path, { op: 'node.delete', id, cascade });
      return;
    }
    usage();
  }

  if (command === 'arc') {
    const action = argv.shift();
    const path = argv.shift();
    const from = argv.shift();
    const to = argv.shift();
    if (!path || !from || !to) usage();
    await readSnapshot(path);
    if (action === 'add' || action === 'remove') {
      if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
      await finishMutation(path, { op: action === 'add' ? 'arc.add' : 'arc.remove', from, to });
      return;
    }
    if (action === 'replace') {
      const newFrom = argv.shift();
      const newTo = argv.shift();
      if (!newFrom || !newTo || argv.length > 0) usage();
      await finishMutation(path, { op: 'arc.replace', oldFrom: from, oldTo: to, newFrom, newTo });
      return;
    }
    if (action === 'insert') {
      const transformationId = requiredOption('--transformation-id');
      const transformationName = requiredOption('--transformation-name');
      const contractId = requiredOption('--contract-id');
      const contractName = requiredOption('--contract-name');
      const parent = parentOption();
      const transformationX = finiteNumber(takeOption('--transformation-x'), '--transformation-x');
      const transformationY = finiteNumber(takeOption('--transformation-y'), '--transformation-y');
      const contractX = finiteNumber(takeOption('--contract-x'), '--contract-x');
      const contractY = finiteNumber(takeOption('--contract-y'), '--contract-y');
      if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
      await finishMutation(path, { op: 'arc.insert', from, to, options: {
        transformation: { id: transformationId, name: transformationName, x: transformationX, y: transformationY },
        contract: { id: contractId, name: contractName, x: contractX, y: contractY },
        parent,
      } });
      return;
    }
    usage();
  }

  if (command === 'contract-pair') {
    const action = argv.shift();
    const path = argv.shift();
    const transformationId = argv.shift();
    if (!path || !transformationId) usage();
    await readSnapshot(path);
    if (action === 'set') {
      const input = requiredOption('--input');
      const output = requiredOption('--output');
      if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
      await finishMutation(path, { op: 'contract-pair.set', transformationId, input, output });
      return;
    }
    if (action === 'clear') {
      if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
      await finishMutation(path, { op: 'contract-pair.clear', transformationId });
      return;
    }
    if (action === 'move') {
      const dx = finiteNumber(argv.shift(), 'dx');
      const dy = finiteNumber(argv.shift(), 'dy');
      if (dx === undefined || dy === undefined || argv.length > 0) usage();
      await finishMutation(path, { op: 'contract-pair.move', transformationId, dx, dy });
      return;
    }
    usage();
  }

  if (command === 'batch') {
    const path = argv.shift();
    const operationsFile = argv.shift();
    if (!path || !operationsFile || argv.length > 0) usage();
    const raw = JSON.parse(await readFile(operationsFile, 'utf8')) as unknown;
    if (!Array.isArray(raw)) fail('batch operations file must contain a JSON array');
    await readSnapshot(path);
    await finishMutation(path, { op: 'batch', operations: raw as NylonBatchOperation[] });
    return;
  }

  if (command === 'layout') {
    const action = argv.shift();
    const path = argv.shift();
    const transformationId = argv.shift();
    if (!path || !transformationId) usage();
    await readSnapshot(path);
    const context = layoutContext();
    if (action === 'space') {
      if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
      await finishMutation(path, { op: 'layout.space', id: transformationId, context });
      return;
    }
    if (action === 'dag') {
      const direction = argv.shift();
      if (!direction || !['LR', 'TD', 'RL', 'DT'].includes(direction) || argv.length > 0) usage();
      await finishMutation(path, { op: 'layout.dag', id: transformationId, direction: direction as 'LR' | 'TD' | 'RL' | 'DT', context });
      return;
    }
    usage();
  }

  const path = argv.shift();
  if (!path) usage();
  if (command === 'action') {
    const file = argv.shift();
    if (!file || argv.length > 0) usage();
    const action = JSON.parse(await readFile(file, 'utf8')) as NylonAction;
    await finishMutation(path, action);
    return;
  }
  if (command === 'history') {
    if (argv.length > 0) usage();
    const { revision, undo, redo } = await readSnapshot(path);
    console.log(JSON.stringify({ path, revision, undo, redo }, null, 2));
    return;
  }
  if (command === 'undo' || command === 'redo') {
    if (argv.length > 0) usage();
    await finishMutation(path, { op: command });
    return;
  }
  if (command === 'read') {
    console.log(JSON.stringify(await readDocument(path), null, 2));
    return;
  }
  if (command === 'export') {
    if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
    process.stdout.write(serializeNylonDocument(await readDocument(path)));
    return;
  }
  if (command === 'check') {
    const issues = checkNylonDocument(await readDocument(path));
    console.log(JSON.stringify({ issues }, null, 2));
    if (issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
    return;
  }
  if (command === 'doctor') {
    if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
    const result = doctorNylonDocument(await readDocument(path));
    console.log(JSON.stringify({ issues: result.issues }, null, 2));
    if (result.issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
    return;
  }
  if (command === 'write') {
    const localFile = argv.shift();
    if (!localFile) usage();
    if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
    const parsed = parseNylonDocument(await readFile(localFile, 'utf8'));
    if (!parsed.ok) fail(parsed.issues.join('; '));
    const issues = checkNylonDocument(parsed.doc);
    if (issues.some((issue) => issue.severity === 'error')) {
      fail(`local Document is invalid: ${issues.map((issue) => issue.message).join('; ')}`);
    }
    await finishMutation(path, { op: 'document.replace', document: parsed.doc }, { source: localFile });
    return;
  }
  if (command === 'move') {
    const id = argv.shift();
    const dxText = argv.shift();
    const dyText = argv.shift();
    if (!id || dxText === undefined || dyText === undefined) usage();
    if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
    await readSnapshot(path);
    await finishMutation(path, { op: 'node.move', id, dx: Number(dxText), dy: Number(dyText) });
    return;
  }
  if (command === 'move-pair') {
    const transformationId = argv.shift();
    const dxText = argv.shift();
    const dyText = argv.shift();
    if (!transformationId || dxText === undefined || dyText === undefined) usage();
    if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);
    await readSnapshot(path);
    await finishMutation(path, { op: 'contract-pair.move', transformationId, dx: Number(dxText), dy: Number(dyText) });
    return;
  }
  if (command === 'differentiate') {
    const id = argv.shift();
    if (!id) usage();
    const options: DifferentiateOptions = {};
    const firstName = takeOption('--first');
    const contractName = takeOption('--contract');
    const secondName = takeOption('--second');
    if (firstName !== undefined) options.firstName = firstName;
    if (contractName !== undefined) options.contractName = contractName;
    if (secondName !== undefined) options.secondName = secondName;
    if (argv.length > 0) fail(`unknown argument "${argv[0]}"`);

    await readSnapshot(path);
    await finishMutation(path, { op: 'differentiate', id, options });
    return;
  }
  usage();
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
