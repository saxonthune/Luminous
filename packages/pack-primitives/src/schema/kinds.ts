import { z } from 'zod';
import type { NodeKind, EdgeKind } from '@luminous/canvas-core';

const boxProps = z.object({
  label: z.string(),
  description: z.string().optional(),
  color: z.string().optional(),
  tag: z.string().optional(),
});

const arrowProps = z.object({
  label: z.string().optional(),
  color: z.string().optional(),
});

export const boxKind: NodeKind = {
  id: 'prim.box',
  label: 'Box',
  propsSchema: boxProps,
  idDerivation: (input) => {
    const { label } = input as { label: string };
    return `box.${label.toLowerCase().replace(/\s+/g, '-')}`;
  },
};

export const arrowKind: EdgeKind = {
  id: 'prim.arrow',
  label: 'Arrow',
  propsSchema: arrowProps,
  directed: true,
};

export const nodeKinds: NodeKind[] = [boxKind];
export const edgeKinds: EdgeKind[] = [arrowKind];
