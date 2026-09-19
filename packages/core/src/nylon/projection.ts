import type { NylonContract, NylonDocument, NylonTransformation } from './types.ts';
import { checkNylonDocument, nylonArcId } from './diagnostics.ts';
import {
  placeRectAtCandidates,
  spaceRectangles,
  computeBounds,
  type CandidatePlacementPoint,
  type CandidatePlacementRect,
  type EdgeDeclaration,
  type RegisteredNodeRect,
} from '@luminous/cactus/layout';

export const TRANSFORMATION_SIZE = 180;
export const STANDARD_CARD_WIDTH = 300;
export const STANDARD_CARD_HEIGHT = 270;
export const CONTRACT_WIDTH = 220;
export const CONTRACT_HEIGHT = 110;
export const COMPACT_CONTRACT_WIDTH = 136;
export const COMPACT_CONTRACT_HEIGHT = 46;
export const COMPACT_PAIR_WIDTH = 160;
export const COMPACT_PAIR_HEIGHT = 142;
export const CONTAINER_PADDING = 42;
export const CONTAINER_HEADER = 38;
export const COLLAPSED_CONTAINER_WIDTH = TRANSFORMATION_SIZE;
export const COLLAPSED_CONTAINER_HEIGHT = 54;
export const DISCLOSURE_GAP = 28;
export const EDGE_VISUAL_BAND = 100;
export const CONTRACT_FRAME_VISUAL_BAND = 150;
export const LEAF_VISUAL_BAND = 200;
export type NylonContainerState = 'expanded' | 'covered' | 'collapsed';

export type NylonViewDefinition =
  | { kind: 'continuous' }
  | { kind: 'standard'; focusId: string | null };

export type NylonRenderNode = (
  | { kind: 'transformation'; renderId: string; item: NylonTransformation; x: number; y: number; w: number; h: number; depth: number }
  | { kind: 'contract'; renderId: string; item: NylonContract; x: number; y: number; w: number; h: number; depth: number; boundaryContainerId?: string; compact?: boolean }
  | { kind: 'container'; renderId: string; item: NylonTransformation; x: number; y: number; w: number; h: number; depth: number; expanded: boolean; state: NylonContainerState }
) & { context?: boolean };

export interface NylonProjection {
  nodes: NylonRenderNode[];
  contractFrames: NylonContractFrame[];
  edges: EdgeDeclaration[];
}

export interface NylonContractFrame {
  controlArcId?: string;
  id: string;
  transformationId: string;
  name: string;
  input: string;
  output: string;
  inputRenderId: string;
  outputRenderId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  boundaryContainerId?: string;
  compact?: boolean;
}

interface LayoutNode {
  id: string;
  w: number;
  h: number;
  x: number;
  y: number;
}

function center(rect: RegisteredNodeRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function exitRect(
  from: { x: number; y: number },
  toward: { x: number; y: number },
  rect: RegisteredNodeRect,
): { x: number; y: number } {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const tx = dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

function visibleEdgeRoute(
  sourceId: string,
  targetId: string,
  rects: ReadonlyMap<string, RegisteredNodeRect>,
) {
  const source = rects.get(sourceId);
  const target = rects.get(targetId);
  if (!source || !target) return null;
  const sourceCenter = center(source);
  const targetCenter = center(target);
  return {
    points: [
      exitRect(sourceCenter, targetCenter, source),
      exitRect(targetCenter, sourceCenter, target),
    ],
    segmentLayers: [EDGE_VISUAL_BAND],
  };
}

function boundaryCandidates(
  midpoint: CandidatePlacementPoint,
  source: CandidatePlacementPoint,
  target: CandidatePlacementPoint,
  container: CandidatePlacementRect,
): CandidatePlacementPoint[] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const along = { x: dx / length, y: dy / length };
  const across = { x: -along.y, y: along.x };
  const step = Math.max(COMPACT_PAIR_WIDTH, COMPACT_PAIR_HEIGHT) + 24;
  const result = [midpoint];
  for (let ring = 1; ring <= 4; ring += 1) {
    const distance = step * ring;
    const diagonal = distance * 0.72;
    result.push(
      { x: midpoint.x + across.x * distance, y: midpoint.y + across.y * distance },
      { x: midpoint.x - across.x * distance, y: midpoint.y - across.y * distance },
      { x: midpoint.x + along.x * distance, y: midpoint.y + along.y * distance },
      { x: midpoint.x - along.x * distance, y: midpoint.y - along.y * distance },
      { x: midpoint.x + (across.x + along.x) * diagonal, y: midpoint.y + (across.y + along.y) * diagonal },
      { x: midpoint.x + (across.x - along.x) * diagonal, y: midpoint.y + (across.y - along.y) * diagonal },
      { x: midpoint.x + (-across.x + along.x) * diagonal, y: midpoint.y + (-across.y + along.y) * diagonal },
      { x: midpoint.x - (across.x + along.x) * diagonal, y: midpoint.y - (across.y + along.y) * diagonal },
    );
  }
  const halfWidth = COMPACT_PAIR_WIDTH / 2;
  const halfHeight = COMPACT_PAIR_HEIGHT / 2;
  const boundedX = container.width >= COMPACT_PAIR_WIDTH
    ? Math.min(Math.max(midpoint.x, container.x + halfWidth), container.x + container.width - halfWidth)
    : container.x + container.width / 2;
  const boundedY = container.height >= COMPACT_PAIR_HEIGHT
    ? Math.min(Math.max(midpoint.y, container.y + halfHeight), container.y + container.height - halfHeight)
    : container.y + container.height / 2;
  result.push(
    { x: container.x, y: boundedY },
    { x: container.x + container.width, y: boundedY },
    { x: boundedX, y: container.y },
    { x: boundedX, y: container.y + container.height },
  );
  return result
    .map((point, index) => ({ point, index, distance: Math.hypot(point.x - midpoint.x, point.y - midpoint.y) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .filter((candidate, index, candidates) => candidates.findIndex((other) => (
      Math.abs(other.point.x - candidate.point.x) < 0.01
      && Math.abs(other.point.y - candidate.point.y) < 0.01
    )) === index)
    .map((candidate) => candidate.point);
}

/**
 * Project stable parent-relative positions into the currently disclosed
 * canvas. Disclosure changes visibility and container sizes without changing
 * the stored positions. Standard View fixes one level of detail and adds only
 * the exact endpoints of Arcs crossing that detail's boundary. Its focus is
 * drawn at the origin; Child positions remain relative to that focus.
 */
export function projectNylon(
  doc: NylonDocument,
  collapsedIds: ReadonlySet<string> = new Set<string>(),
  selectedRenderIds: ReadonlySet<string> = new Set<string>(),
  boundaryViewport?: CandidatePlacementRect,
  coveredIds: ReadonlySet<string> = new Set<string>(),
  view: NylonViewDefinition = { kind: 'continuous' },
): NylonProjection {
  const standard = view.kind === 'standard';
  const focusId = view.kind === 'standard' ? view.focusId : null;
  const transformations = new Map(doc.transformations.map((item) => [item.id, item]));
  const allItems = new Map<string, NylonTransformation | NylonContract>([
    ...doc.transformations.map((item) => [item.id, item] as const),
    ...doc.contracts.map((item) => [item.id, item] as const),
  ]);
  const parentIds = new Set(
    [...allItems.values()]
      .map((item) => item.parent)
      .filter((id): id is string => id !== undefined),
  );
  const childrenOf = new Map<string | undefined, string[]>();
  for (const item of allItems.values()) {
    const siblings = childrenOf.get(item.parent) ?? [];
    siblings.push(item.id);
    childrenOf.set(item.parent, siblings);
  }

  const scope = new Set<string>();
  function includeDescendants(id: string): void {
    if (scope.has(id)) return;
    scope.add(id);
    for (const child of childrenOf.get(id) ?? []) includeDescendants(child);
  }
  if (standard) {
    if (focusId !== null) {
      if (!transformations.has(focusId)) return { nodes: [], edges: [], contractFrames: [] };
      includeDescendants(focusId);
    } else for (const id of allItems.keys()) scope.add(id);
  }
  const contextIds = new Set<string>();
  if (standard) for (const arc of doc.arcs) {
    if (scope.has(arc.from) === scope.has(arc.to)) continue;
    contextIds.add(scope.has(arc.from) ? arc.to : arc.from);
  }

  const localLayouts = new Map<string, LayoutNode>();
  const visibleIds = new Set<string>();

  function isContainer(id: string): boolean {
    return parentIds.has(id) && transformations.has(id);
  }

  function isExpanded(id: string): boolean {
    if (standard) return isContainer(id) && id === focusId;
    return isContainer(id) && !collapsedIds.has(id) && !coveredIds.has(id);
  }

  function layoutOf(id: string): LayoutNode {
    const cached = localLayouts.get(id);
    if (cached) return cached;
    const item = allItems.get(id);
    if (!item) return { id, x: 0, y: 0, w: 0, h: 0 };

    const base = { id, x: standard && id === focusId ? 0 : item.x ?? 0, y: standard && id === focusId ? 0 : item.y ?? 0 };
    if (!isContainer(id)) {
      const layout = transformations.has(id)
        ? { ...base, w: standard ? STANDARD_CARD_WIDTH : TRANSFORMATION_SIZE, h: standard ? STANDARD_CARD_HEIGHT : TRANSFORMATION_SIZE }
        : { ...base, w: CONTRACT_WIDTH, h: CONTRACT_HEIGHT };
      localLayouts.set(id, layout);
      return layout;
    }
    if (standard ? !isExpanded(id) : collapsedIds.has(id)) {
      const layout = { ...base, w: standard ? STANDARD_CARD_WIDTH : COLLAPSED_CONTAINER_WIDTH,
        h: standard ? STANDARD_CARD_HEIGHT : COLLAPSED_CONTAINER_HEIGHT };
      localLayouts.set(id, layout);
      return layout;
    }

    const childIds = childrenOf.get(id) ?? [];
    const childLayouts = childIds.map(layoutOf);
    for (const child of childLayouts) localLayouts.set(child.id, child);
    const maxX = Math.max(COLLAPSED_CONTAINER_WIDTH - CONTAINER_PADDING, ...childLayouts.map((child) => child.x + child.w));
    const maxY = Math.max(COLLAPSED_CONTAINER_HEIGHT - CONTAINER_PADDING, ...childLayouts.map((child) => child.y + child.h));
    const layout = {
      ...base,
      w: Math.max(COLLAPSED_CONTAINER_WIDTH, maxX + CONTAINER_PADDING),
      h: Math.max(COLLAPSED_CONTAINER_HEIGHT, maxY + CONTAINER_PADDING),
    };
    localLayouts.set(id, layout);
    return layout;
  }

  const rootIds = standard && focusId !== null ? [focusId] : childrenOf.get(undefined) ?? [];
  const rootLayouts = rootIds.map(layoutOf);
  for (const root of rootLayouts) localLayouts.set(root.id, root);

  const absolutePositions = new Map<string, { x: number; y: number }>();
  function placeVisible(id: string, parentPosition?: { x: number; y: number }): void {
    const layout = localLayouts.get(id) ?? layoutOf(id);
    const absolute = {
      x: (parentPosition?.x ?? 0) + layout.x,
      y: (parentPosition?.y ?? 0) + layout.y,
    };
    absolutePositions.set(id, absolute);
    visibleIds.add(id);
    if (!isExpanded(id)) return;
    for (const childId of childrenOf.get(id) ?? []) placeVisible(childId, absolute);
  }
  for (const rootId of rootIds) placeVisible(rootId);
  for (const id of contextIds) placeVisible(id);

  function depthOf(id: string): number {
    let depth = 0;
    let current = allItems.get(id)?.parent;
    const seen = new Set<string>();
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      depth += 1;
      current = transformations.get(current)?.parent;
    }
    return depth;
  }

  const nodes: NylonRenderNode[] = [...visibleIds]
    .map((id): NylonRenderNode | null => {
      const item = allItems.get(id);
      const position = absolutePositions.get(id);
      const layout = localLayouts.get(id);
      if (!item || !position || !layout) return null;
      const depth = depthOf(id);
      if (isContainer(id)) {
        return {
          kind: 'container', renderId: id, item: item as NylonTransformation,
          ...position, w: layout.w, h: layout.h, depth, expanded: isExpanded(id),
          state: standard ? isExpanded(id) ? 'expanded' : 'collapsed'
            : collapsedIds.has(id) ? 'collapsed' : coveredIds.has(id) ? 'covered' : 'expanded',
        };
      }
      return transformations.has(id)
        ? { kind: 'transformation', renderId: id, item: item as NylonTransformation, ...position, w: layout.w, h: layout.h, depth }
        : { kind: 'contract', renderId: id, item: item as NylonContract, ...position, w: layout.w, h: layout.h, depth };
    })
    .filter((node): node is NylonRenderNode => node !== null)
    .sort((a, b) => a.depth - b.depth);

  if (standard) {
    const focus = nodes.find((node) => node.kind === 'container' && node.item.id === focusId);
    if (focus) {
      const pairedIds = new Set(doc.transformations.flatMap((item) => item.contractPair
        ? [item.contractPair.input, item.contractPair.output] : []));
      const children = nodes.filter((node) => node.item.parent === focusId && !contextIds.has(node.item.id));
      const bounds = computeBounds(children.map((node) => ({
        x: node.x - (pairedIds.has(node.item.id) ? 14 : 0),
        y: node.y - (pairedIds.has(node.item.id) ? 38 : 0),
        width: node.w + (pairedIds.has(node.item.id) ? 28 : 0),
        height: node.h + (pairedIds.has(node.item.id) ? 52 : 0),
      })), { padding: CONTAINER_PADDING, minWidth: STANDARD_CARD_WIDTH });
      focus.x = bounds.x; focus.y = bounds.y - CONTAINER_HEADER;
      focus.w = bounds.width; focus.h = bounds.height + CONTAINER_HEADER;
    }
    // Context uses local display geometry; primary Children keep their authored
    // relative coordinates. Cactus spaces context units outside that detail.
    const primary = nodes.filter((node) => !contextIds.has(node.item.id));
    const left = Math.min(0, ...primary.map((node) => node.x));
    const right = Math.max(TRANSFORMATION_SIZE, ...primary.map((node) => node.x + node.w));
    const context = nodes.filter((node) => contextIds.has(node.item.id));
    const byId = new Map(context.map((node) => [node.item.id, node]));
    const used = new Set<string>();
    const groups: NylonRenderNode[][] = [];
    for (const owner of doc.transformations) {
      const pair = owner.contractPair;
      if (!pair || used.has(pair.input) || used.has(pair.output)) continue;
      const input = byId.get(pair.input);
      const output = byId.get(pair.output);
      if (!input || !output) continue;
      groups.push([input, output]);
      used.add(pair.input); used.add(pair.output);
    }
    for (const node of context) if (!used.has(node.item.id)) groups.push([node]);
    const units = groups.map((group, index) => {
      const incoming = doc.arcs.some((arc) => group.some((node) => node.item.id === arc.from) && scope.has(arc.to));
      const connected = doc.arcs.flatMap((arc) => {
        let id: string | undefined = group.some((node) => node.item.id === arc.from) ? arc.to
          : group.some((node) => node.item.id === arc.to) ? arc.from : undefined;
        const seen = new Set<string>();
        while (id !== undefined && !seen.has(id)) {
          const node = primary.find((candidate) => candidate.item.id === id);
          if (node) return [node.y];
          seen.add(id); id = allItems.get(id)?.parent;
        }
        return [];
      });
      const width = Math.max(...group.map((node) => node.w)) + 28;
      return {
        id: String(index), x: incoming ? left - width - 100 : right + 100,
        y: connected.length ? Math.min(...connected) : 0,
        width, height: group.reduce((sum, node) => sum + node.h + 28, 38),
      };
    });
    // Separate columns so spacing cannot put context inside the focused detail.
    for (const incoming of [true, false]) {
      const column = units.filter((unit) => (unit.x < left) === incoming);
      const placed = spaceRectangles(column, {
        gap: 48, columns: 1,
        origin: { x: incoming ? left - Math.max(0, ...column.map((unit) => unit.width)) - 100 : right + 100, y: 0 },
      });
      for (const position of placed) {
        let y = position.y + 38;
        for (const node of groups[Number(position.id)]) {
          node.x = position.x + 14; node.y = y; node.depth = 0; node.context = true;
          y += node.h + 28;
        }
      }
    }
  }

  const contractNodes = new Map(
    nodes.filter((node): node is Extract<NylonRenderNode, { kind: 'contract' }> => node.kind === 'contract')
      .map((node) => [node.item.id, node]),
  );
  const contractOwners = [
    ...doc.transformations.map((item) => ({ ...item, controlArcId: undefined as string | undefined })),
    ...doc.arcs.flatMap((arc, index) => arc.kind === 'control' && arc.controlContract ? [{
      id: arc.from, name: transformations.get(arc.to)?.name ?? arc.to,
      contractPair: arc.controlContract, controlArcId: nylonArcId(arc, index),
    }] : []),
  ];
  const contractFrames = contractOwners.flatMap((transformation): NylonContractFrame[] => {
    if (!transformation.contractPair) return [];
    const facets = [transformation.contractPair.input, transformation.contractPair.output]
      .map((id) => contractNodes.get(id))
      .filter((node) => node !== undefined);
    if (facets.length < 2) return [];
    const facetParents = new Set(facets.map((node) => node.item.parent));
    if (facetParents.size !== 1) return [];

    const padding = 14;
    const header = 24;
    const minX = Math.min(...facets.map((node) => node.x));
    const minY = Math.min(...facets.map((node) => node.y));
    const maxX = Math.max(...facets.map((node) => node.x + node.w));
    const maxY = Math.max(...facets.map((node) => node.y + node.h));
    return [{
      id: transformation.controlArcId ? `control-contract:${transformation.controlArcId}` : `${transformation.id}-contract-pair`,
      transformationId: transformation.id, controlArcId: transformation.controlArcId,
      name: transformation.name, input: transformation.contractPair.input,
      output: transformation.contractPair.output,
      inputRenderId: transformation.contractPair.input,
      outputRenderId: transformation.contractPair.output,
      x: minX - padding, y: minY - header - padding,
      w: maxX - minX + 2 * padding, h: maxY - minY + header + 2 * padding,
    }];
  });

  function visibleRepresentative(id: string): string | null {
    if (!allItems.has(id)) return null;
    if (standard) {
      if (visibleIds.has(id)) return id;
      if (!scope.has(id)) return null;
      let parent = allItems.get(id)?.parent;
      const seen = new Set<string>();
      while (parent !== undefined && !seen.has(parent)) {
        if (visibleIds.has(parent)) return parent;
        seen.add(parent);
        parent = transformations.get(parent)?.parent;
      }
      return null;
    }
    const ancestors: string[] = [];
    let current = allItems.get(id)?.parent;
    while (current !== undefined) {
      ancestors.push(current);
      current = transformations.get(current)?.parent;
    }
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      const ancestor = ancestors[index];
      if (collapsedIds.has(ancestor) || coveredIds.has(ancestor)) return ancestor;
    }
    return visibleIds.has(id) ? id : null;
  }

  const diagnostics = checkNylonDocument(doc);
  const edges = doc.arcs.flatMap((arc, index): EdgeDeclaration[] => {
    if (standard && !scope.has(arc.from) && !scope.has(arc.to)) return [];
    const sourceId = visibleRepresentative(arc.from);
    const targetId = visibleRepresentative(arc.to);
    if (!sourceId || !targetId || sourceId === targetId) return [];
    const id = nylonArcId(arc, index);
    const warnings = diagnostics.filter((issue) => issue.arcIds.includes(id));
    const label = [warnings.length ? `⚠ ${warnings.map((issue) => issue.message).join('; ')}` : '',
      arc.kind === 'control' ? `${arc.control ?? 'control'}${arc.controlContract ? ` · ${id}` : ''}` : ''].filter(Boolean).join(' · ');
    return [{
      id, sourceId, targetId, labelText: label || undefined,
      styling: { arrowHead: true, colorToken: arc.kind === 'control' ? 'nylon-control-arc' : 'fg-muted',
        dash: arc.kind === 'control' ? 'dashed' : 'solid', width: arc.kind === 'control' ? 3 : 2.25 },
      routeBuilder: (rects) => visibleEdgeRoute(sourceId, targetId, rects),
    }];
  });

  if (standard) return {
    nodes,
    contractFrames, edges,
  };

  function isWithin(id: string, containerId: string): boolean {
    if (id === containerId) return true;
    let parent = allItems.get(id)?.parent;
    const seen = new Set<string>();
    while (parent !== undefined && !seen.has(parent)) {
      if (parent === containerId) return true;
      seen.add(parent);
      parent = transformations.get(parent)?.parent;
    }
    return false;
  }

  const nodeById = new Map(nodes.map((node) => [node.item.id, node]));
  const baseFrameByTransformation = new Map(
    contractFrames.filter((frame) => !frame.controlArcId).map((frame) => [frame.transformationId, frame]),
  );
  const boundaryNodes: NylonRenderNode[] = [];
  const boundaryFrames: NylonContractFrame[] = [];
  const boundaryEdges: EdgeDeclaration[] = [];

  for (const owner of doc.transformations) {
    const pair = owner.contractPair;
    const baseFrame = baseFrameByTransformation.get(owner.id);
    const inputNode = pair ? nodeById.get(pair.input) : undefined;
    const outputNode = pair ? nodeById.get(pair.output) : undefined;
    if (!pair || !baseFrame || inputNode?.kind !== 'contract' || outputNode?.kind !== 'contract') continue;

    const callers = doc.arcs
      .filter((arc) => arc.to === pair.input && transformations.has(arc.from))
      .map((arc) => arc.from);
    const returners = doc.arcs
      .filter((arc) => arc.from === pair.output && transformations.has(arc.to))
      .map((arc) => arc.to);

    for (const callerId of callers) {
      for (const returnerId of returners) {
        const containerId = transformations.get(callerId)?.parent;
        if (!containerId || transformations.get(returnerId)?.parent !== containerId || !isContainer(containerId)) continue;
        if (isWithin(pair.input, containerId) || isWithin(pair.output, containerId)) continue;

        const callerNode = nodeById.get(callerId);
        const returnerNode = nodeById.get(returnerId);
        const containerNode = nodeById.get(containerId);
        if (!callerNode || !returnerNode || containerNode?.kind !== 'container' || !containerNode.expanded) continue;

        const projectionId = `boundary:${containerId}:${owner.id}`;
        const inputRenderId = `${projectionId}:input:${pair.input}`;
        const outputRenderId = `${projectionId}:output:${pair.output}`;
        const active = [...selectedRenderIds].some((selectedId) => (
          selectedId === inputRenderId
          || selectedId === outputRenderId
          || isWithin(selectedId, containerId)
        ));

        if (!active) {
          boundaryEdges.push({
            id: `${projectionId}:summary`, sourceId: callerId, targetId: returnerId,
            styling: { arrowHead: true, colorToken: 'fg-muted', dash: 'dotted', width: 2.25 },
            routeBuilder: (rects) => visibleEdgeRoute(callerId, returnerId, rects),
          });
          continue;
        }

        const callerCenter = { x: callerNode.x + callerNode.w / 2, y: callerNode.y + callerNode.h / 2 };
        const returnerCenter = { x: returnerNode.x + returnerNode.w / 2, y: returnerNode.y + returnerNode.h / 2 };
        const midpoint = {
          x: (callerCenter.x + returnerCenter.x) / 2,
          y: (callerCenter.y + returnerCenter.y) / 2,
        };
        const containerBody: CandidatePlacementRect = {
          x: containerNode.x,
          y: containerNode.y + CONTAINER_HEADER,
          width: containerNode.w,
          height: Math.max(0, containerNode.h - CONTAINER_HEADER),
        };
        const obstacles = nodes.flatMap((node): CandidatePlacementRect[] => (
          node.kind === 'container'
            ? []
            : [{ x: node.x, y: node.y, width: node.w, height: node.h }]
        ));
        const placement = placeRectAtCandidates(
          { width: COMPACT_PAIR_WIDTH, height: COMPACT_PAIR_HEIGHT },
          boundaryCandidates(midpoint, callerCenter, returnerCenter, containerBody),
          obstacles,
          {
            bounds: boundaryViewport,
            containment: { bounds: containerBody, minFraction: 0.5 },
            gap: 18,
          },
        );
        const frameX = placement.x;
        const frameY = placement.y;
        const projectFacet = (
          node: Extract<NylonRenderNode, { kind: 'contract' }>,
          renderId: string,
          role: 'input' | 'output',
        ): Extract<NylonRenderNode, { kind: 'contract' }> => ({
          ...node,
          renderId,
          x: frameX + (COMPACT_PAIR_WIDTH - COMPACT_CONTRACT_WIDTH) / 2,
          y: frameY + (role === 'input' ? 22 : 78),
          w: COMPACT_CONTRACT_WIDTH,
          h: COMPACT_CONTRACT_HEIGHT,
          depth: containerNode.depth + 1,
          boundaryContainerId: containerId,
          compact: true,
        });
        boundaryNodes.push(
          projectFacet(inputNode, inputRenderId, 'input'),
          projectFacet(outputNode, outputRenderId, 'output'),
        );
        boundaryFrames.push({
          ...baseFrame,
          id: `${projectionId}:frame`,
          inputRenderId,
          outputRenderId,
          x: frameX,
          y: frameY,
          w: COMPACT_PAIR_WIDTH,
          h: COMPACT_PAIR_HEIGHT,
          boundaryContainerId: containerId,
          compact: true,
        });
        boundaryEdges.push(
          {
            id: `${projectionId}:request`, sourceId: callerId, targetId: inputRenderId,
            styling: { arrowHead: true, colorToken: 'fg-muted', dash: 'dotted', width: 2.25 },
            routeBuilder: (rects) => visibleEdgeRoute(callerId, inputRenderId, rects),
          },
          {
            id: `${projectionId}:response`, sourceId: outputRenderId, targetId: returnerId,
            styling: { arrowHead: true, colorToken: 'fg-muted', dash: 'dotted', width: 2.25 },
            routeBuilder: (rects) => visibleEdgeRoute(outputRenderId, returnerId, rects),
          },
        );
      }
    }
  }

  return {
    nodes: [...nodes, ...boundaryNodes],
    contractFrames: [...contractFrames, ...boundaryFrames],
    edges: [...edges, ...boundaryEdges],
  };
}
