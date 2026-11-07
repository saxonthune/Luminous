import test from 'node:test';
import assert from 'node:assert/strict';
import { resizedCanvas } from './canvas-resize.js';
const initial = { width: 900, height: 600 };
test('bottom-left drag expands width symmetrically and changes only the bottom vertically', () => {
  const result = resizedCanvas(initial, initial, -100, 150);
  assert.deepEqual(result, { width: 1100, height: 750 });
  const left = (initial.width - result.width) / 2;
  assert.equal(left, -100);
  assert.equal(left + result.width - initial.width, 100);
});
test('preview clamps each dimension independently to default, not current size', () => {
  const current = { width: 1200, height: 900 };
  assert.deepEqual(resizedCanvas(current, initial, 500, -1000), initial);
  assert.deepEqual(resizedCanvas(current, initial, 50, -100), { width: 1100, height: 800 });
  assert.deepEqual(resizedCanvas(current, initial, 500, 100), { width: 900, height: 1000 });
});
