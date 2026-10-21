import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanDocuments } from '../src/workspace.js';
import { createDenimDatabase, databaseRevision, DocumentRevisionConflict, readDenimDatabase, setRootDir, writeDenimDatabase } from '../src/store.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'denim-docs-test-'));
  setRootDir(tmpDir);
});

afterEach(async () => rm(tmpDir, { recursive: true, force: true }));

describe('Denim database files', () => {
  it('creates a new SQLite project without overwriting an existing file', async () => {
    const bytes = new Uint8Array([83, 81, 76, 105, 116, 101]);
    expect(await createDenimDatabase('new-project.denim.sqlite', bytes)).toBe(databaseRevision(bytes));
    expect([...await readDenimDatabase('new-project.denim.sqlite')]).toEqual([...bytes]);
    await expect(createDenimDatabase('new-project.denim.sqlite', new Uint8Array([1])))
      .rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('lists SQLite sources and round-trips their bytes', async () => {
    const original = new Uint8Array([83, 81, 76, 105, 116, 101]);
    await writeFile(join(tmpDir, 'design.sqlite'), original);
    const docs = await scanDocuments([{ name: 'root', dir: tmpDir }]);
    expect(docs.map(({ name, path }) => ({ name, path }))).toEqual([
      { name: 'design', path: 'root/design.sqlite' },
    ]);

    const updated = new Uint8Array([1, 2, 3, 4]);
    await writeDenimDatabase('design.sqlite', updated, databaseRevision(original));
    expect([...await readDenimDatabase('design.sqlite')]).toEqual([...updated]);
    expect([...await readFile(join(tmpDir, 'design.sqlite'))]).toEqual([...updated]);
    await expect(writeDenimDatabase('design.sqlite', original, databaseRevision(original)))
      .rejects.toBeInstanceOf(DocumentRevisionConflict);
  });
});
