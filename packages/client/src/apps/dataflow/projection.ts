import type { DataflowDocument, DataflowFlow } from '@luminous/core/dataflow';
import type { TidyNode, EdgeDeclaration } from '@luminous/cactus';

function edgeId(flow: DataflowFlow, i: number): string {
  return `${flow.from}->${flow.to}-${i}`;
}

export const BOX_WIDTH = 220;
const BASE_HEIGHT = 72;
const DESCRIPTION_CHARS_PER_LINE = 34;
const LINE_HEIGHT = 18;
const CONTRACT_HEIGHT = 56;

/** Estimate a box's render height from its text content — no DOM measurement. */
export function estimateBoxHeight(box: DataflowDocument['boxes'][number]): number {
  let height = BASE_HEIGHT;
  if (box.description) {
    const lines = Math.max(1, Math.ceil(box.description.length / DESCRIPTION_CHARS_PER_LINE));
    height += lines * LINE_HEIGHT;
  }
  if (box.contract) {
    height += CONTRACT_HEIGHT;
  }
  return height;
}

export function toTidyNodes(doc: DataflowDocument): TidyNode[] {
  return doc.boxes.map((box) => ({
    id: box.id,
    w: BOX_WIDTH,
    h: estimateBoxHeight(box),
    parentId: null,
  }));
}

export function toLayoutEdges(doc: DataflowDocument): { source: string; target: string }[] {
  return doc.flows.map((flow) => ({ source: flow.from, target: flow.to }));
}

export function toEdgeDeclarations(doc: DataflowDocument): EdgeDeclaration[] {
  return doc.flows.map((flow, i) => ({
    id: edgeId(flow, i),
    sourceId: flow.from,
    targetId: flow.to,
    styling: { arrowHead: true, dash: 'solid' },
  }));
}
