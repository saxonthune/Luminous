import type { JSX } from 'solid-js';
import type { RegisteredNodeRect } from './types.js';

export type VisualLodStatus = 'placed' | 'occluded' | 'hidden';

export type VisualLodPlacement =
  | 'top-left'
  | 'top-right'
  | 'above-left'
  | 'above'
  | 'above-right'
  | 'right'
  | 'below-right'
  | 'below'
  | 'below-left'
  | 'left';

export type VisualLodDisplacementDirection = 'up' | 'right' | 'down' | 'left';

export interface VisualLodDisplacement {
  maxDistance: number;
  step: number;
  directions: VisualLodDisplacementDirection[];
}

export interface VisualLodRenderState {
  zoom: () => number;
  status: () => VisualLodStatus;
}

/**
 * A screen-space visual anchored to graph geometry. The host owns its meaning
 * and content; cactus owns measurement, placement, collision policy, stacking,
 * and visibility. Nothing in this declaration is persisted by cactus.
 */
export interface VisualLodDeclaration {
  id: string;
  anchor: {
    nodeId: string;
    placement?: VisualLodPlacement;
    /** Offset or gap in screen pixels, after the camera transform. */
    offset?: { x: number; y: number };
  };
  /** Larger values win collisions and paint above smaller values. */
  priority: number;
  /** Items collide only with members of the same group. Default: `default`. */
  collisionGroup?: string;
  /** Optional progressive-disclosure cohort. Cactus admits the cohort's ranks
   * in ascending order and only opens the next rank when every Item in the
   * current rank remains visible. */
  admission?: {
    group: string;
    rank: number;
  };
  /** Inclusive lower camera scale. */
  minZoom?: number;
  /** Exclusive upper camera scale. */
  maxZoom?: number;
  placement?: {
    candidates?: VisualLodPlacement[];
    /** Search farther from each fixed candidate in bounded screen-pixel steps. */
    displacement?: VisualLodDisplacement;
    /** If false, an item with no collision-free candidate is hidden. */
    allowOcclusion?: boolean;
    /** Hide an occluded item below this approximate visible-area fraction. */
    minVisibleFraction?: number;
  };
  /** Optional no-layout fast path. Cactus uses this estimate while the camera
   * moves, then reconciles it with the rendered DOM after motion settles. */
  size?: {
    estimate: (zoom: number) => VisualLodSize;
    /** Content/style identity for invalidating a settled DOM measurement. */
    key?: string;
  };
  pointerEvents?: 'none' | 'auto';
  render: (state: VisualLodRenderState) => JSX.Element;
}

export interface VisualLodSize {
  w: number;
  h: number;
}

export interface VisualLodPlacementInput {
  declaration: VisualLodDeclaration;
  anchorRect: RegisteredNodeRect;
  size: VisualLodSize;
}

export interface PlacedVisualLod {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  candidate: VisualLodPlacement;
  displacement: { x: number; y: number };
  status: VisualLodStatus;
  visibleFraction: number;
  zIndex: number;
}

export interface VisualLodPlacementOptions {
  /** Preserve the current visual explanation before filling newly available
   * space. Intended for the reconciliation pass after camera motion. */
  retainVisiblePlacements?: boolean;
}

const DEFAULT_CANDIDATES: VisualLodPlacement[] = [
  'top-left',
  'above-left',
  'above',
  'above-right',
  'top-right',
  'right',
  'below-right',
  'below',
  'below-left',
  'left',
];

/** Stateful zoom gate: entering uses the declared range while an already
 * visible item receives a small exit margin on both boundaries. */
export function visualLodItemIsWithinZoom(
  declaration: Pick<VisualLodDeclaration, 'minZoom' | 'maxZoom'>,
  zoom: number,
  wasVisible: boolean,
  hysteresis = 0.03,
): boolean {
  const margin = wasVisible ? hysteresis : 0;
  return zoom >= (declaration.minZoom ?? -Infinity) - margin
    && zoom < (declaration.maxZoom ?? Infinity) + margin;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function candidateRect(
  placement: VisualLodPlacement,
  anchor: RegisteredNodeRect,
  size: VisualLodSize,
  offset: { x: number; y: number },
): Rect {
  const centerX = anchor.x + anchor.w / 2;
  const centerY = anchor.y + anchor.h / 2;
  switch (placement) {
    case 'top-left': return { x: anchor.x + offset.x, y: anchor.y + offset.y, ...size };
    case 'top-right': return { x: anchor.x + anchor.w - size.w - offset.x, y: anchor.y + offset.y, ...size };
    case 'above-left': return { x: anchor.x + offset.x, y: anchor.y - size.h - offset.y, ...size };
    case 'above': return { x: centerX - size.w / 2, y: anchor.y - size.h - offset.y, ...size };
    case 'above-right': return { x: anchor.x + anchor.w - size.w - offset.x, y: anchor.y - size.h - offset.y, ...size };
    case 'right': return { x: anchor.x + anchor.w + offset.x, y: centerY - size.h / 2, ...size };
    case 'below-right': return { x: anchor.x + anchor.w - size.w - offset.x, y: anchor.y + anchor.h + offset.y, ...size };
    case 'below': return { x: centerX - size.w / 2, y: anchor.y + anchor.h + offset.y, ...size };
    case 'below-left': return { x: anchor.x + offset.x, y: anchor.y + anchor.h + offset.y, ...size };
    case 'left': return { x: anchor.x - size.w - offset.x, y: centerY - size.h / 2, ...size };
  }
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

function overlapDepth(a: Rect, b: Rect): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)),
    y: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)),
  };
}

function displacementOffsets(
  displacement: VisualLodDisplacement | undefined,
): Array<{ x: number; y: number }> {
  const offsets = [{ x: 0, y: 0 }];
  if (!displacement || displacement.maxDistance <= 0 || displacement.step <= 0) return offsets;
  const directions = [...new Set(displacement.directions)];
  for (let distance = displacement.step; distance <= displacement.maxDistance; distance += displacement.step) {
    for (const direction of directions) {
      switch (direction) {
        case 'up': offsets.push({ x: 0, y: -distance }); break;
        case 'right': offsets.push({ x: distance, y: 0 }); break;
        case 'down': offsets.push({ x: 0, y: distance }); break;
        case 'left': offsets.push({ x: -distance, y: 0 }); break;
      }
    }
  }
  return offsets;
}

/**
 * Deterministic weighted point-label placement. Higher-priority declarations
 * claim collision-free candidates first, subject to optional admission ranks.
 * A lower-priority item can fall back behind them while enough of its area
 * remains visible, otherwise it is hidden.
 */
export function placeVisualLodItems(
  inputs: ReadonlyArray<VisualLodPlacementInput>,
  previous: ReadonlyMap<string, PlacedVisualLod> = new Map(),
  options: VisualLodPlacementOptions = {},
): Map<string, PlacedVisualLod> {
  const compare = (a: VisualLodPlacementInput, b: VisualLodPlacementInput) => {
    if (options.retainVisiblePlacements) {
      const aVisible = previous.get(a.declaration.id)?.status !== undefined
        && previous.get(a.declaration.id)?.status !== 'hidden';
      const bVisible = previous.get(b.declaration.id)?.status !== undefined
        && previous.get(b.declaration.id)?.status !== 'hidden';
      if (aVisible !== bVisible) return aVisible ? -1 : 1;
    }
    return b.declaration.priority - a.declaration.priority || a.declaration.id.localeCompare(b.declaration.id);
  };
  const ordered = [...inputs].sort(compare);
  const zIndexById = new Map(ordered.map((input, order) => [input.declaration.id, ordered.length - order]));
  const accepted: Array<{ group: string; rect: Rect }> = [];
  const result = new Map<string, PlacedVisualLod>();

  const place = (input: VisualLodPlacementInput): PlacedVisualLod => {
    const declaration = input.declaration;
    const group = declaration.collisionGroup ?? 'default';
    const offset = declaration.anchor.offset ?? { x: 0, y: 0 };
    const candidates = declaration.placement?.candidates?.length
      ? declaration.placement.candidates
      : [declaration.anchor.placement ?? 'top-left', ...DEFAULT_CANDIDATES];
    const uniqueCandidates = [...new Set(candidates)];
    const displacements = displacementOffsets(declaration.placement?.displacement);
    // Preserve a still-valid prior placement before considering a new anchor.
    // This is the small amount of hysteresis that keeps continuous zoom from
    // making labels hop between equally good candidates.
    const priorCandidate = previous.get(declaration.id)?.candidate;
    if (priorCandidate && uniqueCandidates.includes(priorCandidate)) {
      uniqueCandidates.splice(uniqueCandidates.indexOf(priorCandidate), 1);
      uniqueCandidates.unshift(priorCandidate);
    }
    const priorDisplacement = previous.get(declaration.id)?.displacement ?? { x: 0, y: 0 };
    const choices = displacements.flatMap((displacement) => uniqueCandidates.map((candidate) => {
      const base = candidateRect(candidate, input.anchorRect, input.size, offset);
      const rect = { ...base, x: base.x + displacement.x, y: base.y + displacement.y };
      const overlap = accepted
        .filter((placed) => placed.group === group)
        .reduce((sum, placed) => sum + overlapArea(rect, placed.rect), 0);
      return { candidate, displacement, rect, overlap };
    }));
    const priorIndex = choices.findIndex((choice) =>
      choice.candidate === priorCandidate
      && choice.displacement.x === priorDisplacement.x
      && choice.displacement.y === priorDisplacement.y,
    );
    if (priorIndex > 0) choices.unshift(...choices.splice(priorIndex, 1));
    const collisionFree = choices.find((choice) => choice.overlap === 0);
    const best = collisionFree ?? choices.reduce((least, choice) => choice.overlap < least.overlap ? choice : least);
    const area = Math.max(1, input.size.w * input.size.h);
    const visibleFraction = Math.max(0, 1 - Math.min(area, best.overlap) / area);
    const minVisible = declaration.placement?.minVisibleFraction ?? 0.4;
    const canOcclude = declaration.placement?.allowOcclusion ?? true;
    const status: VisualLodStatus = collisionFree
      ? 'placed'
      : canOcclude && visibleFraction >= minVisible
        ? 'occluded'
        : 'hidden';

    const placed: PlacedVisualLod = {
      id: declaration.id,
      ...best.rect,
      candidate: best.candidate,
      displacement: best.displacement,
      status,
      visibleFraction,
      zIndex: zIndexById.get(declaration.id) ?? 0,
    };
    if (status !== 'hidden') accepted.push({ group, rect: best.rect });
    return placed;
  };

  const hiddenByAdmission = (input: VisualLodPlacementInput): PlacedVisualLod => {
    const declaration = input.declaration;
    const offset = declaration.anchor.offset ?? { x: 0, y: 0 };
    const candidates = declaration.placement?.candidates?.length
      ? declaration.placement.candidates
      : [declaration.anchor.placement ?? 'top-left', ...DEFAULT_CANDIDATES];
    const candidate = previous.get(declaration.id)?.candidate ?? candidates[0];
    const displacement = previous.get(declaration.id)?.displacement ?? { x: 0, y: 0 };
    const base = candidateRect(candidate, input.anchorRect, input.size, offset);
    return {
      id: declaration.id,
      ...base,
      x: base.x + displacement.x,
      y: base.y + displacement.y,
      candidate,
      displacement,
      status: 'hidden',
      visibleFraction: 0,
      zIndex: zIndexById.get(declaration.id) ?? 0,
    };
  };

  interface AdmissionState {
    ranks: number[];
    members: Map<number, VisualLodPlacementInput[]>;
    rankIndex: number;
    remaining: number;
    rankFailed: boolean;
  }
  const admissionGroups = new Map<string, AdmissionState>();
  const ready: VisualLodPlacementInput[] = [];

  for (const input of ordered) {
    const admission = input.declaration.admission;
    if (!admission) {
      ready.push(input);
      continue;
    }
    let state = admissionGroups.get(admission.group);
    if (!state) {
      state = { ranks: [], members: new Map(), rankIndex: 0, remaining: 0, rankFailed: false };
      admissionGroups.set(admission.group, state);
    }
    const members = state.members.get(admission.rank) ?? [];
    members.push(input);
    state.members.set(admission.rank, members);
  }

  for (const state of admissionGroups.values()) {
    state.ranks = [...state.members.keys()].sort((a, b) => a - b);
    const first = state.members.get(state.ranks[0]) ?? [];
    state.remaining = first.length;
    ready.push(...first);
  }

  while (ready.length > 0) {
    ready.sort(compare);
    const input = ready.shift()!;
    const placed = place(input);
    result.set(input.declaration.id, placed);

    const admission = input.declaration.admission;
    if (!admission) continue;
    const state = admissionGroups.get(admission.group)!;
    state.remaining -= 1;
    if (placed.status === 'hidden') state.rankFailed = true;
    if (state.remaining > 0) continue;

    state.rankIndex += 1;
    if (state.rankFailed) {
      for (const rank of state.ranks.slice(state.rankIndex)) {
        for (const blocked of state.members.get(rank) ?? []) {
          result.set(blocked.declaration.id, hiddenByAdmission(blocked));
        }
      }
      continue;
    }

    const next = state.members.get(state.ranks[state.rankIndex]) ?? [];
    state.remaining = next.length;
    state.rankFailed = false;
    ready.push(...next);
  }

  return result;
}


/**
 * Cheap, temporally stable projection used while the camera is moving.
 * Existing cards keep their candidate and displacement, hidden cards do not
 * enter, and a card suppressed by a hard collision stays hidden for the rest
 * of the gesture. `hardOverlapTolerance` is measured along both screen axes.
 */
export function projectVisualLodItemsDuringInteraction(
  inputs: ReadonlyArray<VisualLodPlacementInput>,
  committed: ReadonlyMap<string, PlacedVisualLod>,
  suppressed: ReadonlySet<string> = new Set(),
  hardOverlapTolerance = 3,
): Map<string, PlacedVisualLod> {
  const ordered = [...inputs].sort((a, b) =>
    b.declaration.priority - a.declaration.priority || a.declaration.id.localeCompare(b.declaration.id));
  const accepted: Array<{ group: string; rect: Rect }> = [];
  const result = new Map<string, PlacedVisualLod>();

  for (const input of ordered) {
    const prior = committed.get(input.declaration.id);
    if (!prior) continue;
    const offset = input.declaration.anchor.offset ?? { x: 0, y: 0 };
    const base = candidateRect(prior.candidate, input.anchorRect, input.size, offset);
    const rect = {
      ...base,
      x: base.x + prior.displacement.x,
      y: base.y + prior.displacement.y,
    };
    const group = input.declaration.collisionGroup ?? 'default';
    const hardCollision = accepted.some((placed) => {
      if (placed.group !== group) return false;
      const overlap = overlapDepth(rect, placed.rect);
      return overlap.x > hardOverlapTolerance && overlap.y > hardOverlapTolerance;
    });
    const hidden = prior.status === 'hidden' || suppressed.has(prior.id) || hardCollision;
    const status = hidden ? 'hidden' : prior.status;
    result.set(prior.id, {
      ...prior,
      ...rect,
      status,
      visibleFraction: hidden ? 0 : prior.visibleFraction,
    });
    if (!hidden) accepted.push({ group, rect });
  }

  return result;
}
