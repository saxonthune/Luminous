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
  /** When true, the tool is handled locally (not proxied to the storage server). */
  local?: true
  actions: Record<string, ActionConfig>
}

export interface BatchToolConfig {
  description: string
  path: string
}

const pathParam: ParamType = {
  type: 'described',
  innerType: 'string',
  description: "Path to the graph document, e.g. 'project.graph.json'. Get available paths from canvas list.",
}

export const toolConfig: Record<string, ToolGroupConfig> = {
  pack: {
    description:
      "Inspect the pack declared by a canvas. Returns all node and edge kinds with their labels and props JSON Schemas — use this before node/add or edge/add to discover valid kinds and required props.",
    actions: {
      describe: {
        description:
          "Return the kind catalog (node kinds and edge kinds with labels and props JSON Schemas) for the pack used by the given canvas, or directly by pack name. Provide either canvas or pack.",
        method: 'GET',
        path: '/api/pack/:pack',
        params: {
          'canvas?': {
            type: 'described',
            innerType: 'string',
            description: "Path to a canvas whose pack you want to inspect, e.g. 'overview.graph.json'. Provide either canvas or pack.",
          },
          'pack?': {
            type: 'described',
            innerType: 'string',
            description: "Pack name to describe directly, e.g. 'primitives'. Provide either canvas or pack.",
          },
        },
      },
    },
  },

  canvas: {
    description:
      "Canvases are v3 structured visual documents stored as `.graph.json` files. Each references a single pack (a library that defines node and edge kinds). Use `list` to discover available documents; `read` to inspect a canvas; `create` to author a new one.",
    actions: {
      list: {
        description: 'Returns all available canvas document paths.',
        method: 'GET',
        path: '/api/documents',
        params: {},
      },
      read: {
        description: 'Loads the complete canvas: pack, all nodes (id, kind, props, tags), and all edges.',
        method: 'GET',
        path: '/api/document/:path',
        params: { path: pathParam },
      },
      create: {
        description: "Create a new empty v3 canvas file. Fails if the file already exists.",
        method: 'POST',
        path: '/api/graph/create',
        params: {
          path: {
            type: 'described',
            innerType: 'string',
            description: "Graph filename to create, e.g. 'overview.graph.json'.",
          },
          'pack?': {
            type: 'described',
            innerType: 'string',
            description: "Pack name this canvas uses, e.g. 'primitives'. Resolves to a sibling <name>.pack.json.",
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
            description: "Node kind defined by the canvas's pack, e.g. 'prim.box'. Use pack/describe to see all available kinds and their props schemas.",
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
            description: "Edge kind defined by the canvas's pack, e.g. 'prim.arrow'. Use pack/describe to see all available kinds and their props schemas.",
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

  view: {
    description:
      "Inspect the views defined by a canvas's pack and project the canvas through a view. `list` shows all views with their role maps (what each view shows, hides, or nests). `project` evaluates the view and returns the visible structure — which nodes are spatial vs latent, which edges are arrows vs summary chips, and the containment tree — the same partition the browser canvas renders. Returns structure only (no pixel positions or live viewport state).",
    local: true,
    actions: {
      list: {
        description: "List all views defined in the canvas's pack, including their nodeRoles and edgeRoles so you can interpret what each view shows.",
        method: 'GET',
        path: '',
        params: {
          path: pathParam,
        },
      },
      project: {
        description:
          "Project the canvas through a view. Returns spatialNodes, latentNodes, arrows, summaryEdges, containment (rootIds/childrenOf/parentOf), and warnings. Omit viewId to use the canvas's defaultView.",
        method: 'GET',
        path: '',
        params: {
          path: pathParam,
          'viewId?': {
            type: 'described',
            innerType: 'string',
            description:
              "ID of the view to project through. Omit to use the canvas's defaultView. Use view/list to see available view IDs.",
          },
        },
      },
    },
  },

  query: {
    description:
      "Query a canvas graph without loading it entirely into context. Fetch a single node by ID, filter nodes or edges with the GraphQuery grammar, or pull a node's neighborhood. Runs locally — does not write to the canvas.",
    local: true,
    actions: {
      getNode: {
        description: "Fetch a single node by its ID. Throws if the node does not exist.",
        method: 'GET',
        path: '',
        params: {
          path: pathParam,
          id: {
            type: 'described',
            innerType: 'string',
            description: "ID of the node to fetch.",
          },
        },
      },
      listNodes: {
        description: "List nodes in the canvas, optionally filtered by a GraphQuery. Returns all nodes when filter is omitted.",
        method: 'GET',
        path: '',
        params: {
          path: pathParam,
          'filter?': {
            type: 'described',
            innerType: { type: 'object', properties: {} },
            description:
              "GraphQuery filter object. Fields: kind (string or string[]), tags ({any?, all?, none?}: string[]), props ({path: value | {op, value}}), from (string | string[]), to (string | string[]), and/or/not (nested GraphQuery). A bare scalar in props is shorthand for {op:'eq',value}. Omit to return all nodes.\nExamples: {kind:'prim.box'} — by kind; {props:{status:'active'}} — by prop eq; {tags:{any:['deprecated']}} — by tag; {and:[{kind:'prim.box'},{props:{count:{op:'gte',value:5}}}]} — compound.",
          },
        },
      },
      listEdges: {
        description: "List edges in the canvas, optionally filtered by a GraphQuery. Returns all edges when filter is omitted.",
        method: 'GET',
        path: '',
        params: {
          path: pathParam,
          'filter?': {
            type: 'described',
            innerType: { type: 'object', properties: {} },
            description:
              "GraphQuery filter object. Same grammar as listNodes filter plus from/to (source/target node ID or array of IDs). Omit to return all edges.\nExamples: {kind:'prim.arrow'} — by kind; {from:'n1'} — edges leaving n1; {to:['n2','n3']} — edges arriving at n2 or n3.",
          },
        },
      },
      neighborhood: {
        description: "Return the nodes and edges within N hops of the given node (both incoming and outgoing). Useful for local context without loading the full graph.",
        method: 'GET',
        path: '',
        params: {
          path: pathParam,
          id: {
            type: 'described',
            innerType: 'string',
            description: "ID of the center node.",
          },
          'hops?': {
            type: 'described',
            innerType: 'number',
            description: "Number of hops to expand (default 1).",
          },
        },
      },
    },
  },
}

export const batchToolConfig: BatchToolConfig = {
  description:
    "Apply multiple v3 actions atomically in a single request. Actions execute in order; if any action fails the entire batch fails (fail-fast, no rollback, no partial save). Use `ref` on an add action to name it, then reference its generated ID in later actions via '$ref:<name>' as a string parameter value. Supports all node and edge actions. Example: add a node with ref 'n1', then add an edge using '$ref:n1' as the from ID.",
  path: '/api/action/batch',
}
