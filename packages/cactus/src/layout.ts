import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';

export type LayoutNode = { id: string; x: number; y: number; width: number; height: number }
export type LayoutEdge = { source: string; target: string }
export type LayoutResult = Map<string, { x: number; y: number }>

interface SimNode extends SimulationNodeDatum {
  id: string;
  width: number;
  height: number;
}

export function forceDirectedLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options?: { iterations?: number; padding?: number }
): LayoutResult {
  const iterations = options?.iterations ?? 300;
  const padding = options?.padding ?? 20;

  if (nodes.length === 0) return new Map();

  // Compute centroid of current positions
  const cx = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;

  // Build sim nodes initialized at current positions
  const simNodes: SimNode[] = nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  }));

  const idToIndex = new Map(simNodes.map((n, i) => [n.id, i]));

  // Build sim links using index references (d3-force mutates source/target to node refs)
  const simLinks: SimulationLinkDatum<SimNode>[] = edges
    .filter((e) => idToIndex.has(e.source) && idToIndex.has(e.target))
    .map((e) => ({ source: idToIndex.get(e.source)!, target: idToIndex.get(e.target)! }));

  const simulation = forceSimulation<SimNode>(simNodes)
    .force('charge', forceManyBody<SimNode>().strength(-300))
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks).distance(200).strength(0.5))
    .force('center', forceCenter(cx, cy))
    .force('collide', forceCollide<SimNode>().radius((n) => Math.sqrt((n.width * n.width + n.height * n.height) / 4) + padding).strength(1))
    .stop();

  // Run synchronously
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }

  const result: LayoutResult = new Map();
  for (const n of simNodes) {
    result.set(n.id, { x: Math.round(n.x!), y: Math.round(n.y!) });
  }
  return result;
}
