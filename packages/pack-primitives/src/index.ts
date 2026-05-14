import type { Pack } from '@luminous/core';
import { nodeKinds, edgeKinds } from './schema/kinds.ts';
import { nodeRenderers, edgeRenderers } from './presentation/renderers.ts';
import { views, architectureView } from './config/views.ts';
import { layers } from './config/layers.ts';
import { disclosureSchemas } from './config/disclosure.ts';

export const primitivesPack: Pack = {
  id: 'primitives',
  version: '0.1.0',
  description: 'Generic boxes and arrows for architectural and conceptual diagrams.',
  nodeKinds,
  edgeKinds,
  nodeRenderers,
  edgeRenderers,
  disclosureSchemas,
  layers,
  views,
};

export default primitivesPack;
export { architectureView };
