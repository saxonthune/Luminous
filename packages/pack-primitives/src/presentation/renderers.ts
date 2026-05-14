import type { NodeRenderer, EdgeRenderer, KindId, DisclosureLevel } from '@luminous/canvas-core';
import BoxCard from './renderers/BoxCard.tsx';

const arrowCard: EdgeRenderer = (edge) => {
  const label = (edge.props as { label?: string }).label;
  return label ? `→ ${label}` : `→`;
};

export const nodeRenderers: Record<KindId, Partial<Record<DisclosureLevel, NodeRenderer>>> = {
  'prim.box': { card: BoxCard },
};

export const edgeRenderers: Record<KindId, Partial<Record<DisclosureLevel, EdgeRenderer>>> = {
  'prim.arrow': { card: arrowCard },
};
