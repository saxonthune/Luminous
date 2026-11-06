import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrimitiveType, missingSchemaTypes } from './schema-diagnostics.js';

test('warns for missing named schemas, including nested types, without warning on primitive unions and arrays', () => {
  assert.equal(isPrimitiveType('string | null'), true);
  assert.equal(isPrimitiveType('number[]'), true);
  assert.equal(isPrimitiveType('Book'), false);
  assert.equal(isPrimitiveType('CommentarySubmission["groups"]'), false);
  const result = missingSchemaTypes({ component: 'schema-card', title: 'Input', fields: [
    { name: 'book', type: 'Book', kind: 'object', schema: { component: 'schema-card', title: 'Book', fields: [
      { name: 'title', type: 'string', kind: 'text' }, { name: 'pages', type: 'Page[]', kind: 'collection' },
    ] } },
    { name: 'status', type: '"ready" | "failed"', kind: 'choice' },
    { name: 'job', type: 'CommentaryJob', kind: 'object' },
  ] });
  assert.deepEqual(result, [{ path: 'Input.book.pages', type: 'Page[]' }, { path: 'Input.job', type: 'CommentaryJob' }]);
});
