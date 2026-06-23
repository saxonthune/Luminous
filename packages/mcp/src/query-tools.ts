import { buildGraph } from '@luminous/core/graph'
import { queryNodes, queryEdges, neighborhood } from '@luminous/core/query'
import type { Graph, Node, Edge } from '@luminous/core/types'
import type { GraphQuery } from '@luminous/core/types'

export interface NodeSummary {
  id: string
  kind: string
  props: Record<string, unknown>
  tags: string[]
}

export interface EdgeSummary {
  id: string
  kind: string
  from: string
  to: string
  props: Record<string, unknown>
  tags: string[]
}

export async function loadGraph(serverUrl: string, path: string): Promise<Graph> {
  const res = await fetch(`${serverUrl}/api/document/${encodeURIComponent(path)}`)
  if (!res.ok) {
    throw new Error(`Failed to read canvas '${path}': HTTP ${res.status}`)
  }
  const doc = (await res.json()) as {
    nodes?: Node[]
    edges?: Edge[]
    pack?: string
    info?: string
  }
  return buildGraph(doc.nodes ?? [], doc.edges ?? [], doc.pack, doc.info)
}

export function toNodeSummary(node: Node): NodeSummary {
  return { id: node.id, kind: node.kind, props: node.props, tags: node.tags }
}

export function toEdgeSummary(edge: Edge): EdgeSummary {
  return { id: edge.id, kind: edge.kind, from: edge.from, to: edge.to, props: edge.props, tags: edge.tags }
}

export async function getNode(serverUrl: string, path: string, id: string): Promise<NodeSummary> {
  const graph = await loadGraph(serverUrl, path)
  const node = graph.nodes.get(id)
  if (!node) {
    throw new Error(`Node '${id}' not found in '${path}'`)
  }
  return toNodeSummary(node)
}

export async function listNodes(
  serverUrl: string,
  path: string,
  filter?: GraphQuery,
): Promise<{ nodes: NodeSummary[] }> {
  const graph = await loadGraph(serverUrl, path)
  const nodes = queryNodes(graph, filter ?? {})
  return { nodes: nodes.map(toNodeSummary) }
}

export async function listEdges(
  serverUrl: string,
  path: string,
  filter?: GraphQuery,
): Promise<{ edges: EdgeSummary[] }> {
  const graph = await loadGraph(serverUrl, path)
  const edges = queryEdges(graph, filter ?? {})
  return { edges: edges.map(toEdgeSummary) }
}

export async function neighborhoodOf(
  serverUrl: string,
  path: string,
  id: string,
  hops = 1,
): Promise<{ nodes: NodeSummary[]; edges: EdgeSummary[] }> {
  const graph = await loadGraph(serverUrl, path)
  const result = neighborhood(graph, id, hops)
  return {
    nodes: result.nodes.map(toNodeSummary),
    edges: result.edges.map(toEdgeSummary),
  }
}
