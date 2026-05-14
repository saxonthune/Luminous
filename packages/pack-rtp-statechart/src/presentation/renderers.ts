import type { NodeRenderer, EdgeRenderer, KindId, DisclosureLevel } from '@luminous/canvas-core';
import StateCard from './renderers/StateCard.tsx';
import CompositeCard from './renderers/CompositeCard.tsx';
import RegionCard from './renderers/RegionCard.tsx';
import TransitionCard from './renderers/TransitionCard.tsx';
import ConceptCard from './renderers/ConceptCard.tsx';
import ActionCard from './renderers/ActionCard.tsx';

const placeholderEdge: EdgeRenderer = (edge) =>
  `[${edge.kind}] ${edge.from} → ${edge.to}`;

export const nodeRenderers: Record<KindId, Partial<Record<DisclosureLevel, NodeRenderer>>> = {
  'statechart.region':     { card: RegionCard },
  'statechart.composite':  { card: CompositeCard },
  'statechart.state':      { card: StateCard },
  'statechart.transition': { card: TransitionCard },
  'rtp.concept':           { card: ConceptCard },
  'rtp.action':            { card: ActionCard },
};

export const edgeRenderers: Record<KindId, Partial<Record<DisclosureLevel, EdgeRenderer>>> = {
  'statechart.substate-of':    { card: placeholderEdge },
  'statechart.transition':     { card: placeholderEdge },
  'statechart.invokes-action': { card: placeholderEdge },
  'rtp.belongs-to-concept':    { card: placeholderEdge },
};
