export type ParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | { type: 'object'; properties: Record<string, ParamType>; required?: string[] }
  | { type: 'array'; items: ParamType }

export interface ActionConfig {
  method: 'GET' | 'POST'
  path: string
  params: Record<string, ParamType>
}

export interface ToolGroupConfig {
  description: string
  actions: Record<string, ActionConfig>
}

export interface BatchToolConfig {
  description: string
  path: string
}

export const toolConfig: Record<string, ToolGroupConfig> = {
  canvas: {
    description: "Browse and read canvas documents. 'list' discovers available canvases; 'read' loads a full document including its schemas, structure, content, and edges.",
    actions: {
      list: { method: 'GET', path: '/api/documents', params: {} },
      read: { method: 'GET', path: '/api/document/:path', params: { path: 'string' } },
    },
  },

  node: {
    description: "Create and mutate nodes on a canvas. Nodes are schema-driven: each node references a schemaName from the canvas's schemas table. Position and size live in geometry; field values live in content. Use 'create' to add a node, 'setContent' to update its field values, 'setGeometry' to move/resize, 'setParent' to nest/unnest, 'setOrder' to reorder siblings, 'delete' to remove. Order is a fractional-index string (e.g. 'a000000', 'a500000', 'b000000') — provide one that sorts after the intended previous sibling.",
    actions: {
      create: {
        method: 'POST',
        path: '/api/node/create',
        params: {
          path: 'string',
          schemaName: 'string',
          'parent?': 'string',
          order: 'string',
          geometry: {
            type: 'object',
            properties: {
              x: 'number', y: 'number', w: 'number', h: 'number',
            },
            required: ['x', 'y', 'w', 'h'],
          },
          'content?': {
            type: 'object',
            properties: {},
          },
          'id?': 'string',
        },
      },
      setContent: {
        method: 'POST',
        path: '/api/node/setContent',
        params: {
          path: 'string',
          id: 'string',
          fields: {
            type: 'object',
            properties: {},
          },
        },
      },
      setParent: {
        method: 'POST',
        path: '/api/node/setParent',
        params: {
          path: 'string',
          id: 'string',
          'parent?': 'string',
          order: 'string',
        },
      },
      setOrder: {
        method: 'POST',
        path: '/api/node/setOrder',
        params: { path: 'string', id: 'string', order: 'string' },
      },
      setGeometry: {
        method: 'POST',
        path: '/api/node/setGeometry',
        params: {
          path: 'string',
          id: 'string',
          geometry: {
            type: 'object',
            properties: {
              x: 'number', y: 'number', w: 'number', h: 'number',
            },
            required: ['x', 'y', 'w', 'h'],
          },
        },
      },
      delete: {
        method: 'POST',
        path: '/api/node/delete',
        params: { path: 'string', id: 'string' },
      },
    },
  },

  edge: {
    description: "Connect nodes to express relationships. Edges are freeform — any node to any node, optional label and optional schemaName. Direction is visual only.",
    actions: {
      connect: {
        method: 'POST',
        path: '/api/edge/connect',
        params: {
          path: 'string',
          fromId: 'string',
          toId: 'string',
          'label?': 'string',
          'schemaName?': 'string',
          'id?': 'string',
        },
      },
      disconnect: {
        method: 'POST',
        path: '/api/edge/disconnect',
        params: { path: 'string', id: 'string' },
      },
      relabel: {
        method: 'POST',
        path: '/api/edge/relabel',
        params: { path: 'string', id: 'string', 'label?': 'string' },
      },
    },
  },

  schema: {
    description: "Define and remove node schemas in a canvas. Schemas declare what a kind of node 'is' — its primitives (drag-bar, title, markdown, container) and how they bind to content fields. Schemas are stored in the canvas file alongside structure and content.",
    actions: {
      define: {
        method: 'POST',
        path: '/api/schema/define',
        params: {
          path: 'string',
          schema: {
            type: 'object',
            properties: {
              name: 'string',
              label: 'string',
              primitives: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: 'string',
                    'bind?': 'string',
                    'name?': 'string',
                  },
                  required: ['type'],
                },
              },
              'accepts?': {
                type: 'array',
                items: 'string',
              },
            },
            required: ['name', 'label', 'primitives'],
          },
        },
      },
      delete: {
        method: 'POST',
        path: '/api/schema/delete',
        params: { path: 'string', name: 'string' },
      },
    },
  },

  diag: {
    description: "Read-only diagnostics and structural queries for canvas comprehension. 'roots' returns per-category root summaries (count, max height, x/y range). 'bbox' returns one node's geometry plus the bounding box of its descendants. 'outliers' lists nodes with implausible geometry. 'subtree' returns one node and all its descendants with geometries. 'outline' returns the nesting tree as nested JSON with titles — use this to comprehend overall canvas structure. 'outlineFrom' returns the nesting tree from a specific node. 'summary' returns counts by schema, edge count, max depth, and bounding box — use this for a cheap top-level overview. 'query' filters and projects nodes by type/parent/ids with selectable fields — use this to find specific subsets.",
    actions: {
      roots: {
        method: 'GET',
        path: '/api/diag/roots/:path',
        params: { path: 'string' },
      },
      bbox: {
        method: 'GET',
        path: '/api/diag/bbox/:path/:id',
        params: { path: 'string', id: 'string' },
      },
      outliers: {
        method: 'GET',
        path: '/api/diag/outliers/:path',
        params: { path: 'string' },
      },
      subtree: {
        method: 'GET',
        path: '/api/diag/subtree/:path/:id',
        params: { path: 'string', id: 'string' },
      },
      outline: {
        method: 'GET',
        path: '/api/diag/outline/:path',
        params: { path: 'string' },
      },
      outlineFrom: {
        method: 'GET',
        path: '/api/diag/outline/:path/:id',
        params: { path: 'string', id: 'string' },
      },
      summary: {
        method: 'GET',
        path: '/api/diag/summary/:path',
        params: { path: 'string' },
      },
      query: {
        method: 'POST',
        path: '/api/diag/query',
        params: {
          path: 'string',
          filter: {
            type: 'object',
            properties: {
              type: 'string',
              parent: 'string',
              ids: { type: 'array', items: 'string' },
              root: 'boolean',
            },
          },
          'fields?': { type: 'array', items: 'string' },
        },
      },
    },
  },
}

export const batchToolConfig: BatchToolConfig = {
  description: "Apply multiple v2 actions in a single atomic batch. Actions are an ordered array — each can declare a 'ref' name, and later actions can reference generated IDs via '$ref:<name>' in string param values. Supports all v2 action types: node/create, node/setContent, node/setParent, node/setOrder, node/setGeometry, node/delete, edge/connect, edge/disconnect, edge/relabel, schema/define, schema/delete.",
  path: '/api/action/batch',
}
