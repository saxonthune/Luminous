import type { View } from '@luminous/canvas-core';

// Containment direction: evaluateContainment treats edge.from as child, edge.to as parent.
// belongs-to-concept: from=rtp.action (child), to=rtp.concept (parent) → concept contains action. Correct.
export const conceptMapView: View = {
  id: 'concept-map',
  name: 'Concept map',
  description: 'Concepts containing their actions; states and transitions hidden.',
  nodeRoles: {
    'statechart.region':     'hidden',
    'statechart.composite':  'hidden',
    'statechart.state':      'hidden',
    'statechart.transition': 'hidden',
    'rtp.concept':           'spatial',
    'rtp.action':            'spatial',
  },
  edgeRoles: {
    'statechart.substate-of':    'hidden',
    'statechart.transition':     'hidden',
    'statechart.invokes-action': 'hidden',
    'rtp.belongs-to-concept':    'contain',
  },
  layers: {
    'orphan-action-highlight': 'on',
  },
  layout: { algorithm: 'force' },
};
