import type { Pack } from '@luminous/core';
import { nodeKinds, edgeKinds } from './schema/kinds.ts';
import { nodeRenderers, edgeRenderers } from './presentation/renderers.ts';
import { views, statechartView, conceptMapView } from './config/views.ts';
import { layers } from './config/layers.ts';
import { disclosureSchemas } from './config/disclosure.ts';

export const rtpStatechartPack: Pack = {
  id: 'rtp-statechart',
  version: '0.1.0',
  description: 'RTP statechart + concepts vocabulary for the property-graph architecture.',
  nodeKinds,
  edgeKinds,
  nodeRenderers,
  edgeRenderers,
  disclosureSchemas,
  layers,
  views,
};

export default rtpStatechartPack;
export { nodeKinds, edgeKinds, statechartView, conceptMapView };
export { findOrphanActions } from './orphans.ts';
export { OrphanActionWrapper } from './presentation/OrphanActionWrapper.tsx';
