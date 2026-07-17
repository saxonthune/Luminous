import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseAtlasDocument } from '../../src/atlas/document.ts';

const CANVASES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../.luminous');
const files = readdirSync(CANVASES_DIR).filter((f) => f.endsWith('.atlas.json'));

describe('.luminous/*.atlas.json examples', () => {
  it('found at least one example document', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} parses cleanly`, () => {
      const text = readFileSync(join(CANVASES_DIR, file), 'utf-8');
      const result = parseAtlasDocument(text);
      expect(result.ok).toBe(true);
    });
  }
});
