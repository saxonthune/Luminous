import type { LinenContract, LinenDocument, LinenModule, LinenTraceNode } from '@luminous/core/linen';
import { isControlEdge, kindDescriptor, resumeContract } from '@luminous/core/linen';
import type { EdgeDeclaration } from '@luminous/cactus';

export const TRACE_NODE_WIDTH = 150;
export const TRACE_NODE_HEIGHT = 28;
export const RESUME_MARKER_WIDTH = 110;
export const RESUME_MARKER_HEIGHT = 20;
export const CONTRACT_WIDTH = 150;
export const CONTRACT_HEIGHT = 44;
export const MODULE_HEADER = 28;
export const MODULE_PADDING = 12;
export const ROW_GAP = 14;
export const COLUMN_GAP = 24;
export const MODULE_GAP = 48;
export const CONTRACT_COLUMN_GAP = 64;

export type LinenRenderNode =
  | { kind: 'module'; module: LinenModule; x: number; y: number; w: number; h: number; depth: number }
  | { kind: 'trace-node'; node: LinenTraceNode; x: number; y: number; w: number; h: number }
  | { kind: 'contract'; contract: LinenContract; x: number; y: number; w: number; h: number }
  /** Derived resume marker after a Pass (the return rule): drawn, never
   * persisted — absent from the Document and from serialization. */
  | { kind: 'resume'; id: string; passId: string; contractName: string; x: number; y: number; w: number; h: number };

export interface LinenProjection {
  nodes: LinenRenderNode[];
  edges: EdgeDeclaration[];
}

export function renderNodeId(rn: LinenRenderNode): string {
  switch (rn.kind) {
    case 'module': return rn.module.id;
    case 'trace-node': return rn.node.id;
    case 'contract': return rn.contract.id;
    case 'resume': return rn.id;
  }
}

/** Slot of a Trace Node inside its Module: row = derived Trace order (a
 * depth-first walk over control Edges from every Entry, per module), column =
 * branch offset (each later branch of a Switch/Filter shifts one column
 * right). Order is computed here, never stored (epic decision 2). */
function deriveSlots(doc: LinenDocument): Map<string, { row: number; col: number }> {
  const slots = new Map<string, { row: number; col: number }>();
  const controlOut = new Map<string, string[]>();
  for (const edge of doc.edges) {
    if (!isControlEdge(doc, edge)) continue;
    const list = controlOut.get(edge.from) ?? [];
    list.push(edge.to);
    controlOut.set(edge.from, list);
  }
  const rowByModule = new Map<string, number>();
  const nodesById = new Map(doc.nodes.map(n => [n.id, n]));
  const visited = new Set<string>();

  function visit(id: string, col: number): void {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodesById.get(id);
    if (node === undefined) return;
    const row = rowByModule.get(node.module) ?? 0;
    rowByModule.set(node.module, row + 1);
    slots.set(id, { row, col });
    const next = controlOut.get(id) ?? [];
    next.forEach((to, i) => visit(to, col + i));
  }

  const entries = doc.nodes.filter(n => kindDescriptor(n.kind).rules.maxIn === 0);
  for (const entry of entries) visit(entry.id, 0);
  for (const node of doc.nodes) {
    if (!slots.has(node.id)) visit(node.id, 0);
  }
  return slots;
}

export function projectLinen(doc: LinenDocument): LinenProjection {
  const slots = deriveSlots(doc);

  // Trace Node positions relative to their Module's child area; stored x/y
  // (a manual drag) overrides the derived slot, Atlas-style.
  const relPos = new Map<string, { x: number; y: number }>();
  for (const node of doc.nodes) {
    if (node.x !== undefined && node.y !== undefined) {
      relPos.set(node.id, { x: node.x, y: node.y });
      continue;
    }
    const slot = slots.get(node.id) ?? { row: 0, col: 0 };
    relPos.set(node.id, {
      x: slot.col * (TRACE_NODE_WIDTH + COLUMN_GAP),
      y: slot.row * (TRACE_NODE_HEIGHT + ROW_GAP),
    });
  }

  const childModules = new Map<string, LinenModule[]>();
  const rootModules: LinenModule[] = [];
  for (const module of doc.modules) {
    if (module.parent === undefined) {
      rootModules.push(module);
    } else {
      const list = childModules.get(module.parent) ?? [];
      list.push(module);
      childModules.set(module.parent, list);
    }
  }
  const nodesByModule = new Map<string, LinenTraceNode[]>();
  for (const node of doc.nodes) {
    const list = nodesByModule.get(node.module) ?? [];
    list.push(node);
    nodesByModule.set(node.module, list);
  }

  const resumeByPass = new Map<string, string>();
  for (const node of doc.nodes) {
    if (node.kind !== 'pass') continue;
    const contract = resumeContract(doc, node.id);
    if (contract !== undefined) resumeByPass.set(node.id, contract.name);
  }

  // Bottom-up sizes: a Module shrink-wraps its Trace Nodes (including each
  // Pass's resume marker) and its child Modules, which stack below the nodes.
  const moduleSize = new Map<string, { w: number; h: number }>();
  const childModuleRel = new Map<string, { x: number; y: number }>();
  function sizeOf(module: LinenModule): { w: number; h: number } {
    const cached = moduleSize.get(module.id);
    if (cached) return cached;
    let maxX = 0;
    let maxY = 0;
    for (const node of nodesByModule.get(module.id) ?? []) {
      const pos = relPos.get(node.id)!;
      let right = pos.x + TRACE_NODE_WIDTH;
      if (resumeByPass.has(node.id)) right += 8 + RESUME_MARKER_WIDTH;
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, pos.y + TRACE_NODE_HEIGHT);
    }
    let childY = maxY === 0 ? 0 : maxY + ROW_GAP;
    for (const child of childModules.get(module.id) ?? []) {
      const size = sizeOf(child);
      childModuleRel.set(child.id, { x: 0, y: childY });
      maxX = Math.max(maxX, size.w);
      childY += size.h + ROW_GAP;
      maxY = childY - ROW_GAP;
    }
    const size = {
      w: Math.max(TRACE_NODE_WIDTH, maxX) + 2 * MODULE_PADDING,
      h: MODULE_HEADER + Math.max(TRACE_NODE_HEIGHT, maxY) + 2 * MODULE_PADDING,
    };
    moduleSize.set(module.id, size);
    return size;
  }
  for (const module of rootModules) sizeOf(module);

  const nodes: LinenRenderNode[] = [];
  const moduleAbs = new Map<string, { x: number; y: number }>();

  function place(module: LinenModule, x: number, y: number, depth: number): void {
    const size = moduleSize.get(module.id)!;
    moduleAbs.set(module.id, { x, y });
    nodes.push({ kind: 'module', module, x, y, w: size.w, h: size.h, depth });
    const originX = x + MODULE_PADDING;
    const originY = y + MODULE_HEADER + MODULE_PADDING;
    for (const node of nodesByModule.get(module.id) ?? []) {
      const pos = relPos.get(node.id)!;
      const nx = originX + pos.x;
      const ny = originY + pos.y;
      nodes.push({ kind: 'trace-node', node, x: nx, y: ny, w: TRACE_NODE_WIDTH, h: TRACE_NODE_HEIGHT });
      const resumeName = resumeByPass.get(node.id);
      if (resumeName !== undefined) {
        nodes.push({
          kind: 'resume',
          id: `resume:${node.id}`,
          passId: node.id,
          contractName: resumeName,
          x: nx + TRACE_NODE_WIDTH + 8,
          y: ny + (TRACE_NODE_HEIGHT - RESUME_MARKER_HEIGHT) / 2,
          w: RESUME_MARKER_WIDTH,
          h: RESUME_MARKER_HEIGHT,
        });
      }
    }
    for (const child of childModules.get(module.id) ?? []) {
      const rel = childModuleRel.get(child.id)!;
      place(child, originX + rel.x, originY + rel.y, depth + 1);
    }
  }

  let cursorX = 0;
  let rightEdge = 0;
  for (const module of rootModules) {
    place(module, cursorX, 0, 0);
    const size = moduleSize.get(module.id)!;
    rightEdge = Math.max(rightEdge, cursorX + size.w);
    cursorX += size.w + MODULE_GAP;
  }

  const contractX = rightEdge + CONTRACT_COLUMN_GAP;
  doc.contracts.forEach((contract, i) => {
    nodes.push({
      kind: 'contract',
      contract,
      x: contractX,
      y: i * (CONTRACT_HEIGHT + ROW_GAP),
      w: CONTRACT_WIDTH,
      h: CONTRACT_HEIGHT,
    });
  });

  // Plain direct routes for the first pass — Atlas's LCA/Port router assumes
  // Atlas node/port fields, so it is not reused here.
  const edges: EdgeDeclaration[] = doc.edges.map((edge, i) => ({
    id: `${edge.from}->${edge.to}-${i}`,
    sourceId: edge.from,
    targetId: edge.to,
    styling: isControlEdge(doc, edge)
      ? { arrowHead: true, dash: 'solid' }
      : { arrowHead: false, dash: 'dashed', colorToken: 'fg-muted' },
  }));

  return { nodes, edges };
}
