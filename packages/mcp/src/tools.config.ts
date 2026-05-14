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
      "Canvases are v3 structured visual documents stored as `.canvas.json` files. Each references one or more packs (versioned libraries that define node and edge kinds). Use `list` to discover available documents; `read` to inspect a canvas; `create` to author a new one.",
    actions: {
      list: {
        description: 'Returns all available canvas document paths.',
        method: 'GET',
        path: '/api/documents',
        params: {},
      },
      read: {
        description: 'Loads the complete canvas: packs, all nodes (id, kind, props, tags), and all edges.',
        method: 'GET',
        path: '/api/document/:path',
        params: { path: pathParam },
      },
      create: {
        description: "Create a new empty v3 canvas file. Fails if the file already exists.",
        method: 'POST',
        path: '/api/canvas/create',
        params: {
          path: {
            type: 'described',
            innerType: 'string',
            description: "Canvas filename to create, e.g. 'overview.canvas.json'.",
          },
          'packs?': {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {},
            },
            description: "Map of packId → semver range that this canvas uses, e.g. {\"primitives\": \"^0.1.0\"}.",
          },
        },
      },
    },
  },

  node: {
    description:
      "Nodes are the content elements of a v3 canvas. Each node has a `kind` (a dot-namespaced string defined by a pack, e.g. `prim.box`), `props` (kind-specific key-value data), and `tags` (free-form string labels). Layout is computed by the viewer — nodes have no position in the file.",
    actions: {
      add: {
        description: 'Add a new node to the canvas.',
        method: 'POST',
        path: '/api/node/add',
        params: {
          path: pathParam,
          kind: {
            type: 'described',
            innerType: 'string',
            description: "Node kind defined by a registered pack, e.g. 'prim.box'. Read the canvas to see which packs are referenced.",
          },
          'props?': {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {},
            },
            description: "Kind-specific properties. Keys and value types are defined by the pack's schema for this kind.",
          },
          'tags?': {
            type: 'described',
            innerType: { type: 'array', items: 'string' },
            description: "Free-form string labels attached to the node.",
          },
          'id?': {
            type: 'described',
            innerType: 'string',
            description: "Optional node ID. Server generates a UUID if omitted.",
          },
        },
      },
      setProps: {
        description: "Shallow-merge new props into an existing node. Existing props not in the update are preserved.",
        method: 'POST',
        path: '/api/node/setProps',
        params: {
          path: pathParam,
          id: 'string',
          props: {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {},
            },
            description: "Props to merge. Existing keys not listed here are unchanged.",
          },
        },
      },
      setTags: {
        description: "Replace the tags array on an existing node.",
        method: 'POST',
        path: '/api/node/setTags',
        params: {
          path: pathParam,
          id: 'string',
          tags: {
            type: 'described',
            innerType: { type: 'array', items: 'string' },
            description: "New tags array. Replaces the previous tags entirely.",
          },
        },
      },
      delete: {
        description: "Remove a node from the canvas. Also removes any edges that reference this node as an endpoint.",
        method: 'POST',
        path: '/api/node/delete',
        params: { path: pathParam, id: 'string' },
      },
    },
  },

  edge: {
    description:
      "Edges are directed connections between nodes in a v3 canvas. Each edge has a `kind` (pack-defined, e.g. `prim.arrow`), a `from` node ID, a `to` node ID, `props`, and `tags`. Endpoints must reference existing nodes — the server validates this on `add`.",
    actions: {
      add: {
        description: "Create a directed edge from one node to another. Returns an error if either endpoint node does not exist.",
        method: 'POST',
        path: '/api/edge/add',
        params: {
          path: pathParam,
          kind: {
            type: 'described',
            innerType: 'string',
            description: "Edge kind defined by a registered pack, e.g. 'prim.arrow'.",
          },
          from: {
            type: 'described',
            innerType: 'string',
            description: "ID of the source node. Must exist in the canvas.",
          },
          to: {
            type: 'described',
            innerType: 'string',
            description: "ID of the target node. Must exist in the canvas.",
          },
          'props?': {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {},
            },
            description: "Kind-specific properties.",
          },
          'tags?': {
            type: 'described',
            innerType: { type: 'array', items: 'string' },
            description: "Free-form string labels.",
          },
          'id?': {
            type: 'described',
            innerType: 'string',
            description: "Optional edge ID. Server generates a UUID if omitted.",
          },
        },
      },
      setProps: {
        description: "Shallow-merge new props into an existing edge.",
        method: 'POST',
        path: '/api/edge/setProps',
        params: {
          path: pathParam,
          id: 'string',
          props: {
            type: 'described',
            innerType: {
              type: 'object',
              properties: {},
            },
            description: "Props to merge. Existing keys not listed here are unchanged.",
          },
        },
      },
      setTags: {
        description: "Replace the tags array on an existing edge.",
        method: 'POST',
        path: '/api/edge/setTags',
        params: {
          path: pathParam,
          id: 'string',
          tags: {
            type: 'described',
            innerType: { type: 'array', items: 'string' },
            description: "New tags array. Replaces the previous tags entirely.",
          },
        },
      },
      remove: {
        description: "Remove an edge.",
        method: 'POST',
        path: '/api/edge/remove',
        params: { path: pathParam, id: 'string' },
      },
    },
  },
}

export const batchToolConfig: BatchToolConfig = {
  description:
    "Apply multiple v3 actions atomically in a single request. Actions execute in order; if any action fails the entire batch fails (fail-fast, no rollback, no partial save). Use `ref` on an add action to name it, then reference its generated ID in later actions via '$ref:<name>' as a string parameter value. Supports all node and edge actions. Example: add a node with ref 'n1', then add an edge using '$ref:n1' as the from ID.",
  path: '/api/action/batch',
}
