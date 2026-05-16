/**
 * Disclosure level → render JSON contract.
 *
 * Since all rendering is now declarative (render JSON interpreted by the engine),
 * these tests check that the rtp-statechart data pack has the expected render
 * structure at each disclosure level.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parsePackJson } from '@luminous/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packPath = join(__dirname, '../../../../../.canvases/rtp-statechart.pack.json');

function loadPack() {
  return parsePackJson(readFileSync(packPath, 'utf-8'));
}

describe('statechart.state disclosure levels', () => {
  it('has disclosure schema with surface at peek', () => {
    const pack = loadPack();
    const schema = pack.disclosureSchemas.find((s) => s.kind === 'statechart.state');
    expect(schema).toBeDefined();
    expect(schema?.peek).toContain('surface');
    expect(schema?.card).toContain('tags');
    expect(schema?.open).toContain('description');
    expect(schema?.open).toContain('reads');
  });

  it('statechart.state kind has no render JSON (vocabulary gap: title from node.id)', () => {
    const pack = loadPack();
    const state = pack.nodeKinds.find((k) => k.id === 'statechart.state');
    expect(state).toBeDefined();
    // Region/composite/state have no render JSON because display name
    // comes from node.id via idSegment(), not accessible from node.props.
    expect(state?.render).toBeUndefined();
  });
});

describe('rtp.concept disclosure levels', () => {
  it('has render JSON at peek, card, and open', () => {
    const pack = loadPack();
    const concept = pack.nodeKinds.find((k) => k.id === 'rtp.concept');
    expect(concept?.render?.peek).toBeDefined();
    expect(concept?.render?.card).toBeDefined();
    expect(concept?.render?.open).toBeDefined();
  });

  it('card render shows name as heading', () => {
    const pack = loadPack();
    const concept = pack.nodeKinds.find((k) => k.id === 'rtp.concept');
    const card = concept?.render?.card;
    expect(card).toBeDefined();
    // card wraps a vstack with text heading for name
    const vstack = (card as { children?: unknown[] })?.children?.[0] as { children?: unknown[] } | undefined;
    const firstChild = vstack?.children?.[0] as { type?: string; value?: string; style?: string } | undefined;
    expect(firstChild?.type).toBe('text');
    expect(firstChild?.value).toContain('{content.name}');
    expect(firstChild?.style).toBe('heading');
  });

  it('open render includes Purpose, State, and Operational Principle sections', () => {
    const pack = loadPack();
    const concept = pack.nodeKinds.find((k) => k.id === 'rtp.concept');
    const open = concept?.render?.open;
    expect(open).toBeDefined();
    const openJson = JSON.stringify(open);
    expect(openJson).toContain('Purpose');
    expect(openJson).toContain('State');
    expect(openJson).toContain('Operational Principle');
    expect(openJson).toContain('{content.operationalPrinciple}');
  });

  it('peek render is a text node with name', () => {
    const pack = loadPack();
    const concept = pack.nodeKinds.find((k) => k.id === 'rtp.concept');
    const peek = concept?.render?.peek as { type?: string; value?: string } | undefined;
    expect(peek?.type).toBe('text');
    expect(peek?.value).toContain('{content.name}');
  });
});

describe('rtp.action disclosure levels', () => {
  it('has render JSON at peek, card, and open', () => {
    const pack = loadPack();
    const action = pack.nodeKinds.find((k) => k.id === 'rtp.action');
    expect(action?.render?.peek).toBeDefined();
    expect(action?.render?.card).toBeDefined();
    expect(action?.render?.open).toBeDefined();
  });

  it('peek render shows signature in mono style', () => {
    const pack = loadPack();
    const action = pack.nodeKinds.find((k) => k.id === 'rtp.action');
    const peek = action?.render?.peek as { type?: string; value?: string; style?: string } | undefined;
    expect(peek?.type).toBe('text');
    expect(peek?.value).toContain('{content.signature}');
    expect(peek?.style).toBe('mono');
  });

  it('card render includes conceptId as chip', () => {
    const pack = loadPack();
    const action = pack.nodeKinds.find((k) => k.id === 'rtp.action');
    const cardJson = JSON.stringify(action?.render?.card);
    expect(cardJson).toContain('{content.conceptId}');
    expect(cardJson).toContain('chip');
  });
});

describe('statechart.transition disclosure levels', () => {
  it('has render JSON at peek and card', () => {
    const pack = loadPack();
    const transition = pack.nodeKinds.find((k) => k.id === 'statechart.transition');
    expect(transition?.render?.peek).toBeDefined();
    expect(transition?.render?.card).toBeDefined();
  });

  it('peek render is a badge with event value', () => {
    const pack = loadPack();
    const transition = pack.nodeKinds.find((k) => k.id === 'statechart.transition');
    const peek = transition?.render?.peek as { type?: string; value?: string } | undefined;
    expect(peek?.type).toBe('badge');
    expect(peek?.value).toContain('{content.event}');
  });

  it('card render includes actions join expression', () => {
    const pack = loadPack();
    const transition = pack.nodeKinds.find((k) => k.id === 'statechart.transition');
    const cardJson = JSON.stringify(transition?.render?.card);
    expect(cardJson).toContain("join:'");
    expect(cardJson).toContain('{content.event}');
  });
});
