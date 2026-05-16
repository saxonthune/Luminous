import type {
  Pack, NodeKind, EdgeKind, View, Layer, DisclosureSchema,
  NodeRenderer, EdgeRenderer, DisclosureLevel,
  KindId, ViewId, LayerId, PackId,
} from './types.ts';

const nodeKinds: Map<KindId, NodeKind> = new Map();
const edgeKinds: Map<KindId, EdgeKind> = new Map();
const nodeRenderers: Map<KindId, Partial<Record<DisclosureLevel, NodeRenderer>>> = new Map();
const edgeRenderers: Map<KindId, Partial<Record<DisclosureLevel, EdgeRenderer>>> = new Map();
const views: Map<ViewId, View> = new Map();
const layers: Map<LayerId, Layer> = new Map();
const disclosureSchemas: Map<KindId, DisclosureSchema> = new Map();
const packs: Map<PackId, Pack> = new Map();

// Fallback order: most detail to least. Walk downward from requested level.
const DISCLOSURE_ORDER: DisclosureLevel[] = ['deep', 'open', 'card', 'peek'];

export function registerPack(pack: Pack): void {
  if (packs.has(pack.id)) {
    throw new Error(`registerPack: pack "${pack.id}" already registered`);
  }

  for (const kind of pack.nodeKinds) {
    if (nodeKinds.has(kind.id)) {
      const owner = findOwningPackId(kind.id, 'nodeKind');
      throw new Error(`registerPack: duplicate node kind "${kind.id}" (already registered by pack "${owner}")`);
    }
    nodeKinds.set(kind.id, kind);
  }

  for (const kind of pack.edgeKinds) {
    if (edgeKinds.has(kind.id)) {
      const owner = findOwningPackId(kind.id, 'edgeKind');
      throw new Error(`registerPack: duplicate edge kind "${kind.id}" (already registered by pack "${owner}")`);
    }
    edgeKinds.set(kind.id, kind);
  }

  for (const [kindId, rendererRecord] of Object.entries(pack.nodeRenderers)) {
    if (nodeRenderers.has(kindId)) {
      const owner = findOwningPackId(kindId, 'nodeRenderer');
      throw new Error(`registerPack: duplicate node kind "${kindId}" (already registered by pack "${owner}")`);
    }
    nodeRenderers.set(kindId, rendererRecord);
  }

  for (const [kindId, rendererRecord] of Object.entries(pack.edgeRenderers)) {
    if (edgeRenderers.has(kindId)) {
      const owner = findOwningPackId(kindId, 'edgeRenderer');
      throw new Error(`registerPack: duplicate edge kind "${kindId}" (already registered by pack "${owner}")`);
    }
    edgeRenderers.set(kindId, rendererRecord);
  }

  for (const view of pack.views) {
    if (views.has(view.id)) {
      throw new Error(`registerPack: duplicate view "${view.id}" (already registered by pack "${findOwningPackId(view.id, 'view')}")`);
    }
    views.set(view.id, view);
  }

  for (const layer of pack.layers) {
    if (layers.has(layer.id)) {
      throw new Error(`registerPack: duplicate layer "${layer.id}" (already registered by pack "${findOwningPackId(layer.id, 'layer')}")`);
    }
    layers.set(layer.id, layer);
  }

  for (const schema of pack.disclosureSchemas) {
    if (disclosureSchemas.has(schema.kind)) {
      throw new Error(`registerPack: duplicate disclosure schema "${schema.kind}" (already registered by pack "${findOwningPackId(schema.kind, 'disclosureSchema')}")`);
    }
    disclosureSchemas.set(schema.kind, schema);
  }

  packs.set(pack.id, pack);
}

// Walks registered packs to find which one owns a given id in the given map.
function findOwningPackId(id: string, map: 'nodeKind' | 'edgeKind' | 'nodeRenderer' | 'edgeRenderer' | 'view' | 'layer' | 'disclosureSchema'): PackId {
  for (const [packId, pack] of packs) {
    switch (map) {
      case 'nodeKind':
        if (pack.nodeKinds.some(k => k.id === id)) return packId;
        break;
      case 'edgeKind':
        if (pack.edgeKinds.some(k => k.id === id)) return packId;
        break;
      case 'nodeRenderer':
        if (Object.keys(pack.nodeRenderers).includes(id)) return packId;
        break;
      case 'edgeRenderer':
        if (Object.keys(pack.edgeRenderers).includes(id)) return packId;
        break;
      case 'view':
        if (pack.views.some(v => v.id === id)) return packId;
        break;
      case 'layer':
        if (pack.layers.some(l => l.id === id)) return packId;
        break;
      case 'disclosureSchema':
        if (pack.disclosureSchemas.some(s => s.kind === id)) return packId;
        break;
    }
  }
  return '<unknown>';
}

export function getNodeKind(id: KindId): NodeKind | undefined {
  return nodeKinds.get(id);
}

export function getEdgeKind(id: KindId): EdgeKind | undefined {
  return edgeKinds.get(id);
}

export function getView(id: ViewId): View | undefined {
  return views.get(id);
}

export function listViews(): View[] {
  return Array.from(views.values());
}

export function getLayer(id: LayerId): Layer | undefined {
  return layers.get(id);
}

export function getDisclosureSchema(kind: KindId): DisclosureSchema | undefined {
  return disclosureSchemas.get(kind);
}

export function resolvePack(name: PackId): Pack | undefined {
  return packs.get(name);
}

export function getNodeRenderer(kind: KindId, level: DisclosureLevel): NodeRenderer | undefined {
  const record = nodeRenderers.get(kind);
  if (!record) return undefined;
  return fallback(record, level);
}

export function getEdgeRenderer(kind: KindId, level: DisclosureLevel): EdgeRenderer | undefined {
  const record = edgeRenderers.get(kind);
  if (!record) return undefined;
  return fallback(record, level) as EdgeRenderer | undefined;
}

function fallback<T>(
  record: Partial<Record<DisclosureLevel, T>>,
  level: DisclosureLevel,
): T | undefined {
  const startIdx = DISCLOSURE_ORDER.indexOf(level);
  for (let i = startIdx; i < DISCLOSURE_ORDER.length; i++) {
    const r = record[DISCLOSURE_ORDER[i]];
    if (r !== undefined) return r;
  }
  return undefined;
}

export function resetRegistry(): void {
  nodeKinds.clear();
  edgeKinds.clear();
  nodeRenderers.clear();
  edgeRenderers.clear();
  views.clear();
  layers.clear();
  disclosureSchemas.clear();
  packs.clear();
}
