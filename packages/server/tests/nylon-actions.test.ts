import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NylonSnapshot } from '../../core/src/nylon/history.ts';

const exec = promisify(execFile);
const initial = { v: 1, transformations: [{ id: 'a', name: 'A', x: 100, y: 100 }], contracts: [], arcs: [] };
let directory: string;
let server: ChildProcess;
let base: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nylon-actions-'));
  await writeFile(join(directory, 'test.nylon.json'), JSON.stringify(initial));
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', '--dir', directory], {
    cwd: resolve('.'), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise<string>((resolveReady, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 10000);
    server.stderr!.on('data', (data) => { output += data.toString(); });
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code, signal) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}, ${signal}): ${output}`)); });
    server.stdout!.on('data', (data) => {
      output += data.toString();
      const match = output.match(/server listening on (http:\/\/localhost:\d+)/);
      if (match) { clearTimeout(timeout); resolveReady(match[1]); }
    });
  });
}, 15000);

afterAll(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function snapshot(): Promise<NylonSnapshot> {
  const response = await fetch(`${base}/api/nylon/document/test.nylon.json`);
  expect(response.ok).toBe(true);
  return (await response.json()).snapshot;
}
async function post(body: unknown, endpoint = '/api/nylon/action') {
  const response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function cli(...args: string[]) {
  const { stdout } = await exec(process.execPath, ['--experimental-strip-types', resolve('../../scripts/luminous-cli.ts'), 'nylon', ...args, '--server', base]);
  return JSON.parse(stdout);
}

describe('Nylon HTTP and CLI integration', () => {
  it('imports a new document and records CLI layouts and batches as single undo steps', async () => {
    const imported = await cli('write', 'created.nylon.json', join(directory, 'test.nylon.json'));
    expect(imported.undo).toHaveLength(1);
    const differentiated = await cli('differentiate', 'created.nylon.json', 'a');
    expect(differentiated.undo).toHaveLength(2);
    const laidOut = await cli('layout', 'dag', 'created.nylon.json', 'a', 'TD', '--covered', '[]');
    expect(laidOut.undo).toHaveLength(3);
    expect((await cli('undo', 'created.nylon.json')).document).toEqual(differentiated.document);
    expect((await cli('redo', 'created.nylon.json')).document).toEqual(laidOut.document);
    const operationsFile = join(directory, 'operations.json');
    await writeFile(operationsFile, JSON.stringify([
      { op: 'node.add', nodeKind: 'contract', node: { id: 'extra', name: 'Extra' } },
      { op: 'node.reparent', id: 'extra', parent: 'a' },
    ]));
    const batched = await cli('batch', 'created.nylon.json', operationsFile);
    expect(batched.undo).toHaveLength(4);
    expect((await cli('undo', 'created.nylon.json')).document).toEqual(laidOut.document);
    expect((await cli('doctor', 'created.nylon.json')).issues).toEqual([]);
    expect((await cli('history', 'created.nylon.json')).undo).toHaveLength(3);
    expect((await cli('history', 'created.nylon.json')).redo).toHaveLength(1);
    const actionFile = join(directory, 'action.json');
    await writeFile(actionFile, JSON.stringify({ op: 'selection.move', ids: ['a'], dx: 10, dy: 0 }));
    const generic = await cli('action', 'created.nylon.json', actionFile);
    expect(generic.undo.at(-1).label).toBe('Move selection');
    expect(generic.redo).toEqual([]);
    const emptyFile = join(directory, 'empty.json');
    const empty = { v: 1, transformations: [], contracts: [], arcs: [] };
    await writeFile(emptyFile, JSON.stringify(empty));
    expect((await cli('write', 'empty.nylon.json', emptyFile)).undo).toEqual([]);
    expect(JSON.parse(await readFile(join(directory, 'empty.nylon.json'), 'utf8'))).toEqual(empty);
  }, 15000);

  it('shares history, rejects stale writes, deduplicates retries, and blocks history across external edits', async () => {
    const before = await snapshot();
    const request = { path: 'test.nylon.json', actionId: 'move-once', baseRevision: before.revision,
      origin: 'ui', action: { op: 'node.move', id: 'a', dx: 25, dy: 10 } };
    const moved = await post(request);
    expect(moved.status).toBe(200);
    expect(moved.body.snapshot.document.transformations[0]).toMatchObject({ x: 125, y: 110 });
    expect((await post(request)).body).toMatchObject({ ok: true, replayed: true });
    expect((await post({ ...request, actionId: 'stale' })).status).toBe(409);
    expect((await snapshot()).undo).toHaveLength(1);
    expect((await cli('undo', 'test.nylon.json')).document).toEqual(initial);
    expect((await cli('redo', 'test.nylon.json')).document).toEqual(moved.body.snapshot.document);
    const added = await cli('node', 'add', 'test.nylon.json', 'contract', '--id', 'c', '--name', 'Contract');
    expect(added.undo.at(-1)).toMatchObject({ origin: 'cli', label: 'Add Node' });
    const undo = await post({ path: 'test.nylon.json', actionId: 'undo-cli', baseRevision: added.revision, origin: 'ui', action: { op: 'undo' } });
    expect(undo.body.snapshot.document.contracts).toEqual([]);
    const dry = await cli('differentiate', 'test.nylon.json', 'a', '--dry-run');
    expect(dry.document.transformations).toHaveLength(3);
    expect((await snapshot()).document.transformations).toHaveLength(1);
    expect((await post({ path: 'test.nylon.json', content: initial }, '/api/document/write')).status).toBe(400);
    await writeFile(join(directory, 'test.nylon.json'), JSON.stringify(initial));
    const external = await snapshot();
    expect(external.undo).toEqual([]);
    expect(external.redo).toEqual([]);
    expect(external.revision).not.toBe(undo.body.snapshot.revision);
    expect((await post({ path: 'test.nylon.json', actionId: 'undo-external', baseRevision: external.revision, origin: 'ui', action: { op: 'undo' } })).body.ok).toBe(false);
    expect(JSON.parse(await readFile(join(directory, 'test.nylon.json'), 'utf8'))).toEqual(initial);
  }, 15000);
});
