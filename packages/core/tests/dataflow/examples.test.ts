import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseDataflowDocument } from '../../src/dataflow/document.ts';
import { checkDocument } from '../../src/dataflow/check.ts';

const CANVASES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../.canvases');
const files = readdirSync(CANVASES_DIR).filter((f) => f.endsWith('.dataflow.json'));

describe('.canvases/*.dataflow.json examples', () => {
  it('found at least one example document', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} parses and checks clean`, () => {
      const text = readFileSync(join(CANVASES_DIR, file), 'utf-8');
      const result = parseDataflowDocument(text);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const errors = checkDocument(result.doc).filter((issue) => issue.severity === 'error');
      expect(errors).toEqual([]);
    });
  }
});
