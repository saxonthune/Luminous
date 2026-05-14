import type { Layer } from '@luminous/core';

export const layers: Layer[] = [
  {
    id: 'transitions',
    name: 'Transitions',
    edgeKinds: ['statechart.transition'],
    defaultState: 'on',
  },
  {
    id: 'action-chips',
    name: 'Action chips',
    edgeKinds: ['statechart.invokes-action'],
    defaultState: 'on',
  },
  {
    id: 'tag-decorations',
    name: 'State tags',
    edgeKinds: [],
    defaultState: 'peek',
  },
  {
    id: 'orphan-action-highlight',
    name: 'Highlight orphan actions',
    edgeKinds: [],
    defaultState: 'on',
  },
];
