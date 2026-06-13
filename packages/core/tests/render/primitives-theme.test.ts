import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
// Import the token list directly from its source file — pulling it via the
// package entry point would drag in the whole (JSX) component barrel.
import { CACTUS_TOKENS } from '../../../cactus/src/cactus-tokens.ts';

/**
 * Render primitives draw inside the canvas, where the cactus token cascade
 * (--cactus-*) is in scope. They must theme through that contract, not bake
 * in light-mode hex — otherwise nodes stay white in dark mode.
 *
 * Rule enforced here: any color literal must appear ONLY as the fallback of a
 * `var(--cactus-NAME, <fallback>)`. A raw hex with no var() wrapper is a
 * theming hole. (The fallback hex is fine — it only shows if the token is
 * absent.) This is the primitive-side analogue of cactus-themes.test.ts.
 */

const PRIMITIVES_DIR = resolve(process.cwd(), 'src/render/primitives');
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const CACTUS_VAR = /var\(\s*--cactus-([a-z0-9-]+)\s*(?:,[^)]*)?\)/g;
const contract = new Set<string>(CACTUS_TOKENS);

const files = readdirSync(PRIMITIVES_DIR).filter((f) => f.endsWith('.tsx'));

describe('render primitives theme through the cactus contract', () => {
  it('finds primitive files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const src = readFileSync(resolve(PRIMITIVES_DIR, file), 'utf8');

    it(`${file} has no raw hex outside a var() fallback`, () => {
      // Drop every var(...) expression — its fallback hex is allowed.
      const stripped = src.replace(/var\([^)]*\)/g, '');
      const leftover = stripped.match(HEX) ?? [];
      expect(leftover).toEqual([]);
    });

    it(`${file} references only real cactus tokens`, () => {
      for (const m of src.matchAll(CACTUS_VAR)) {
        expect(contract.has(m[1]), `unknown token --cactus-${m[1]}`).toBe(true);
      }
    });
  }
});
