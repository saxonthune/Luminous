import type { NodeRenderer, EdgeRenderer, KindId, DisclosureLevel } from '@luminous/canvas-core';

const placeholderNode: NodeRenderer = (node) =>
  `[${node.kind}] ${(node.props as Record<string, unknown>)['name'] ?? node.id}`;

const placeholderEdge: EdgeRenderer = (edge) =>
  `[${edge.kind}] ${edge.from} → ${edge.to}`;

export const nodeRenderers: Record<KindId, Partial<Record<DisclosureLevel, NodeRenderer>>> = {
  'statechart.region':     { card: placeholderNode },
  'statechart.composite':  { card: placeholderNode },
  'statechart.state':      { card: placeholderNode },
  'statechart.transition': { card: placeholderNode },
  'rtp.concept':           { card: placeholderNode },
  'rtp.action':            { card: placeholderNode },
};

export const edgeRenderers: Record<KindId, Partial<Record<DisclosureLevel, EdgeRenderer>>> = {
  'statechart.substate-of':    { card: placeholderEdge },
  'statechart.transition':     { card: placeholderEdge },
  'statechart.invokes-action': { card: placeholderEdge },
  'rtp.belongs-to-concept':    { card: placeholderEdge },
};
