import type { NodeRenderer, EdgeRenderer, KindId, DisclosureLevel } from '@luminous/canvas-core';
import StateCard, { StatePeek, StateOpen } from './renderers/StateCard.tsx';
import CompositeCard, { CompositePeek, CompositeOpen } from './renderers/CompositeCard.tsx';
import RegionCard, { RegionPeek, RegionOpen } from './renderers/RegionCard.tsx';
import TransitionCard, { TransitionPeek, TransitionOpen } from './renderers/TransitionCard.tsx';
import ConceptCard, { ConceptPeek, ConceptOpen } from './renderers/ConceptCard.tsx';
import ActionCard, { ActionPeek, ActionOpen } from './renderers/ActionCard.tsx';

const placeholderEdge: EdgeRenderer = (edge) =>
  `[${edge.kind}] ${edge.from} → ${edge.to}`;

export const nodeRenderers: Record<KindId, Partial<Record<DisclosureLevel, NodeRenderer>>> = {
  'statechart.region':     { peek: RegionPeek,     card: RegionCard,     open: RegionOpen },
  'statechart.composite':  { peek: CompositePeek,  card: CompositeCard,  open: CompositeOpen },
  'statechart.state':      { peek: StatePeek,      card: StateCard,      open: StateOpen },
  'statechart.transition': { peek: TransitionPeek, card: TransitionCard, open: TransitionOpen },
  'rtp.concept':           { peek: ConceptPeek,    card: ConceptCard,    open: ConceptOpen },
  'rtp.action':            { peek: ActionPeek,     card: ActionCard,     open: ActionOpen },
};

export const edgeRenderers: Record<KindId, Partial<Record<DisclosureLevel, EdgeRenderer>>> = {
  'statechart.substate-of':    { card: placeholderEdge },
  'statechart.transition':     { card: placeholderEdge },
  'statechart.invokes-action': { card: placeholderEdge },
  'rtp.belongs-to-concept':    { card: placeholderEdge },
};
