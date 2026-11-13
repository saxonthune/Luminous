import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'solid-js/web';
import { SchemaBlock } from '../src/runtime/SchemaBlock.js';
vi.mock('@luminous/cactus/runtime', () => ({ stopWheelIfScrollable: vi.fn() }));
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });
test('document schema fields disclose nested types without a canvas', () => {
  const host = document.createElement('div'); document.body.append(host);
  dispose = render(() => <SchemaBlock content={{ component: 'schema-card', title: '<Book>', fields: [{ name: 'author', type: 'Author', kind: 'object', optional: true, schema: { component: 'schema-card', title: 'Author', fields: [{ name: 'name', type: 'string', kind: 'text' }] } }] }} />, host);
  const button = host.querySelector('button')!;
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('book')).toBeNull();
  button.click();
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelectorAll('.portable-schema-block')).toHaveLength(2);
  expect(host.textContent).toContain('name');
  button.click();
  expect(host.querySelectorAll('.portable-schema-block')).toHaveLength(1);
});
