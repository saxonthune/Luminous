export interface KindEntry {
  id: string
  label: string
  props: Record<string, unknown>
}

export interface EdgeKindEntry extends KindEntry {
  directed: boolean
}

export interface PackCatalog {
  pack: string
  version: string
  nodeKinds: KindEntry[]
  edgeKinds: EdgeKindEntry[]
}

export async function describePack(serverUrl: string, packName: string): Promise<PackCatalog> {
  const packPath = packName.endsWith('.pack.json') ? packName : `${packName}.pack.json`
  const res = await fetch(`${serverUrl}/api/pack/${encodeURIComponent(packPath)}`)
  if (!res.ok) {
    throw new Error(`Pack '${packName}' not found: HTTP ${res.status}`)
  }
  const raw = (await res.json()) as Record<string, unknown>

  const nodeKinds: KindEntry[] = (
    Array.isArray(raw['nodeKinds']) ? raw['nodeKinds'] : []
  ).map((k: unknown) => {
    const kind = k as Record<string, unknown>
    return {
      id: String(kind['id']),
      label: String(kind['label'] ?? kind['id']),
      props: (kind['props'] as Record<string, unknown>) ?? { type: 'object' },
    }
  })

  const edgeKinds: EdgeKindEntry[] = (
    Array.isArray(raw['edgeKinds']) ? raw['edgeKinds'] : []
  ).map((k: unknown) => {
    const kind = k as Record<string, unknown>
    return {
      id: String(kind['id']),
      label: String(kind['label'] ?? kind['id']),
      props: (kind['props'] as Record<string, unknown>) ?? { type: 'object' },
      directed: Boolean(kind['directed']),
    }
  })

  return {
    pack: String(raw['id']),
    version: String(raw['version']),
    nodeKinds,
    edgeKinds,
  }
}

export async function describePackForCanvas(serverUrl: string, canvasPath: string): Promise<PackCatalog> {
  const res = await fetch(`${serverUrl}/api/document/${encodeURIComponent(canvasPath)}`)
  if (!res.ok) {
    throw new Error(`Failed to read canvas '${canvasPath}': HTTP ${res.status}`)
  }
  const canvas = (await res.json()) as { pack?: string }
  if (!canvas.pack) {
    throw new Error(`Canvas '${canvasPath}' has no pack declared`)
  }
  // The pack is a sibling file of the canvas — resolve it within the canvas's
  // directory rather than passing the bare name (which the server would
  // resolve against the first workspace root and fail to find).
  const slash = canvasPath.lastIndexOf('/')
  const dir = slash !== -1 ? canvasPath.slice(0, slash + 1) : ''
  return describePack(serverUrl, `${dir}${canvas.pack}.pack.json`)
}
