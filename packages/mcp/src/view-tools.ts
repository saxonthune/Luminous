import { evaluateView } from '@luminous/core/view'
import type { View, SceneGraph } from '@luminous/core/types'
import { loadGraph, toNodeSummary, toEdgeSummary } from './query-tools.js'
import type { NodeSummary, EdgeSummary } from './query-tools.js'

export interface ViewSummary {
  id: string
  name: string
  description?: string
  nodeRoles: Record<string, string>
  edgeRoles: Record<string, string>
  layout: unknown
}

export interface ProjectedScene {
  viewId: string
  spatialNodes: NodeSummary[]
  latentNodes: NodeSummary[]
  arrows: EdgeSummary[]
  summaryEdges: EdgeSummary[]
  containment: {
    rootIds: string[]
    childrenOf: Record<string, string[]>
    parentOf: Record<string, string>
  }
  warnings: SceneGraph['warnings']
}

async function loadViews(
  serverUrl: string,
  canvasPath: string,
): Promise<{ views: View[]; defaultView?: string }> {
  const res = await fetch(`${serverUrl}/api/document/${encodeURIComponent(canvasPath)}`)
  if (!res.ok) {
    throw new Error(`Failed to read canvas '${canvasPath}': HTTP ${res.status}`)
  }
  const canvas = (await res.json()) as { pack?: string; defaultView?: string }
  if (!canvas.pack) {
    throw new Error(`Canvas '${canvasPath}' has no pack declared`)
  }

  const slash = canvasPath.lastIndexOf('/')
  const dir = slash !== -1 ? canvasPath.slice(0, slash + 1) : ''
  const packPath = `${dir}${canvas.pack}.pack.json`

  const packRes = await fetch(`${serverUrl}/api/pack/${encodeURIComponent(packPath)}`)
  if (!packRes.ok) {
    throw new Error(`Pack '${canvas.pack}' not found: HTTP ${packRes.status}`)
  }
  const raw = (await packRes.json()) as { views?: unknown[] }
  const views = (Array.isArray(raw.views) ? raw.views : []) as View[]

  return { views, defaultView: canvas.defaultView }
}

export async function listViews(
  serverUrl: string,
  canvasPath: string,
): Promise<{ views: ViewSummary[] }> {
  const { views } = await loadViews(serverUrl, canvasPath)
  const summaries: ViewSummary[] = views.map((v) => ({
    id: v.id,
    name: v.name,
    ...(v.description !== undefined ? { description: v.description } : {}),
    nodeRoles: v.nodeRoles,
    edgeRoles: v.edgeRoles,
    layout: v.layout,
  }))
  return { views: summaries }
}

export async function project(
  serverUrl: string,
  canvasPath: string,
  viewId?: string,
): Promise<ProjectedScene> {
  const { views, defaultView } = await loadViews(serverUrl, canvasPath)

  const resolvedId = viewId ?? defaultView
  if (!resolvedId) {
    const ids = views.map((v) => v.id).join(', ')
    throw new Error(
      `No viewId provided and canvas has no defaultView. Available views: ${ids || '(none)'}`,
    )
  }

  const view = views.find((v) => v.id === resolvedId)
  if (!view) {
    const ids = views.map((v) => v.id).join(', ')
    throw new Error(`View '${resolvedId}' not found. Available views: ${ids || '(none)'}`)
  }

  const graph = await loadGraph(serverUrl, canvasPath)

  let scene: SceneGraph
  try {
    scene = evaluateView(graph, view)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`View projection failed: ${message}`)
  }

  const childrenOf: Record<string, string[]> = {}
  for (const [parent, children] of scene.containment.childrenOf) {
    childrenOf[parent] = children
  }

  const parentOf: Record<string, string> = {}
  for (const [child, parent] of scene.containment.parentOf) {
    parentOf[child] = parent
  }

  return {
    viewId: view.id,
    spatialNodes: scene.spatialNodes.map(toNodeSummary),
    latentNodes: scene.latentNodes.map(toNodeSummary),
    arrows: scene.arrows.map(toEdgeSummary),
    summaryEdges: scene.summaryEdges.map(toEdgeSummary),
    containment: {
      rootIds: scene.containment.rootIds,
      childrenOf,
      parentOf,
    },
    warnings: scene.warnings,
  }
}
