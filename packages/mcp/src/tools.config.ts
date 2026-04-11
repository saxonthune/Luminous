export type ParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | { type: 'object'; properties: Record<string, ParamType>; required?: string[] }
  | { type: 'array'; items: ParamType }
  | { type: 'described'; innerType: ParamType; description: string }

export interface ActionConfig {
  description?: string
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

const pathParam: ParamType = {
  type: 'described',
  innerType: 'string',
  description: "Path to the canvas document, e.g. 'project.canvas.json'. Get available paths from canvas list.",
}

export const toolConfig: Record<string, ToolGroupConfig> = {
  canvas: {
    description:
      "Canvases are structured visual documents stored as `.canvas.json` files. Each contains schemas (node type definitions), nodes (positioned content boxes), and edges (directed connections). Use `list` to discover available canvas documents; use `read` to load a full canvas including its schemas, nodes, and edges.",
    actions: {
      list: {
        description: 'Returns all available canvas document paths.',
        method: 'GET',
        path: '/api/documents',
        params: {},
      },
      read: {
        description: 'Loads the complete canvas: schemas, all nodes with geometry and content, and all edges.',
        method: 'GET',
        path: '/api/document/:path',
        params: { path: pathParam },
      },
    },
  },

  node: {
    description:
      "Nodes are positioned boxes on a canvas. Each node has a schemaName (which type it is), geometry (x/y/w/h in canvas coordinates), optional parent (for nesting inside another node), order (fractional-index string for sibling ordering), and content (key-value fields matching the schema). Read the canvas first to understand available schemas.",
    actions: {
      create: {
        description: 'Add a new node to the canvas.',
        method: 'POST',
        path: '/api/node/create',
        params: {
          path: pathParam,
          schemaName: {
            type: 'described',
            innerType: 'string',
            description: "Name of a schema defined in this canvas. Read the canvas first to see available schemas.",
          },
          'parent?': {
            type: 'described',
            innerType: 'string',
            description: "ID of the node to nest inside. Omit for root-level placement.",
          },
          order: {
            type: 'described',
            innerType: 'string',
            description: "Fractional-index string for sibling ordering (e.g. 'a0', 'a1', 'b0'). Must sort lexicographically after the preceding sibling.",
          },
          geometry: {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {
                x: 'number', y: 'number', w: 'number', h: 'number',
              },
              required: ['x', 'y', 'w', 'h'],
            },
            description: "Position and size in canvas coordinates. x/y is the top-left corner.",
          },
          'content?': {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {},
            },
            description: "Initial content field values. Keys must match the schema's content field names.",
          },
          'id?': {
            type: 'described',
            innerType: 'string',
            description: "Optional node ID. Server generates a unique ID if omitted.",
          },
        },
      },
      setContent: {
        description: "Update the content field values of an existing node.",
        method: 'POST',
        path: '/api/node/setContent',
        params: {
          path: pathParam,
          id: 'string',
          fields: {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {},
            },
            description: "Key-value pairs matching the schema's content field names. Read the canvas to see the schema definition.",
          },
        },
      },
      setParent: {
        description: "Move a node to a different parent (or to root level) and set its order.",
        method: 'POST',
        path: '/api/node/setParent',
        params: {
          path: pathParam,
          id: 'string',
          'parent?': {
            type: 'described',
            innerType: 'string',
            description: "ID of the new parent node. Omit to move the node to root level.",
          },
          order: {
            type: 'described',
            innerType: 'string',
            description: "Fractional-index string for sibling ordering (e.g. 'a0', 'a1', 'b0'). Must sort lexicographically after the preceding sibling.",
          },
        },
      },
      setOrder: {
        description: "Change a node's order among its siblings without changing its parent.",
        method: 'POST',
        path: '/api/node/setOrder',
        params: {
          path: pathParam,
          id: 'string',
          order: {
            type: 'described',
            innerType: 'string',
            description: "Fractional-index string for sibling ordering (e.g. 'a0', 'a1', 'b0'). Must sort lexicographically after the preceding sibling.",
          },
        },
      },
      setGeometry: {
        description: "Move or resize a node by setting its position and dimensions.",
        method: 'POST',
        path: '/api/node/setGeometry',
        params: {
          path: pathParam,
          id: 'string',
          geometry: {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {
                x: 'number', y: 'number', w: 'number', h: 'number',
              },
              required: ['x', 'y', 'w', 'h'],
            },
            description: "Position and size in canvas coordinates. x/y is the top-left corner.",
          },
        },
      },
      delete: {
        description: "Remove a node and all its children from the canvas.",
        method: 'POST',
        path: '/api/node/delete',
        params: { path: pathParam, id: 'string' },
      },
    },
  },

  edge: {
    description:
      "Edges are directed connections between nodes. Freeform by default — any node can connect to any other. An edge can carry an optional label (short text annotation) and optional schemaName (to type it). Edges express relationships without affecting node nesting.",
    actions: {
      connect: {
        description: "Create a directed edge from one node to another.",
        method: 'POST',
        path: '/api/edge/connect',
        params: {
          path: pathParam,
          fromId: 'string',
          toId: 'string',
          'label?': 'string',
          'schemaName?': {
            type: 'described',
            innerType: 'string',
            description: "Optional schema name to type this edge. Read the canvas to see available schemas.",
          },
          'id?': {
            type: 'described',
            innerType: 'string',
            description: "Optional edge ID. Server generates a unique ID if omitted.",
          },
        },
      },
      disconnect: {
        description: "Remove an edge.",
        method: 'POST',
        path: '/api/edge/disconnect',
        params: { path: pathParam, id: 'string' },
      },
      relabel: {
        description: "Change or clear an edge's label.",
        method: 'POST',
        path: '/api/edge/relabel',
        params: { path: pathParam, id: 'string', 'label?': 'string' },
      },
    },
  },

  schema: {
    description:
      "Schemas define node types within a canvas. A schema specifies its visual primitives (drag-bar, title, markdown, container) and their bindings to content fields. Schemas must be defined before creating nodes of that type, and are stored in the canvas file alongside the nodes.",
    actions: {
      define: {
        description: "Create or replace a schema in the canvas.",
        method: 'POST',
        path: '/api/schema/define',
        params: {
          path: pathParam,
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
        description: "Remove a schema from the canvas. Existing nodes of that type will have no schema definition.",
        method: 'POST',
        path: '/api/schema/delete',
        params: { path: pathParam, name: 'string' },
      },
    },
  },

  diag: {
    description:
      "Read-only diagnostics for understanding canvas structure without loading every node. Use these to orient yourself in a large canvas before making edits.",
    actions: {
      roots: {
        description: "Returns per-category root node summaries: count, max nesting depth, and x/y range.",
        method: 'GET',
        path: '/api/diag/roots/:path',
        params: { path: pathParam },
      },
      bbox: {
        description: "Returns a node's geometry and the bounding box of all its descendants.",
        method: 'GET',
        path: '/api/diag/bbox/:path/:id',
        params: { path: pathParam, id: 'string' },
      },
      outliers: {
        description: "Lists nodes with implausible geometry (very large coordinates or dimensions).",
        method: 'GET',
        path: '/api/diag/outliers/:path',
        params: { path: pathParam },
      },
      subtree: {
        description: "Returns a node and all its descendants with their geometries.",
        method: 'GET',
        path: '/api/diag/subtree/:path/:id',
        params: { path: pathParam, id: 'string' },
      },
      outline: {
        description: "Returns the full nesting tree as nested JSON with node titles — best first tool for understanding canvas structure.",
        method: 'GET',
        path: '/api/diag/outline/:path',
        params: { path: pathParam },
      },
      outlineFrom: {
        description: "Returns the nesting tree rooted at a specific node.",
        method: 'GET',
        path: '/api/diag/outline/:path/:id',
        params: { path: pathParam, id: 'string' },
      },
      summary: {
        description: "Returns counts by schema type, total edge count, max nesting depth, and overall bounding box — cheap top-level overview.",
        method: 'GET',
        path: '/api/diag/summary/:path',
        params: { path: pathParam },
      },
      query: {
        description: "Filters and projects nodes by schema type, parent, ID set, or root flag. Use `fields` to select which properties to return.",
        method: 'POST',
        path: '/api/diag/query',
        params: {
          path: pathParam,
          filter: {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {
                type: 'string',
                parent: 'string',
                ids: { type: 'array', items: 'string' },
                root: 'boolean',
              },
            },
            description: "Filter criteria: `type` matches schemaName, `parent` matches parent node ID, `ids` matches specific node IDs, `root: true` returns only root-level nodes.",
          },
          'fields?': { type: 'array', items: 'string' },
        },
      },
    },
  },
}

export const batchToolConfig: BatchToolConfig = {
  description:
    "Apply multiple actions atomically in a single request. Actions execute in order; if any action fails the entire batch fails (fail-fast, no rollback, no partial save). Use `ref` on a create action to name it, then reference its generated ID in later actions via '$ref:<name>' as a string parameter value. Supports all node, edge, and schema actions.",
  path: '/api/action/batch',
}
