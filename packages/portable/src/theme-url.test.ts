import test from 'node:test';
import assert from 'node:assert/strict';
import { themeFromUrl, urlWithTheme } from './theme-url.js';

test('theme round trips through local and hosted URLs without losing other query parameters or fragments', () => {
  for (const href of ['file:///tmp/design.html?other=keep#canvas-1', 'https://example.test/design.html?other=keep#canvas-1']) {
    for (const theme of ['ground', 'light', 'dark'] as const) {
      const updated = urlWithTheme(href, theme);
      assert.equal(themeFromUrl(updated), theme);
      assert.equal(new URL(updated).searchParams.get('other'), 'keep');
      assert.equal(new URL(updated).hash, '#canvas-1');
    }
    assert.equal(new URL(urlWithTheme(urlWithTheme(href, 'light'), 'dark')).searchParams.getAll('theme').length, 1);
  }
});
test('missing or unknown theme values use Ground', () => {
  assert.equal(themeFromUrl('file:///tmp/design.html'), 'ground');
  assert.equal(themeFromUrl('file:///tmp/design.html?theme=unknown'), 'ground');
});
