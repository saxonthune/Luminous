import { elkLayout } from './elkLayout.js';
import type { LayoutResult } from './layout-types.js';

export interface ConnectionNode {
  id: string;
  source: string;
  target: string;
  w: number;
  h: number;
  /** False for return links: they occupy space without reversing the forward layout. */
  ordering: boolean;
}

/** Reserve one box per unordered endpoint pair before laying out the forward graph.
 * All connection nodes for that pair are stacked inside its reserved corridor. */
export async function connectionCorridorLayout(
  stateSizes: ReadonlyMap<string, { w: number; h: number }>,
  connections: readonly ConnectionNode[],
  direction: 'RIGHT' | 'DOWN' = 'RIGHT',
): Promise<LayoutResult> {
  const nodeSizes = new Map(stateSizes);
  const outgoing = new Map([...stateSizes.keys()].map(id => [id, new Set<string>()]));
  const indegree = new Map([...stateSizes.keys()].map(id => [id, 0]));
  const groups = new Map<string, ConnectionNode[]>();
  const ids = new Set(stateSizes.keys());
  for (const connection of connections) {
    if (!stateSizes.has(connection.source) || !stateSizes.has(connection.target)) throw new Error('Missing connection endpoint');
    if (connection.source === connection.target) throw new Error('Connection corridor needs two distinct states');
    if (ids.has(connection.id)) throw new Error('Duplicate connection ID');
    ids.add(connection.id);
    const key = JSON.stringify([connection.source, connection.target].sort());
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(connection);
    if (connection.ordering && !outgoing.get(connection.source)!.has(connection.target)) {
      outgoing.get(connection.source)!.add(connection.target);
      indegree.set(connection.target, indegree.get(connection.target)! + 1);
    }
  }
  // Disconnected diagrams share a canvas but retain independent layout demand.
  // Stack their complete bounds so a comparison can put the second tree below.
  const adjacency = new Map([...stateSizes.keys()].map(id => [id, new Set<string>()]));
  for (const connection of connections) {
    adjacency.get(connection.source)!.add(connection.target);
    adjacency.get(connection.target)!.add(connection.source);
  }
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const id of stateSizes.keys()) {
    if (seen.has(id)) continue;
    const component = [id]; seen.add(id);
    for (let i = 0; i < component.length; i++) for (const neighbor of adjacency.get(component[i])!) {
      if (!seen.has(neighbor)) { seen.add(neighbor); component.push(neighbor); }
    }
    components.push(component);
  }
  if (components.length > 1) {
    const positions = new Map<string, { x: number; y: number }>();
    const sizes = new Map<string, { w: number; h: number }>();
    let top = 0;
    for (const component of components) {
      const members = new Set(component);
      const layout = await connectionCorridorLayout(new Map(component.map(id => [id, stateSizes.get(id)!])), connections.filter(node => members.has(node.source)), direction);
      const left = Math.min(...[...layout.positions.values()].map(point => point.x));
      const minY = Math.min(...[...layout.positions.values()].map(point => point.y));
      let bottom = top;
      for (const [id, point] of layout.positions) {
        const size = layout.sizes.get(id)!;
        positions.set(id, { x: point.x - left, y: point.y - minY + top });
        sizes.set(id, size);
        bottom = Math.max(bottom, point.y - minY + top + size.h);
      }
      top = bottom + 160;
    }
    return { positions, sizes };
  }
  const queue = [...stateSizes.keys()].filter(id => indegree.get(id) === 0);
  const order = new Map<string, number>();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    order.set(id, i);
    for (const target of outgoing.get(id)!) {
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (order.size !== stateSizes.size) throw new Error('Forward connection graph contains a cycle; mark return links as non-ordering');
  const edges: { id: string; from: string; to: string }[] = [];
  const corridors: { id: string; nodes: ConnectionNode[] }[] = [];
  const laneGap = 20;
  for (const group of groups.values()) {
    let corridorId = `__connection_corridor_${corridors.length}`;
    while (ids.has(corridorId)) corridorId += '_';
    ids.add(corridorId);
    const [a, b] = [group[0].source, group[0].target].sort((x, y) => order.get(x)! - order.get(y)!);
    const nodes = [...group].sort((x, y) => Number(y.ordering) - Number(x.ordering));
    nodeSizes.set(corridorId, {
      w: direction === 'RIGHT' ? Math.max(...nodes.map(n => n.w)) : nodes.reduce((sum, n) => sum + n.w, 0) + (nodes.length - 1) * laneGap,
      h: direction === 'RIGHT' ? nodes.reduce((sum, n) => sum + n.h, 0) + (nodes.length - 1) * laneGap : Math.max(...nodes.map(n => n.h)),
    });
    edges.push({ id: corridorId + '-in', from: a, to: corridorId }, { id: corridorId + '-out', from: corridorId, to: b });
    corridors.push({ id: corridorId, nodes });
  }
  const result = await elkLayout({ rootIds: [...nodeSizes.keys()], childrenOf: new Map(), nodeSizes, edges }, { direction, spacing: 1.1 });
  const positions = new Map([...stateSizes.keys()].map(id => [id, result.positions.get(id)!]));
  const sizes = new Map(stateSizes);
  for (const corridor of corridors) {
    const origin = result.positions.get(corridor.id)!;
    const bounds = nodeSizes.get(corridor.id)!;
    let offset = 0;
    for (const node of corridor.nodes) {
      positions.set(node.id, {
        x: origin.x + (direction === 'RIGHT' ? (bounds.w - node.w) / 2 : offset),
        y: origin.y + (direction === 'RIGHT' ? offset : (bounds.h - node.h) / 2),
      });
      sizes.set(node.id, { w: node.w, h: node.h });
      offset += (direction === 'RIGHT' ? node.h : node.w) + laneGap;
    }
  }
  return { positions, sizes };
}
