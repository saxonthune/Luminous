import { z } from 'zod';
import type { NodeKind, EdgeKind } from '@luminous/canvas-core';

// --- Node prop schemas ---

const regionProps = z.object({
  description: z.string(),
  initial: z.string().optional(),
});

const compositeProps = z.object({
  description: z.string(),
  tags: z.array(z.string()).default([]),
  initial: z.string().optional(),
  parallel: z.boolean().default(false),
});

const stateProps = z.object({
  description: z.string(),
  tags: z.array(z.string()).default([]),
  surface: z.string().optional(),
  reads: z.array(z.string()).optional(),
});

const transitionNodeProps = z.object({
  event: z.string(),
  description: z.string(),
  actions: z.array(z.string()).default([]),
});

const conceptProps = z.object({
  name: z.string(),
  purpose: z.string(),
  state: z.string(),
  operationalPrinciple: z.string(),
});

const actionProps = z.object({
  name: z.string(),
  signature: z.string(),
  description: z.string(),
  conceptId: z.string(),
});

// --- Node kinds ---

export const regionKind: NodeKind = {
  id: 'statechart.region',
  label: 'Region',
  propsSchema: regionProps,
  idDerivation: (input) => {
    const { name } = input as { name: string };
    return `region.${name}`;
  },
};

export const compositeKind: NodeKind = {
  id: 'statechart.composite',
  label: 'Composite',
  propsSchema: compositeProps,
  idDerivation: (input) => {
    const { path } = input as { path: string };
    return `composite.${path}`;
  },
};

export const stateKind: NodeKind = {
  id: 'statechart.state',
  label: 'State',
  propsSchema: stateProps,
  idDerivation: (input) => {
    const { path } = input as { path: string };
    return `state.${path}`;
  },
};

export const transitionNodeKind: NodeKind = {
  id: 'statechart.transition',
  label: 'Transition',
  propsSchema: transitionNodeProps,
  idDerivation: (input) => {
    const { sourceStateId, event } = input as { sourceStateId: string; event: string };
    return `transition.${sourceStateId}.${event}`;
  },
};

export const conceptKind: NodeKind = {
  id: 'rtp.concept',
  label: 'Concept',
  propsSchema: conceptProps,
  idDerivation: (input) => {
    const { normalizedName } = input as { normalizedName: string };
    return `concept.${normalizedName}`;
  },
};

export const actionKind: NodeKind = {
  id: 'rtp.action',
  label: 'Action',
  propsSchema: actionProps,
  idDerivation: (input) => {
    const { conceptId, actionName } = input as { conceptId: string; actionName: string };
    return `action.${conceptId}.${actionName}`;
  },
};

export const nodeKinds: NodeKind[] = [
  regionKind,
  compositeKind,
  stateKind,
  transitionNodeKind,
  conceptKind,
  actionKind,
];

// --- Edge prop schemas ---

const emptyProps = z.object({});

// --- Edge kinds ---

export const substateOfEdgeKind: EdgeKind = {
  id: 'statechart.substate-of',
  label: 'Substate of',
  propsSchema: emptyProps,
  directed: true,
  acceptsSource: ['statechart.composite', 'statechart.state'],
  acceptsTarget: ['statechart.region', 'statechart.composite'],
};

export const transitionEdgeKind: EdgeKind = {
  id: 'statechart.transition',
  label: 'Transition',
  propsSchema: emptyProps,
  directed: true,
  acceptsSource: ['statechart.composite', 'statechart.state'],
  acceptsTarget: ['statechart.composite', 'statechart.state'],
};

export const invokesActionEdgeKind: EdgeKind = {
  id: 'statechart.invokes-action',
  label: 'Invokes action',
  propsSchema: emptyProps,
  directed: true,
  acceptsSource: ['statechart.transition'],
  acceptsTarget: ['rtp.action'],
};

export const belongsToConceptEdgeKind: EdgeKind = {
  id: 'rtp.belongs-to-concept',
  label: 'Belongs to concept',
  propsSchema: emptyProps,
  directed: true,
  acceptsSource: ['rtp.action'],
  acceptsTarget: ['rtp.concept'],
};

export const edgeKinds: EdgeKind[] = [
  substateOfEdgeKind,
  transitionEdgeKind,
  invokesActionEdgeKind,
  belongsToConceptEdgeKind,
];
