import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parsePackJson } from '@luminous/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packPath = join(__dirname, '../../../../.canvases/rtp-statechart.pack.json');

describe('rtp-statechart data pack', () => {
  it('parses without error', () => {
    const text = readFileSync(packPath, 'utf-8');
    expect(() => parsePackJson(text)).not.toThrow();
  });

  it('ships both views', () => {
    const text = readFileSync(packPath, 'utf-8');
    const pack = parsePackJson(text);
    const ids = pack.views.map((v) => v.id);
    expect(ids).toContain('statechart');
    expect(ids).toContain('concept-map');
  });

  it('has 6 node kinds and 4 edge kinds', () => {
    const text = readFileSync(packPath, 'utf-8');
    const pack = parsePackJson(text);
    expect(pack.nodeKinds).toHaveLength(6);
    expect(pack.edgeKinds).toHaveLength(4);
  });

  it('rtp.concept kind has declarative render at card and open levels', () => {
    const text = readFileSync(packPath, 'utf-8');
    const pack = parsePackJson(text);
    const concept = pack.nodeKinds.find((k) => k.id === 'rtp.concept');
    expect(concept?.render?.card).toBeDefined();
    expect(concept?.render?.open).toBeDefined();
  });

  it('rtp.action kind has declarative render at peek and card levels', () => {
    const text = readFileSync(packPath, 'utf-8');
    const pack = parsePackJson(text);
    const action = pack.nodeKinds.find((k) => k.id === 'rtp.action');
    expect(action?.render?.peek).toBeDefined();
    expect(action?.render?.card).toBeDefined();
  });

  it('has 6 disclosure schemas', () => {
    const text = readFileSync(packPath, 'utf-8');
    const pack = parsePackJson(text);
    expect(pack.disclosureSchemas).toHaveLength(6);
  });
});
