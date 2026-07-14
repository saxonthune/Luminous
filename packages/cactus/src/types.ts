import type { JSX } from 'solid-js';

/**
 * A declared edge for cactus to draw. Cactus computes geometry; the host
 * declares connectivity and optional styling hints. Domain-agnostic — no
 * knowledge of kinds, views, roles, layers, or packs.
 */
export interface EdgeDeclaration {
  id: string;
  sourceId: string;
  targetId: string;
  styling?: EdgeStyling;
  /** Raw label text. When present, cactus renders it truncated and click-revealable. */
  labelText?: string;
  /** Optional Solid component rendered at the path midpoint. */
  label?: () => JSX.Element;
}

export interface EdgeStyling {
  /** CSS variable name (without leading --), e.g. 'accent' or 'fg-muted'. */
  colorToken?: string;
  dash?: 'solid' | 'dashed' | 'dotted';
  width?: number;
  /** Show an arrowhead triangle on the target end. Default false. */
  arrowHead?: boolean;
}

/**
 * A declared cluster for cactus to render as a tinted underlay behind a set
 * of member nodes. Cactus derives the bounds from the members' registered
 * rects; the host declares membership and optional styling — see
 * doc02.05.06.
 */
export interface ClusterDeclaration {
  id: string;
  memberIds: string[];
  label?: string;
  tint?: string;
  /** When provided, the label becomes editable: double-click swaps it for a
      text input; commit (Enter or blur) calls back with the new value. */
  onLabelEdit?: (newLabel: string) => void;
}
