import type { Graph, Node, Edge } from './types.ts';
import { buildGraph } from './graph.ts';
import { getNodeKind, getEdgeKind, getPack } from './registry.ts';

export function loadCanvasFileFromText(json: string): Graph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`loadCanvasFile: invalid JSON: ${msg}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('loadCanvasFile: expected a JSON object at top level');
  }

  const file = parsed as Record<string, unknown>;

  if (!('version' in file)) {
    throw new Error('loadCanvasFile: missing required field "version"');
  }
  if (file.version !== 3) {
    throw new Error(`loadCanvasFile: unsupported version ${String(file.version)}, expected 3`);
  }

  if (typeof file.packs !== 'object' || file.packs === null || Array.isArray(file.packs)) {
    throw new Error('loadCanvasFile: "packs" must be a Record<PackId, string>');
  }

  if (!Array.isArray(file.nodes)) {
    throw new Error('loadCanvasFile: "nodes" must be an array');
  }

  if (!Array.isArray(file.edges)) {
    throw new Error('loadCanvasFile: "edges" must be an array');
  }

  const packs = file.packs as Record<string, unknown>;
  for (const packId of Object.keys(packs)) {
    if (getPack(packId) === undefined) {
      throw new Error(
        `loadCanvasFile: pack "${packId}" is referenced by the canvas but not registered. Register the pack before loading.`
      );
    }
  }

  const nodes = file.nodes as Node[];
  const edges = file.edges as Edge[];
  const validationErrors: string[] = [];

  for (const node of nodes) {
    const nodeKind = getNodeKind(node.kind);
    if (nodeKind === undefined) {
      validationErrors.push(`node "${node.id}": unknown kind "${node.kind}"`);
      continue;
    }
    const result = nodeKind.propsSchema.safeParse(node.props);
    if (!result.success) {
      validationErrors.push(`node "${node.id}": props validation failed: ${String(result.error)}`);
    }
  }

  for (const edge of edges) {
    const edgeKind = getEdgeKind(edge.kind);
    if (edgeKind === undefined) {
      validationErrors.push(`edge "${edge.id}": unknown kind "${edge.kind}"`);
      continue;
    }
    const result = edgeKind.propsSchema.safeParse(edge.props);
    if (!result.success) {
      validationErrors.push(`edge "${edge.id}": props validation failed: ${String(result.error)}`);
    }
  }

  if (validationErrors.length > 0) {
    throw new Error(`loadCanvasFile: validation errors:\n${validationErrors.join('\n')}`);
  }

  return buildGraph(nodes, edges);
}

export async function loadCanvasFile(url: string): Promise<Graph> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`loadCanvasFile [${url}]: fetch failed: ${msg}`);
  }

  if (!response.ok) {
    throw new Error(`loadCanvasFile: HTTP ${response.status} fetching ${url}`);
  }

  const text = await response.text();
  try {
    return loadCanvasFileFromText(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`loadCanvasFile [${url}]: ${msg}`);
  }
}
