import type { View } from '@luminous/core';
import { conceptMapView } from './views/concept-map.ts';

export const DEFAULT_ZOOM_TO_LEVEL: View['zoomToLevel'] = [
  { minZoom: 0,   level: 'peek' },
  { minZoom: 0.4, level: 'card' },
  { minZoom: 1.2, level: 'open' },
  { minZoom: 3.0, level: 'deep' },
];

export const statechartView: View = {
  id: 'statechart',
  name: 'Statechart',
  description: 'States and transitions with action chips on transitions.',
  zoomToLevel: DEFAULT_ZOOM_TO_LEVEL,
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

export { conceptMapView };
export const views: View[] = [statechartView, conceptMapView];
