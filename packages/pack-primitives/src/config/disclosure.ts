import type { DisclosureSchema } from '@luminous/canvas-core';

export const disclosureSchemas: DisclosureSchema[] = [
  {
    kind: 'prim.box',
    peek: ['label'],
    card: ['label', 'tag'],
    open: ['label', 'tag', 'description'],
    deep: ['label', 'tag', 'description'],
  },
];
