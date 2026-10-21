export const JOURNEY_TYPE = 'Journey';
export const USER_ACTION_TYPE = 'User Action';
export const INSTANCE_TYPE = 'Instance';
export const CAPABILITY_TYPE = 'Capability';

export interface DenimDefaultNodeType {
  readonly name: string;
  readonly themeSlot: number;
}

/** Canonical starting type set for a new Denim project. */
export const DEFAULT_DENIM_NODE_TYPES = [
  { name: JOURNEY_TYPE, themeSlot: 1 },
  { name: USER_ACTION_TYPE, themeSlot: 2 },
  { name: CAPABILITY_TYPE, themeSlot: 5 },
  { name: INSTANCE_TYPE, themeSlot: 4 },
  { name: 'Organization', themeSlot: 6 },
  { name: 'Module', themeSlot: 7 },
  { name: 'Contract', themeSlot: 8 },
] as const satisfies readonly DenimDefaultNodeType[];
