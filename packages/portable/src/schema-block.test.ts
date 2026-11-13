import test from 'node:test';
import assert from 'node:assert/strict';
import { importMarkdown } from './import/markdown.js';

test('schema fences work without diagrams and retain nested definitions safely', async () => {
  const doc = await importMarkdown('Before\n\n```portable-schema\ntitle: "<script>Book</script>"\nfields:\n  - name: author\n    type: Author\n    kind: object\n    optional: true\n    schema:\n      component: schema-card\n      title: Author\n      fields:\n        - { name: name, type: string, kind: text }\n```\n\n```ts\nconst x = 1;\n```\n');
  assert.equal(doc.diagrams.length, 0);
  assert.equal(doc.schemaBlocks?.length, 1);
  assert.equal(doc.schemaBlocks[0].fields?.[0].schema?.title, 'Author');
  assert.match(doc.html, /data-portable-schema="0"/);
  assert.doesNotMatch(doc.html, /<script>/);
  assert.match(doc.html, /language-ts/);
});

test('schema fences enforce the same field and link validation as canvas schemas', async () => {
  await assert.rejects(importMarkdown('```portable-schema\ntitle: Book\nfields:\n - { name: id, type: string, kind: executable }\n```'), /Invalid schema fields/);
  await assert.rejects(importMarkdown('```portable-schema\ntitle: Book\nfields: []\nfooter: { text: source, href: "javascript:alert(1)" }\n```'), /Unsupported footer link/);
});
