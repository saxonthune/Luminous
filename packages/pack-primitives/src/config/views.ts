import type { View } from '@luminous/core';

export const architectureView: View = {
  id: 'architecture',
  name: 'Architecture',
  description: 'Boxes and arrows. ELK auto-layout.',
  zoomToLevel: [
    { minZoom: 0,   level: 'peek' },
    { minZoom: 0.4, level: 'card' },
    { minZoom: 1.2, level: 'open' },
    { minZoom: 3.0, level: 'deep' },
  ],
  nodeRoles: {
    'prim.box': 'spatial',
  },
  edgeRoles: {
    'prim.arrow': 'arrow',
    'prim.contains': 'contain',
  },
  layers: {},
  layout: { algorithm: 'elk' },
};

export const views: View[] = [architectureView];
