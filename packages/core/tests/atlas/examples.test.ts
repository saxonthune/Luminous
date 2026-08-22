import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseAtlasDocument } from '../../src/atlas/document.ts';
import { parseAtlasData } from '../../src/atlas/data.ts';
import { checkAtlasDocument } from '../../src/atlas/check.ts';

const CANVASES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../.luminous');
const files = readdirSync(CANVASES_DIR).filter((f) => f.endsWith('.atlas.json'));

/** These examples double as development fixtures: they are copies, refreshed by
 * hand, so they are checked for internal validity — not for agreement with the
 * repository each was extracted from. */
describe('.luminous/*.atlas.json examples', () => {
  it('found at least one example document', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const dataFile = file.replace(/\.atlas\.json$/, '.atlasdata.json');
    const dataPath = join(CANVASES_DIR, dataFile);

    it(`${file} parses cleanly`, () => {
      const text = readFileSync(join(CANVASES_DIR, file), 'utf-8');
      const result = parseAtlasDocument(text);
      expect(result.ok, result.ok ? '' : result.issues.join('\n')).toBe(true);
    });

    if (!existsSync(dataPath)) continue;

    it(`${dataFile} parses cleanly`, () => {
      const result = parseAtlasData(readFileSync(dataPath, 'utf-8'));
      expect(result.ok, result.ok ? '' : result.issues.join('\n')).toBe(true);
    });

    // Warnings are expected and informative here — a key a script no longer
    // emits, or an entry no Node names yet. Only errors mean the pair is broken.
    it(`${file} and its Data File check without errors`, () => {
      const doc = parseAtlasDocument(readFileSync(join(CANVASES_DIR, file), 'utf-8'));
      const data = parseAtlasData(readFileSync(dataPath, 'utf-8'));
      if (!doc.ok || !data.ok) return;
      const errors = checkAtlasDocument(doc.doc, data.data).filter((i) => i.severity === 'error');
      expect(errors.map((e) => e.message)).toEqual([]);
    });
  }
});
