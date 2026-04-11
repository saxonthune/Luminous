/**
 * Orthogonal edge router: computes polyline paths that avoid obstacle nodes.
 *
 * Edges may pass through ancestor containers of their endpoints, but route
 * around everything else (siblings, unrelated nodes).
 */

export interface RouterNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  parentId: string | null
}

export interface RouterEdge {
  id: string
  fromId: string
  toId: string
}

export interface Point {
  x: number
  y: number
}

export type EdgeRoutes = Map<string, Point[]>

const PAD = 20 // padding around obstacles

/**
 * Compute orthogonal (right-angle) routes for all edges, avoiding obstacle nodes.
 * Returns a Map from edgeId → array of waypoints (including start and end).
 * Edges that don't need routing (no obstacles on the straight path) get no entry.
 */
export function routeEdges(nodes: RouterNode[], edges: RouterEdge[]): EdgeRoutes {
  const routes: EdgeRoutes = new Map()
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // Precompute ancestor sets for each node
  const ancestorCache = new Map<string, Set<string>>()
  function getAncestors(id: string): Set<string> {
    if (ancestorCache.has(id)) return ancestorCache.get(id)!
    const set = new Set<string>()
    let cur = nodeMap.get(id)?.parentId ?? null
    while (cur) {
      set.add(cur)
      cur = nodeMap.get(cur)?.parentId ?? null
    }
    ancestorCache.set(id, set)
    return set
  }

  for (const edge of edges) {
    const from = nodeMap.get(edge.fromId)
    const to = nodeMap.get(edge.toId)
    if (!from || !to) continue

    // Build obstacle list: all nodes except source, target, and ancestors of either endpoint
    const fromAncestors = getAncestors(edge.fromId)
    const toAncestors = getAncestors(edge.toId)

    const obstacles = nodes.filter((n) => {
      if (n.id === edge.fromId || n.id === edge.toId) return false
      if (fromAncestors.has(n.id) || toAncestors.has(n.id)) return false
      // Also allow descendants of the endpoints (the edge enters their container)
      if (getAncestors(n.id).has(edge.fromId) || getAncestors(n.id).has(edge.toId)) return false
      return true
    })

    // Compute border exit/entry points
    const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
    const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
    const start = borderPoint(from, fromCenter, toCenter)
    const end = borderPoint(to, toCenter, fromCenter)

    // Check if straight line intersects any obstacle
    const blocked = obstacles.filter((n) => lineIntersectsRect(start, end, n, PAD))

    if (blocked.length === 0) {
      // No obstacles — straight line, no route needed
      continue
    }

    // Compute an orthogonal route around obstacles
    const path = computeOrthogonalPath(start, end, from, to, obstacles)
    if (path) {
      routes.set(edge.id, path)
    }
  }

  return routes
}

/** Find where a ray from `center` toward `target` exits the rect border. */
function borderPoint(
  rect: { x: number; y: number; w: number; h: number },
  center: Point,
  target: Point
): Point {
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (dx === 0 && dy === 0) return center

  const candidates: number[] = []
  if (dx !== 0) {
    candidates.push((rect.x - center.x) / dx)
    candidates.push((rect.x + rect.w - center.x) / dx)
  }
  if (dy !== 0) {
    candidates.push((rect.y - center.y) / dy)
    candidates.push((rect.y + rect.h - center.y) / dy)
  }

  const eps = 0.001
  let bestT = Infinity
  for (const t of candidates) {
    if (t <= 0) continue
    const px = center.x + t * dx
    const py = center.y + t * dy
    if (
      px >= rect.x - eps && px <= rect.x + rect.w + eps &&
      py >= rect.y - eps && py <= rect.y + rect.h + eps &&
      t < bestT
    ) {
      bestT = t
    }
  }

  if (!isFinite(bestT)) return center
  return { x: center.x + bestT * dx, y: center.y + bestT * dy }
}

/** Check if a line segment from p1 to p2 intersects a padded rectangle. */
function lineIntersectsRect(
  p1: Point, p2: Point,
  rect: { x: number; y: number; w: number; h: number },
  pad: number
): boolean {
  const rx = rect.x - pad
  const ry = rect.y - pad
  const rw = rect.w + pad * 2
  const rh = rect.h + pad * 2

  // Cohen-Sutherland style: check if the segment enters the padded rect
  return segmentIntersectsAABB(p1.x, p1.y, p2.x, p2.y, rx, ry, rx + rw, ry + rh)
}

function segmentIntersectsAABB(
  x1: number, y1: number, x2: number, y2: number,
  minX: number, minY: number, maxX: number, maxY: number
): boolean {
  // Liang-Barsky algorithm
  const dx = x2 - x1
  const dy = y2 - y1
  const p = [-dx, dx, -dy, dy]
  const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1]

  let u0 = 0
  let u1 = 1

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) {
        u0 = Math.max(u0, t)
      } else {
        u1 = Math.min(u1, t)
      }
      if (u0 > u1) return false
    }
  }
  return true
}

/**
 * Compute an orthogonal (3-segment or 5-segment) path from start to end,
 * routing around obstacles.
 *
 * Strategy:
 * 1. Determine primary direction (vertical if target is mostly above/below,
 *    horizontal if mostly left/right).
 * 2. Try a 3-segment path (exit → channel → enter).
 * 3. If the channel segment is blocked, offset it to a clear corridor.
 */
function computeOrthogonalPath(
  start: Point,
  end: Point,
  fromNode: { x: number; y: number; w: number; h: number },
  toNode: { x: number; y: number; w: number; h: number },
  obstacles: Array<{ x: number; y: number; w: number; h: number }>
): Point[] | null {
  const dx = end.x - start.x
  const dy = end.y - start.y

  // Primarily vertical flow (top-down DAG)
  if (Math.abs(dy) >= Math.abs(dx)) {
    return routeVertical(start, end, fromNode, toNode, obstacles)
  } else {
    return routeHorizontal(start, end, fromNode, toNode, obstacles)
  }
}

/**
 * Route with vertical primary direction:
 * start → (start.x, channelY) → (end.x, channelY) → end
 *
 * If the horizontal jog at channelY is blocked, try different Y values.
 */
function routeVertical(
  start: Point,
  end: Point,
  fromNode: { x: number; y: number; w: number; h: number },
  toNode: { x: number; y: number; w: number; h: number },
  obstacles: Array<{ x: number; y: number; w: number; h: number }>
): Point[] {
  // If start and end have similar x, we might only need a straight vertical
  if (Math.abs(start.x - end.x) < 5) {
    return [start, end]
  }

  // Try midpoint Y first
  const midY = (start.y + end.y) / 2
  const candidates = [midY]

  // Also try Y values in the gap between source bottom and target top (or vice versa)
  const goingDown = end.y > start.y
  if (goingDown) {
    const gapTop = fromNode.y + fromNode.h + PAD
    const gapBot = toNode.y - PAD
    if (gapBot > gapTop) {
      candidates.push((gapTop + gapBot) / 2)
      candidates.push(gapTop + PAD)
      candidates.push(gapBot - PAD)
    }
  } else {
    const gapTop = toNode.y + toNode.h + PAD
    const gapBot = fromNode.y - PAD
    if (gapBot > gapTop) {
      candidates.push((gapTop + gapBot) / 2)
    }
  }

  for (const channelY of candidates) {
    const p1 = start
    const p2 = { x: start.x, y: channelY }
    const p3 = { x: end.x, y: channelY }
    const p4 = end

    const seg1Blocked = obstacles.some((o) => lineIntersectsRect(p1, p2, o, PAD / 2))
    const seg2Blocked = obstacles.some((o) => lineIntersectsRect(p2, p3, o, PAD / 2))
    const seg3Blocked = obstacles.some((o) => lineIntersectsRect(p3, p4, o, PAD / 2))

    if (!seg1Blocked && !seg2Blocked && !seg3Blocked) {
      return [p1, p2, p3, p4]
    }
  }

  // Fallback: route around the side
  return routeAroundSide(start, end, fromNode, toNode, obstacles)
}

/**
 * Route with horizontal primary direction:
 * start → (channelX, start.y) → (channelX, end.y) → end
 */
function routeHorizontal(
  start: Point,
  end: Point,
  fromNode: { x: number; y: number; w: number; h: number },
  toNode: { x: number; y: number; w: number; h: number },
  obstacles: Array<{ x: number; y: number; w: number; h: number }>
): Point[] {
  if (Math.abs(start.y - end.y) < 5) {
    return [start, end]
  }

  const midX = (start.x + end.x) / 2
  const candidates = [midX]

  const goingRight = end.x > start.x
  if (goingRight) {
    const gapLeft = fromNode.x + fromNode.w + PAD
    const gapRight = toNode.x - PAD
    if (gapRight > gapLeft) {
      candidates.push((gapLeft + gapRight) / 2)
    }
  } else {
    const gapLeft = toNode.x + toNode.w + PAD
    const gapRight = fromNode.x - PAD
    if (gapRight > gapLeft) {
      candidates.push((gapLeft + gapRight) / 2)
    }
  }

  for (const channelX of candidates) {
    const p1 = start
    const p2 = { x: channelX, y: start.y }
    const p3 = { x: channelX, y: end.y }
    const p4 = end

    const seg1Blocked = obstacles.some((o) => lineIntersectsRect(p1, p2, o, PAD / 2))
    const seg2Blocked = obstacles.some((o) => lineIntersectsRect(p2, p3, o, PAD / 2))
    const seg3Blocked = obstacles.some((o) => lineIntersectsRect(p3, p4, o, PAD / 2))

    if (!seg1Blocked && !seg2Blocked && !seg3Blocked) {
      return [p1, p2, p3, p4]
    }
  }

  return routeAroundSide(start, end, fromNode, toNode, obstacles)
}

/**
 * Fallback: 5-segment path that goes around all obstacles on one side.
 * Finds a clear corridor to the left or right of all blocking obstacles.
 */
function routeAroundSide(
  start: Point,
  end: Point,
  fromNode: { x: number; y: number; w: number; h: number },
  toNode: { x: number; y: number; w: number; h: number },
  obstacles: Array<{ x: number; y: number; w: number; h: number }>
): Point[] {
  // Collect x-extents of all obstacles between source and target Y range
  const minY = Math.min(start.y, end.y) - PAD
  const maxY = Math.max(start.y, end.y) + PAD

  const relevantObstacles = obstacles.filter(
    (o) => o.y + o.h > minY && o.y < maxY
  )

  if (relevantObstacles.length === 0) {
    // No obstacles in the Y band — simple 3-segment
    const midY = (start.y + end.y) / 2
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
  }

  // Find a clear x-corridor: try right side first, then left
  const allRightEdges = relevantObstacles.map((o) => o.x + o.w)
  const allLeftEdges = relevantObstacles.map((o) => o.x)
  const rightCorridor = Math.max(...allRightEdges, fromNode.x + fromNode.w, toNode.x + toNode.w) + PAD * 2
  const leftCorridor = Math.min(...allLeftEdges, fromNode.x, toNode.x) - PAD * 2

  // Pick the closer side
  const midX = (start.x + end.x) / 2
  const corridorX = Math.abs(rightCorridor - midX) < Math.abs(leftCorridor - midX)
    ? rightCorridor
    : leftCorridor

  return [
    start,
    { x: start.x, y: start.y },
    { x: corridorX, y: start.y },
    { x: corridorX, y: end.y },
    { x: end.x, y: end.y },
    end,
  ]
}
