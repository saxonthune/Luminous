# A type definition in the document

This is the same type presentation used on the canvas, displayed in the page. Press the author field to inspect its definition.

```portable-schema
title: BookListSummary
description: A small decrypted list record. This example is illustrative.
fields:
  - { name: id, type: string, kind: identifier }
  - { name: title, type: string, kind: text }
  - name: author
    type: Author
    kind: object
    optional: true
    schema:
      component: schema-card
      title: Author
      fields:
        - { name: name, type: string, kind: text }
  - { name: format, type: '"pdf" | "epub"', kind: choice }
```
