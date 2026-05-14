import type { View } from '@luminous/canvas-core';

export const statechartView: View = {
  id: 'statechart',
  name: 'Statechart',
  description: 'States and transitions with action chips on transitions.',
  nodeRoles: {
    'statechart.region': 'spatial',
    'statechart.composite': 'spatial',
    'statechart.state': 'spatial',
    'statechart.transition': 'hidden',
    'rtp.concept': 'hidden',
    'rtp.action': 'latent',
  },
  edgeRoles: {
    'statechart.substate-of': 'contain',
    'statechart.transition': 'arrow',
    'statechart.invokes-action': 'summary',
    'rtp.belongs-to-concept': 'hidden',
  },
  layers: {
    'transitions': 'on',
    'action-chips': 'on',
    'tag-decorations': 'peek',
  },
  layout: { algorithm: 'elk' },
};

export const views: View[] = [statechartView];
