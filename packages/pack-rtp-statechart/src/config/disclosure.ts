import type { DisclosureSchema } from '@luminous/core';

export const disclosureSchemas: DisclosureSchema[] = [
  {
    kind: 'statechart.region',
    peek: ['description'],
    card: ['description', 'initial'],
    open: ['description', 'initial'],
    deep: ['description', 'initial'],
  },
  {
    kind: 'statechart.composite',
    peek: ['description'],
    card: ['description', 'tags', 'initial'],
    open: ['description', 'tags', 'initial', 'parallel'],
    deep: ['description', 'tags', 'initial', 'parallel'],
  },
  {
    kind: 'statechart.state',
    peek: ['surface'],
    card: ['surface', 'tags'],
    open: ['surface', 'tags', 'description', 'reads'],
    deep: ['surface', 'tags', 'description', 'reads'],
  },
  {
    kind: 'statechart.transition',
    peek: ['event'],
    card: ['event', 'description'],
    open: ['event', 'description', 'actions'],
    deep: ['event', 'description', 'actions'],
  },
  {
    kind: 'rtp.concept',
    peek: ['name'],
    card: ['name', 'purpose'],
    open: ['name', 'purpose', 'state', 'operationalPrinciple'],
    deep: ['name', 'purpose', 'state', 'operationalPrinciple'],
  },
  {
    kind: 'rtp.action',
    peek: ['name'],
    card: ['name', 'signature'],
    open: ['name', 'signature', 'description', 'conceptId'],
    deep: ['name', 'signature', 'description', 'conceptId'],
  },
];
