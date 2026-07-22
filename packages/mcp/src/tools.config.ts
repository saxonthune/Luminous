import { ATLAS_COLOR_TOKENS } from '@luminous/core/atlas'

export type ParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | { type: 'object'; properties: Record<string, ParamType>; required?: string[] }
  | { type: 'array'; items: ParamType }
  | { type: 'described'; innerType: ParamType; description: string }
  | { type: 'enum'; values: readonly string[] }

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
  dataflow: {
    description:
      "Author dataflow diagrams — .dataflow.json documents made of Boxes (processes, stores, external entities) connected by Flows (directed data movement). Unlike the v3 canvas/node/edge tools, a dataflow Document has no pack: Box and Flow are the whole vocabulary. Use `list` to discover documents, `create` to start one, `addBox`/`connect` to build it up, and `check` to catch structural issues (orphan boxes, black holes) before sharing it.",
    local: true,
    actions: {
      list: {
        description: "Return the paths of all dataflow documents (files ending '.dataflow.json') in the workspace.",
        method: 'GET',
        path: '',
        params: {},
      },
      create: {
        description: "Create a new empty dataflow document at path. Fails if path does not end '.dataflow.json'.",
        method: 'POST',
        path: '',
        params: {
          path: {
            type: 'described',
            innerType: 'string',
            description: "Filename to create, must end '.dataflow.json', e.g. 'checkout.dataflow.json'.",
          },
        },
      },
      read: {
        description: "Load the complete dataflow document: all Boxes (id, name, description, contract) and all Flows (from, to).",
        method: 'GET',
        path: '',
        params: { path: pathParam },
      },
      addBox: {
        description: "Add a new Box (a process, data store, or external entity) to the document. The Box id derives from name and never changes afterward. Returns the new Box's id.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          name: {
            type: 'described',
            innerType: 'string',
            description: "Human-readable name for the Box, e.g. 'Payment Processor'.",
          },
          'description?': {
            type: 'described',
            innerType: 'string',
            description: "Free-text description of what the Box does.",
          },
          'contract?': {
            type: 'described',
            innerType: {
              type: 'object',
              properties: { format: 'string', text: 'string' },
              required: ['format', 'text'],
            },
            description: "Structured contract for the Box's data shape: { format, text }, e.g. { format: 'json-schema', text: '...' }.",
          },
          'group?': {
            type: 'described',
            innerType: 'string',
            description: "Group name for the Box. Boxes sharing a group name form a Group.",
          },
        },
      },
      set: {
        description: "Update an existing Box's name, description, or contract. Renaming changes only the name — the Box's id is unaffected.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          box: {
            type: 'described',
            innerType: 'string',
            description: "Id of the Box to update.",
          },
          'name?': {
            type: 'described',
            innerType: 'string',
            description: "New name for the Box.",
          },
          'description?': {
            type: 'described',
            innerType: 'string',
            description: "New description for the Box.",
          },
          'contract?': {
            type: 'described',
            innerType: {
              type: 'object',
              properties: { format: 'string', text: 'string' },
              required: ['format', 'text'],
            },
            description: "New contract for the Box: { format, text }.",
          },
          'group?': {
            type: 'described',
            innerType: 'string',
            description: "New group name for the Box. Pass null to clear the Box's group.",
          },
        },
      },
      connect: {
        description: "Add a Flow (directed data movement) from one Box to another. Both Boxes must already exist; a duplicate Flow between the same pair is rejected.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          from: {
            type: 'described',
            innerType: 'string',
            description: "Id of the source Box.",
          },
          to: {
            type: 'described',
            innerType: 'string',
            description: "Id of the destination Box.",
          },
        },
      },
      disconnect: {
        description: "Remove the Flow from one Box to another.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          from: {
            type: 'described',
            innerType: 'string',
            description: "Id of the Flow's source Box.",
          },
          to: {
            type: 'described',
            innerType: 'string',
            description: "Id of the Flow's destination Box.",
          },
        },
      },
      removeBox: {
        description: "Remove a Box from the document. Fails if any Flow still attaches to it unless `cascade` is set, which removes those Flows too.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          box: {
            type: 'described',
            innerType: 'string',
            description: "Id of the Box to remove.",
          },
          'cascade?': {
            type: 'described',
            innerType: 'boolean',
            description: "If true, also remove any Flows attached to this Box. Defaults to false — removal fails if Flows are attached.",
          },
        },
      },
      check: {
        description: "Validate the document and return issues: errors (a Flow endpoint that names no Box, duplicate ids or names) and warnings (a Box with no Flows at all, or with inbound Flows but no outbound Flow — a DFD black hole). Warnings never block a write.",
        method: 'GET',
        path: '',
        params: { path: pathParam },
      },
      batch: {
        description: "Apply a sequence of dataflow actions atomically — either all apply and the document is written once, or none apply and nothing is written. Each action is an object with a `type` field ('addBox' | 'set' | 'connect' | 'disconnect' | 'removeBox') and that action's own fields (see addBox/set/connect/disconnect/removeBox above, using `id` in place of `box` for set/removeBox).",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          actions: {
            type: 'described',
            innerType: { type: 'array', items: { type: 'object', properties: {} } },
            description: "Ordered array of dataflow actions to apply atomically.",
          },
        },
      },
    },
  },
  atlas: {
    description:
      "Author Atlas canvases — .atlas.json documents made of Nodes (with optional Markdown/code Content, nesting via parent, and free x/y placement) connected by directed Edges. Unlike the v3 canvas/node/edge tools, an Atlas document has no pack and node ids are author-supplied, not generated — pick meaningful ids (e.g. 'cli.braincrawl.openalex'). Use `list` to discover documents, `create` to start one, `node/create`/`edge/connect` to build it up, `edge/bisect` to split an edge by inserting a node in its middle, and `legend/set` to record what each color means in the document.",
    local: true,
    actions: {
      list: {
        description: "Return the paths of all atlas documents (files ending '.atlas.json') in the workspace.",
        method: 'GET',
        path: '',
        params: {},
      },
      create: {
        description: "Create a new empty atlas document at path. Fails if path does not end '.atlas.json'.",
        method: 'POST',
        path: '',
        params: {
          path: {
            type: 'described',
            innerType: 'string',
            description: "Filename to create, must end '.atlas.json', e.g. 'braincrawl.atlas.json'.",
          },
        },
      },
      read: {
        description: "Load the complete atlas document: the Legend (color token -> label), all Nodes (id, name, parent, content, x, y, color), and all Edges (from, to).",
        method: 'GET',
        path: '',
        params: { path: pathParam },
      },
      'node/create': {
        description: "Add a new Node to the document with an explicit, author-chosen id — ids are meaningful (e.g. 'cli.braincrawl.openalex'), never generated. Fails if the id already exists or the parent does not exist.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          id: {
            type: 'described',
            innerType: 'string',
            description: "Explicit id for the new node, e.g. 'cli.braincrawl.openalex'. Must not already exist.",
          },
          name: {
            type: 'described',
            innerType: 'string',
            description: "Human-readable name for the node.",
          },
          'parent?': {
            type: 'described',
            innerType: 'string',
            description: "Id of the containing node, if nested. Must already exist.",
          },
          'x?': {
            type: 'described',
            innerType: 'number',
            description: "Position, offset from the parent's origin (or canvas-absolute for a root node). x and y must appear together.",
          },
          'y?': {
            type: 'described',
            innerType: 'number',
            description: "Position, offset from the parent's origin (or canvas-absolute for a root node). x and y must appear together.",
          },
          'color?': {
            type: 'described',
            innerType: { type: 'enum', values: ATLAS_COLOR_TOKENS },
            description: "Color slot to apply at creation — one of eight fixed categorical tokens. The pigment each slot paints is theme-owned; the tokens carry no inherent hue.",
          },
        },
      },
      'node/set': {
        description: "Update an existing node's name, content, position, color, or content sizing. Only fields provided are changed.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          id: {
            type: 'described',
            innerType: 'string',
            description: "Id of the node to update.",
          },
          'name?': {
            type: 'described',
            innerType: 'string',
            description: "New name for the node.",
          },
          'content?': {
            type: 'described',
            innerType: {
              type: 'object',
              properties: { text: 'string', mode: 'string' },
              required: ['text', 'mode'],
            },
            description: "New content for the node: { text, mode }, where mode is 'markdown' or 'code'.",
          },
          'x?': {
            type: 'described',
            innerType: 'number',
            description: "New x position.",
          },
          'y?': {
            type: 'described',
            innerType: 'number',
            description: "New y position.",
          },
          'color?': {
            type: 'described',
            innerType: { type: 'enum', values: ATLAS_COLOR_TOKENS },
            description: "Color slot for the node — one of eight fixed categorical tokens. The pigment each slot paints is theme-owned; the tokens carry no inherent hue.",
          },
          'contentHeight?': {
            type: 'described',
            innerType: 'number',
            description: "Stored override for the node's header band height.",
          },
          'contentWidth?': {
            type: 'described',
            innerType: 'number',
            description: "Stored override for the node's width floor.",
          },
        },
      },
      'node/reparent': {
        description: "Move a node to a new parent (or to the root when parent is omitted). Rejects a move that would create a cycle.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          id: {
            type: 'described',
            innerType: 'string',
            description: "Id of the node to reparent.",
          },
          'parent?': {
            type: 'described',
            innerType: 'string',
            description: "Id of the new parent. Omit to move the node to the root.",
          },
        },
      },
      'node/delete': {
        description: "Remove a node and all its descendants, along with any edges touching them.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          id: {
            type: 'described',
            innerType: 'string',
            description: "Id of the node to remove, along with its descendants.",
          },
        },
      },
      'edge/connect': {
        description: "Add a directed edge from one node to another. Both nodes must already exist; a duplicate edge between the same pair is a no-op.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          from: {
            type: 'described',
            innerType: 'string',
            description: "Id of the source node.",
          },
          to: {
            type: 'described',
            innerType: 'string',
            description: "Id of the target node.",
          },
        },
      },
      'edge/disconnect': {
        description: "Remove the edge from one node to another.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          from: {
            type: 'described',
            innerType: 'string',
            description: "Id of the edge's source node.",
          },
          to: {
            type: 'described',
            innerType: 'string',
            description: "Id of the edge's target node.",
          },
        },
      },
      'edge/bisect': {
        description: "Split an existing edge A -> B into A -> newNode -> B, inserting newNode in the middle. newNode's id must be explicit and not already exist.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          from: {
            type: 'described',
            innerType: 'string',
            description: "Id of the edge's source node (unchanged).",
          },
          to: {
            type: 'described',
            innerType: 'string',
            description: "Id of the edge's target node (unchanged).",
          },
          id: {
            type: 'described',
            innerType: 'string',
            description: "Explicit id for the new node inserted between from and to.",
          },
          'name?': {
            type: 'described',
            innerType: 'string',
            description: "Name for the new node. Defaults to its id.",
          },
          'content?': {
            type: 'described',
            innerType: {
              type: 'object',
              properties: { text: 'string', mode: 'string' },
              required: ['text', 'mode'],
            },
            description: "Content for the new node: { text, mode }, where mode is 'markdown' or 'code'.",
          },
          'parent?': {
            type: 'described',
            innerType: 'string',
            description: "Id of the containing node for the new node, if nested.",
          },
          'x?': {
            type: 'described',
            innerType: 'number',
            description: "Position for the new node.",
          },
          'y?': {
            type: 'described',
            innerType: 'number',
            description: "Position for the new node.",
          },
        },
      },
      'legend/set': {
        description: "Replace the document's Legend — the record mapping color tokens to what each color means in this document (e.g. accent-1: 'user-facing interface'). Whole-record replace: to change one label, read the document and send the merged record. An empty record clears the Legend.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          legend: {
            type: 'described',
            innerType: { type: 'object', properties: {} },
            description: "Record keyed by color token ('accent-1' … 'accent-8'), each value the label saying what that color means. Replaces the whole Legend.",
          },
        },
      },
      batch: {
        description: "Apply a sequence of atlas actions atomically — either all apply and the document is written once, or none apply and nothing is written. Each action is an object with a `type` field ('addNode' | 'setNode' | 'removeNode' | 'reparent' | 'addEdge' | 'removeEdge' | 'setLegend') and that action's own fields.",
        method: 'POST',
        path: '',
        params: {
          path: pathParam,
          actions: {
            type: 'described',
            innerType: { type: 'array', items: { type: 'object', properties: {} } },
            description: "Ordered array of atlas actions to apply atomically.",
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
