export interface ActionConfig {
  method: 'GET' | 'POST'
  path: string
  params: Record<string, 'string' | 'number'>
}

export interface ToolGroupConfig {
  description: string
  actions: Record<string, ActionConfig>
}

export const toolConfig: Record<string, ToolGroupConfig> = {
  canvas: {
    description: "Browse and read canvas documents. Use 'list' to discover available canvases, 'read' to load a canvas for inspection.",
    actions: {
      list: { method: 'GET', path: '/api/documents', params: {} },
      read: { method: 'GET', path: '/api/document/:path', params: { path: 'string' } },
    }
  },
  note: {
    description: "Create and modify notes on a canvas. Notes capture thinking without committing to structure — a title and markdown body.",
    actions: {
      create: { method: 'POST', path: '/api/note/create', params: { path: 'string', title: 'string', 'body?': 'string' } },
      update: { method: 'POST', path: '/api/note/update', params: { path: 'string', id: 'string', 'title?': 'string', 'body?': 'string' } },
      delete: { method: 'POST', path: '/api/note/delete', params: { path: 'string', id: 'string' } },
    }
  },
  edge: {
    description: "Connect nodes to express relationships. Edges are freeform — any node to any node, optional label. Direction is visual only.",
    actions: {
      connect:    { method: 'POST', path: '/api/edge/connect', params: { path: 'string', fromId: 'string', toId: 'string', 'label?': 'string' } },
      disconnect: { method: 'POST', path: '/api/edge/disconnect', params: { path: 'string', id: 'string' } },
      relabel:    { method: 'POST', path: '/api/edge/relabel', params: { path: 'string', id: 'string', label: 'string' } },
    }
  },
  structure: {
    description: "Organize canvas layout. Nest nodes inside other nodes (containment), unnest, move, or resize.",
    actions: {
      nest:   { method: 'POST', path: '/api/nest', params: { path: 'string', parentId: 'string', childId: 'string' } },
      unnest: { method: 'POST', path: '/api/unnest', params: { path: 'string', childId: 'string' } },
      move:   { method: 'POST', path: '/api/node/move', params: { path: 'string', id: 'string', x: 'number', y: 'number' } },
      resize: { method: 'POST', path: '/api/node/resize', params: { path: 'string', id: 'string', w: 'number', h: 'number' } },
    }
  },
}
