import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CACTUS_TOKENS } from '../src/cactus-tokens.js';

/**
 * Enforces "one contract, two themes" (doc02.05.05): each shipped theme must
 * assign a value to EVERY token in the contract and to no other --cactus-*
 * token. This test is the mechanism that keeps the themes interchangeable.
 */

const css = readFileSync(resolve(process.cwd(), 'src/cactus-themes.css'), 'utf8');

/** Token names assigned inside a `.cactus-theme-NAME { … }` block. */
function tokensInTheme(themeClass: string): string[] {
  const start = css.indexOf(`.${themeClass}`);
  if (start === -1) throw new Error(`theme ${themeClass} not found`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const block = css.slice(open + 1, close);
  return [...block.matchAll(/--cactus-([a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

const THEMES = ['cactus-theme-light', 'cactus-theme-dark'];
const contract = [...CACTUS_TOKENS].sort();

describe('cactus shipped themes', () => {
  for (const theme of THEMES) {
    it(`${theme} fills exactly the token contract`, () => {
      const assigned = tokensInTheme(theme);
      // no duplicate assignments
      expect(new Set(assigned).size).toBe(assigned.length);
      // exactly the contract set — no missing, no extra
      expect([...assigned].sort()).toEqual(contract);
    });
  }
});
