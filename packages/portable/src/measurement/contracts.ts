import type { PortableCard, PortableNode, PortableTheme, NodeMeasurement } from '../graph.js';

export interface MeasurementItem { id: string; node: PortableNode; descendantCount?: number }
export interface MeasurementInput { items: MeasurementItem[]; theme?: PortableTheme }
export type MeasurementOutput = Record<string, NodeMeasurement>;

/** Width is a presentation constraint, never a guess about text length. */
export function componentWidth(card?: PortableCard): number | undefined {
  if (card?.modifiers?.length) return 340;
  switch (card?.component) {
    case 'schema-card': return 400;
    case 'usage-card': return 520;
    case 'rest-card': return 240;
    case 'transition': return 144;
    case 'card': return 340;
    default: return undefined;
  }
}
