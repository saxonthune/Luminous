import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyAction,
  getRawDocument,
  isNylonPath,
  isRawDocPath,
  isWatchedDocumentPath,
  setRootDir,
  writeRawDocument,
} from '../src/store.js';
import { scanDocuments } from '../src/workspace.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'nylon-docs-test-'));
  setRootDir(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('Nylon storage', () => {
  it('recognizes, lists, and round-trips Nylon documents', async () => {
    expect(isNylonPath('system.nylon.json')).toBe(true);
    expect(isNylonPath('system.linen.json')).toBe(false);
    expect(isRawDocPath('system.nylon.json')).toBe(true);
    expect(isWatchedDocumentPath('system.nylon.json')).toBe(true);

    const content = { v: 1, transformations: [], contracts: [], arcs: [] };
    await writeFile(join(tmpDir, 'system.nylon.json'), JSON.stringify(content));
    const docs = await scanDocuments([{ name: 'root', dir: tmpDir }]);
    expect(docs.find((item) => item.name === 'system')?.path).toBe('root/system.nylon.json');

    await writeRawDocument('system.nylon.json', content);
    expect(await getRawDocument('system.nylon.json')).toEqual(content);
    expect(JSON.parse(await readFile(join(tmpDir, 'system.nylon.json'), 'utf-8'))).toEqual(content);
  });

  it('keeps graph actions away from Nylon documents', async () => {
    await writeRawDocument('system.nylon.json', { anything: 'goes' });
    const result = await applyAction('system.nylon.json', 'node/add', { kind: 'prim.box' });
    expect(result.ok).toBe(false);
    expect(await getRawDocument('system.nylon.json')).toEqual({ anything: 'goes' });
  });
});
