import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { toolConfig, batchToolConfig, type ActionConfig, type ToolGroupConfig, type ParamType } from './tools.config.js'
import { describePack, describePackForCanvas } from './pack-describe.js'
import { getNode, listNodes, listEdges, neighborhoodOf } from './query-tools.js'
import { listViews, project } from './view-tools.js'
import {
  listDataflows,
  createDataflow,
  readDataflow,
  addBoxTool,
  setBoxTool,
  connectTool,
  disconnectTool,
  removeBoxTool,
  checkTool,
  batchTool,
} from './dataflow-tools.js'
import type { ContractBlock, DataflowAction } from '@luminous/core/dataflow'
import {
  listAtlases,
  createAtlas,
  readAtlas,
  nodeCreate,
  nodeSet,
  nodeReparent,
  nodeDelete,
  edgeConnect,
  edgeDisconnect,
  edgeBisect,
  legendSet,
  applyBatch,
  getAtlasNode,
  searchAtlasNodes,
  listAtlasChildren,
  listAtlasEdges,
  atlasNeighborhood,
} from './atlas-tools.js'
import type { AtlasNeighborhoodDirection } from './atlas-tools.js'
import type { AtlasAction, AtlasColorToken, AtlasContent, AtlasLegend } from '@luminous/core/atlas'
import {
  listLinens,
  createLinen,
  readLinen,
  getLinenNode,
  linenNodeCreate,
  linenNodeSet,
  linenNodeDelete,
  linenModuleCreate,
  linenContractCreate,
  linenConnect,
  linenDisconnect,
  linenBatch,
  linenCheck,
  linenTrace,
  linenManifest,
} from './linen-tools.js'
import type { LinenAction } from '@luminous/core/linen'

const serverUrl = process.env.LUMINOUS_SERVER_URL ?? 'http://localhost:4080'

function paramToJsonSchema(param: ParamType): object {
  if (typeof param === 'string') {
    return { type: param }
  }
  if (param.type === 'described') {
    return { ...paramToJsonSchema(param.innerType), description: param.description }
  }
  if (param.type === 'object') {
    const properties: Record<string, object> = {}
    for (const [key, value] of Object.entries(param.properties)) {
      properties[key] = paramToJsonSchema(value)
    }
    return {
      type: 'object',
      properties,
      ...(param.required ? { required: param.required } : {}),
    }
  }
  if (param.type === 'array') {
    return {
      type: 'array',
      items: paramToJsonSchema(param.items),
    }
  }
  if (param.type === 'enum') {
    return { type: 'string', enum: [...param.values] }
  }
  throw new Error(`Unknown param type: ${JSON.stringify(param)}`)
}

function buildInputSchema(group: ToolGroupConfig): object {
  const allParams = new Map<string, ParamType>()

  for (const action of Object.values(group.actions)) {
    for (const [key, type] of Object.entries(action.params)) {
      const baseName = key.replace(/\?$/, '')
      allParams.set(baseName, type)
    }
  }

  const properties: Record<string, object> = {
    action: {
      type: 'string',
      enum: Object.keys(group.actions),
    },
  }
  for (const [name, param] of allParams) {
    properties[name] = paramToJsonSchema(param)
  }

  // Required: 'action' plus any param that appears in EVERY action without '?' suffix
  const actionNames = Object.keys(group.actions)
  const requiredParams: string[] = []

  for (const baseName of allParams.keys()) {
    const isRequiredInAll = actionNames.every((actionName) => {
      const action = group.actions[actionName]
      return baseName in action.params
    })
    if (isRequiredInAll) {
      requiredParams.push(baseName)
    }
  }

  return {
    type: 'object',
    properties,
    required: ['action', ...requiredParams],
  }
}

function buildToolDescription(group: ToolGroupConfig): string {
  const actionLines = Object.entries(group.actions)
    .filter(([, action]) => action.description)
    .map(([name, action]) => `- ${name}: ${action.description}`)

  if (actionLines.length === 0) return group.description

  return `${group.description}\n\nActions:\n${actionLines.join('\n')}`
}

async function httpRequest(
  baseUrl: string,
  actionConfig: ActionConfig,
  args: Record<string, unknown>
): Promise<unknown> {
  const { action: _action, ...params } = args

  if (actionConfig.method === 'GET') {
    let path = actionConfig.path
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`:${key}`, encodeURIComponent(String(value)))
    }
    const res = await fetch(`${baseUrl}${path}`)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    }
    return res.json()
  } else {
    const res = await fetch(`${baseUrl}${actionConfig.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    }
    return res.json()
  }
}

// Health check — must succeed before we register tools
let serverCommit = 'unknown'
try {
  const res = await fetch(`${serverUrl}/api/health`)
  if (!res.ok) {
    throw new Error(`status ${res.status}`)
  }
  const health = await res.json() as { status: string; commit?: string }
  serverCommit = health.commit ?? 'unknown'
} catch {
  process.stderr.write(
    `Error: Cannot reach Luminous server at ${serverUrl}. Start it with: just dev\n`
  )
  process.exit(1)
}

const instructions = `\
Luminous is a structured visual canvas tool for software design. It maintains v3 .graph.json files — each referencing a single pack and containing nodes and edges.

Core concepts:
- Pack: a library (e.g. "primitives") that defines node and edge kinds along with their props schemas and default views. Each canvas declares one pack, resolved from a sibling <name>.pack.json file.
- Node: a content element with a pack-defined kind (e.g. "prim.box"), props (kind-specific key-value data), and tags (free-form strings). Layout is computed by the viewer — nodes have no x/y/w/h in the file.
- Edge: a directed connection from one node to another. Has a kind (e.g. "prim.arrow"), from/to node IDs, props, and tags. The server validates that both endpoints exist when adding an edge.

The canvas and canvas-* tools operate only on the v3 graph+pack model (.graph.json + .pack.json) — they never read .atlas.json or .dataflow.json. atlas and dataflow are separate document kinds with their own tools.

Recommended workflow:
1. canvas list — discover available canvas documents
2. canvas-query getNode / listNodes / listEdges / neighborhood — orient yourself in the graph without loading it all into context
3. canvas-pack describe — inspect the pack's kind catalog (node and edge kinds with props JSON Schemas) — use before canvas-node add or canvas-edge add to discover valid kinds and required props
4. canvas read — inspect the full canvas when you need everything at once
5. canvas create — author a new canvas, specifying which pack it will use
6. canvas-node add / canvas-edge add — add nodes and edges using kinds the pack defines
7. canvas-batch — use for multi-step operations to reduce round-trips

All mutations go through the same API that the browser canvas uses — there is no separate write path.

Prefer the canvas-batch tool for multi-step operations. It executes actions atomically (fail-fast, no rollback), supports ID references via $ref:<name> for chaining creates, and reduces round-trips. Example: add a node with ref "n1", then add an edge using "$ref:n1" as the from ID.

Tool groups: canvas-pack (describe — inspect kind catalog), canvas (list/read/create documents), canvas-node (add/setProps/setTags/delete), canvas-edge (add/setProps/setTags/remove), canvas-batch (atomic multi-action sequences), canvas-query (getNode/listNodes/listEdges/neighborhood — local read-only queries, no server write path), canvas-view (list/project — inspect views and project the canvas through one; project returns visible structure — spatial/latent nodes, arrows, summary chips, containment tree — not pixel positions or the user's live zoom), dataflow (list/create/read/addBox/set/connect/disconnect/removeBox/check/batch — author .dataflow.json diagrams of Boxes and Flows, a separate document kind from the v3 canvas with no pack), atlas (list/create/read/node/get/node/search/node/children/edge/list/neighborhood/node/create/node/set/node/reparent/node/delete/edge/connect/edge/disconnect/edge/bisect/legend/set/batch — author .atlas.json documents: Nodes with optional Markdown/code Content, nesting via parent, and free x/y placement, connected by directed Edges, plus a Legend recording what each color means; a separate document kind from the v3 canvas with no pack, whose node ids are meaningful and author-supplied rather than generated; node/get/node/search/node/children/edge/list/neighborhood are focused, read-only queries that skip loading the whole Document), linen (list/create/read/node/get/node/create/node/set/node/delete/module/create/contract/create/edge/connect/edge/disconnect/batch/check/trace/manifest — author .linen.json Traces of what happens when a program runs: Modules contain typed Trace Nodes drawn as Glyphs, Edges carry control order or connect to Contracts; trace walks a Trace end to end with each Pass's derived resume Contract, and manifest computes a Module's outbound summary — both derived, never stored).`

const server = new Server(
  { name: 'luminous-mcp', version: `0.1.0+${serverCommit}` },
  { capabilities: { tools: {} }, instructions }
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Object.entries(toolConfig).map(([name, group]) => ({
    name,
    description: buildToolDescription(group),
    inputSchema: buildInputSchema(group),
  }))
  tools.push({
    name: 'canvas-batch',
    description: batchToolConfig.description,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: "Path to the canvas document, e.g. 'project.graph.json'. Get available paths from canvas list.",
        },
        actions: {
          type: 'array',
          description: 'Ordered array of actions to apply atomically.',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: "Action name in 'group/verb' format (e.g. 'node/create', 'edge/connect', 'schema/define').",
              },
              params: {
                type: 'object',
                description: "Parameters for the action, same as passing them to the individual tool (omit the 'path' field — it comes from the batch-level path).",
              },
              ref: {
                type: 'string',
                description: "Optional name for this action. Later actions can reference the generated ID via '$ref:<name>' as a string parameter value.",
              },
            },
            required: ['action', 'params'],
          },
        },
      },
      required: ['path', 'actions'],
    },
  })
  return { tools }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  // Handle batch tool separately
  if (name === 'canvas-batch') {
    const { path, actions } = args as { path: string; actions: unknown[] }
    try {
      const res = await fetch(`${serverUrl}${batchToolConfig.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, actions }),
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }
      const result = await res.json()
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }

  // Handle locally-computed tools (local: true in toolConfig) — they build the graph
  // from raw storage data and run queries in-process rather than proxying to the server.
  if (name === 'canvas-view') {
    const a = args as { action: string; path: string; viewId?: string }
    try {
      let result: unknown
      if (a.action === 'list') {
        result = await listViews(serverUrl, a.path)
      } else if (a.action === 'project') {
        result = await project(serverUrl, a.path, a.viewId)
      } else {
        return {
          content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'canvas-view'` }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }

  if (name === 'dataflow') {
    const a = args as {
      action: string
      path?: string
      name?: string
      description?: string
      contract?: ContractBlock
      group?: string | null
      box?: string
      from?: string
      to?: string
      cascade?: boolean
      actions?: DataflowAction[]
    }
    try {
      let result: unknown
      if (a.action === 'list') {
        result = await listDataflows(serverUrl)
      } else if (a.action === 'create') {
        if (!a.path) throw new Error("'path' is required for dataflow/create")
        result = await createDataflow(serverUrl, a.path)
      } else if (a.action === 'read') {
        if (!a.path) throw new Error("'path' is required for dataflow/read")
        result = await readDataflow(serverUrl, a.path)
      } else if (a.action === 'addBox') {
        if (!a.path) throw new Error("'path' is required for dataflow/addBox")
        if (!a.name) throw new Error("'name' is required for dataflow/addBox")
        result = await addBoxTool(serverUrl, a.path, {
          name: a.name,
          description: a.description,
          contract: a.contract,
          group: a.group ?? undefined,
        })
      } else if (a.action === 'set') {
        if (!a.path) throw new Error("'path' is required for dataflow/set")
        if (!a.box) throw new Error("'box' is required for dataflow/set")
        result = await setBoxTool(serverUrl, a.path, a.box, {
          name: a.name,
          description: a.description,
          contract: a.contract,
          group: a.group,
        })
      } else if (a.action === 'connect') {
        if (!a.path) throw new Error("'path' is required for dataflow/connect")
        if (!a.from || !a.to) throw new Error("'from' and 'to' are required for dataflow/connect")
        result = await connectTool(serverUrl, a.path, a.from, a.to)
      } else if (a.action === 'disconnect') {
        if (!a.path) throw new Error("'path' is required for dataflow/disconnect")
        if (!a.from || !a.to) throw new Error("'from' and 'to' are required for dataflow/disconnect")
        result = await disconnectTool(serverUrl, a.path, a.from, a.to)
      } else if (a.action === 'removeBox') {
        if (!a.path) throw new Error("'path' is required for dataflow/removeBox")
        if (!a.box) throw new Error("'box' is required for dataflow/removeBox")
        result = await removeBoxTool(serverUrl, a.path, a.box, a.cascade)
      } else if (a.action === 'check') {
        if (!a.path) throw new Error("'path' is required for dataflow/check")
        result = await checkTool(serverUrl, a.path)
      } else if (a.action === 'batch') {
        if (!a.path) throw new Error("'path' is required for dataflow/batch")
        if (!a.actions) throw new Error("'actions' is required for dataflow/batch")
        result = await batchTool(serverUrl, a.path, a.actions)
      } else {
        return {
          content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'dataflow'` }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }

  if (name === 'atlas') {
    const a = args as {
      action: string
      path?: string
      id?: string
      name?: string
      parent?: string
      x?: number
      y?: number
      content?: AtlasContent
      color?: AtlasColorToken
      contentHeight?: number
      contentWidth?: number
      from?: string
      to?: string
      legend?: AtlasLegend
      actions?: AtlasAction[]
      text?: string
      depth?: number
      direction?: AtlasNeighborhoodDirection
    }
    try {
      let result: unknown
      if (a.action === 'list') {
        result = await listAtlases(serverUrl)
      } else if (a.action === 'create') {
        if (!a.path) throw new Error("'path' is required for atlas/create")
        result = await createAtlas(serverUrl, a.path)
      } else if (a.action === 'read') {
        if (!a.path) throw new Error("'path' is required for atlas/read")
        result = await readAtlas(serverUrl, a.path)
      } else if (a.action === 'node/get') {
        if (!a.path) throw new Error("'path' is required for atlas/node/get")
        if (!a.id) throw new Error("'id' is required for atlas/node/get")
        result = await getAtlasNode(serverUrl, a.path, a.id)
      } else if (a.action === 'node/search') {
        if (!a.path) throw new Error("'path' is required for atlas/node/search")
        if (!a.text) throw new Error("'text' is required for atlas/node/search")
        result = await searchAtlasNodes(serverUrl, a.path, a.text)
      } else if (a.action === 'node/children') {
        if (!a.path) throw new Error("'path' is required for atlas/node/children")
        if (!a.id) throw new Error("'id' is required for atlas/node/children")
        result = await listAtlasChildren(serverUrl, a.path, a.id, a.depth)
      } else if (a.action === 'edge/list') {
        if (!a.path) throw new Error("'path' is required for atlas/edge/list")
        result = await listAtlasEdges(serverUrl, a.path, a.from, a.to)
      } else if (a.action === 'neighborhood') {
        if (!a.path) throw new Error("'path' is required for atlas/neighborhood")
        if (!a.id) throw new Error("'id' is required for atlas/neighborhood")
        result = await atlasNeighborhood(serverUrl, a.path, a.id, a.direction, a.depth)
      } else if (a.action === 'node/create') {
        if (!a.path) throw new Error("'path' is required for atlas/node/create")
        if (!a.id) throw new Error("'id' is required for atlas/node/create")
        if (!a.name) throw new Error("'name' is required for atlas/node/create")
        result = await nodeCreate(serverUrl, a.path, { id: a.id, name: a.name, parent: a.parent, x: a.x, y: a.y, color: a.color })
      } else if (a.action === 'node/set') {
        if (!a.path) throw new Error("'path' is required for atlas/node/set")
        if (!a.id) throw new Error("'id' is required for atlas/node/set")
        result = await nodeSet(serverUrl, a.path, a.id, {
          name: a.name,
          content: a.content,
          x: a.x,
          y: a.y,
          color: a.color,
          contentHeight: a.contentHeight,
          contentWidth: a.contentWidth,
        })
      } else if (a.action === 'node/reparent') {
        if (!a.path) throw new Error("'path' is required for atlas/node/reparent")
        if (!a.id) throw new Error("'id' is required for atlas/node/reparent")
        result = await nodeReparent(serverUrl, a.path, a.id, a.parent)
      } else if (a.action === 'node/delete') {
        if (!a.path) throw new Error("'path' is required for atlas/node/delete")
        if (!a.id) throw new Error("'id' is required for atlas/node/delete")
        result = await nodeDelete(serverUrl, a.path, a.id)
      } else if (a.action === 'edge/connect') {
        if (!a.path) throw new Error("'path' is required for atlas/edge/connect")
        if (!a.from || !a.to) throw new Error("'from' and 'to' are required for atlas/edge/connect")
        result = await edgeConnect(serverUrl, a.path, a.from, a.to)
      } else if (a.action === 'edge/disconnect') {
        if (!a.path) throw new Error("'path' is required for atlas/edge/disconnect")
        if (!a.from || !a.to) throw new Error("'from' and 'to' are required for atlas/edge/disconnect")
        result = await edgeDisconnect(serverUrl, a.path, a.from, a.to)
      } else if (a.action === 'edge/bisect') {
        if (!a.path) throw new Error("'path' is required for atlas/edge/bisect")
        if (!a.from || !a.to) throw new Error("'from' and 'to' are required for atlas/edge/bisect")
        if (!a.id) throw new Error("'id' is required for atlas/edge/bisect")
        result = await edgeBisect(
          serverUrl,
          a.path,
          { from: a.from, to: a.to },
          { id: a.id, name: a.name, content: a.content, x: a.x, y: a.y, parent: a.parent },
        )
      } else if (a.action === 'legend/set') {
        if (!a.path) throw new Error("'path' is required for atlas/legend/set")
        if (!a.legend) throw new Error("'legend' is required for atlas/legend/set")
        result = await legendSet(serverUrl, a.path, a.legend)
      } else if (a.action === 'batch') {
        if (!a.path) throw new Error("'path' is required for atlas/batch")
        if (!a.actions) throw new Error("'actions' is required for atlas/batch")
        result = await applyBatch(serverUrl, a.path, a.actions)
      } else {
        return {
          content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'atlas'` }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }

  if (name === 'linen') {
    const a = args as {
      action: string
      path?: string
      id?: string
      kind?: string
      module?: string
      name?: string
      parent?: string
      owner?: string
      text?: string
      annotation?: string
      to?: string
      contract?: string
      x?: number
      y?: number
      from?: string
      entry?: string
      actions?: LinenAction[]
    }
    try {
      let result: unknown
      if (a.action === 'list') {
        result = await listLinens(serverUrl)
      } else if (a.action === 'create') {
        if (!a.path) throw new Error("'path' is required for linen/create")
        result = await createLinen(serverUrl, a.path)
      } else if (a.action === 'read') {
        if (!a.path) throw new Error("'path' is required for linen/read")
        result = await readLinen(serverUrl, a.path)
      } else if (a.action === 'node/get') {
        if (!a.path) throw new Error("'path' is required for linen/node/get")
        if (!a.id) throw new Error("'id' is required for linen/node/get")
        result = await getLinenNode(serverUrl, a.path, a.id)
      } else if (a.action === 'node/create') {
        if (!a.path) throw new Error("'path' is required for linen/node/create")
        if (!a.id) throw new Error("'id' is required for linen/node/create")
        if (!a.kind) throw new Error("'kind' is required for linen/node/create")
        if (!a.module) throw new Error("'module' is required for linen/node/create")
        result = await linenNodeCreate(serverUrl, a.path, {
          id: a.id,
          kind: a.kind,
          module: a.module,
          annotation: a.annotation,
          x: a.x,
          y: a.y,
          to: a.to,
          contract: a.contract,
        })
      } else if (a.action === 'node/set') {
        if (!a.path) throw new Error("'path' is required for linen/node/set")
        if (!a.id) throw new Error("'id' is required for linen/node/set")
        result = await linenNodeSet(serverUrl, a.path, a.id, {
          annotation: a.annotation,
          x: a.x,
          y: a.y,
          to: a.to,
          contract: a.contract,
        })
      } else if (a.action === 'node/delete') {
        if (!a.path) throw new Error("'path' is required for linen/node/delete")
        if (!a.id) throw new Error("'id' is required for linen/node/delete")
        result = await linenNodeDelete(serverUrl, a.path, a.id)
      } else if (a.action === 'module/create') {
        if (!a.path) throw new Error("'path' is required for linen/module/create")
        if (!a.id) throw new Error("'id' is required for linen/module/create")
        if (!a.name) throw new Error("'name' is required for linen/module/create")
        result = await linenModuleCreate(serverUrl, a.path, { id: a.id, name: a.name, parent: a.parent })
      } else if (a.action === 'contract/create') {
        if (!a.path) throw new Error("'path' is required for linen/contract/create")
        if (!a.id) throw new Error("'id' is required for linen/contract/create")
        if (!a.name) throw new Error("'name' is required for linen/contract/create")
        result = await linenContractCreate(serverUrl, a.path, { id: a.id, name: a.name, owner: a.owner, text: a.text })
      } else if (a.action === 'edge/connect') {
        if (!a.path) throw new Error("'path' is required for linen/edge/connect")
        if (!a.from || !a.to) throw new Error("'from' and 'to' are required for linen/edge/connect")
        result = await linenConnect(serverUrl, a.path, a.from, a.to)
      } else if (a.action === 'edge/disconnect') {
        if (!a.path) throw new Error("'path' is required for linen/edge/disconnect")
        if (!a.from || !a.to) throw new Error("'from' and 'to' are required for linen/edge/disconnect")
        result = await linenDisconnect(serverUrl, a.path, a.from, a.to)
      } else if (a.action === 'batch') {
        if (!a.path) throw new Error("'path' is required for linen/batch")
        if (!a.actions) throw new Error("'actions' is required for linen/batch")
        result = await linenBatch(serverUrl, a.path, a.actions)
      } else if (a.action === 'check') {
        if (!a.path) throw new Error("'path' is required for linen/check")
        result = await linenCheck(serverUrl, a.path)
      } else if (a.action === 'trace') {
        if (!a.path) throw new Error("'path' is required for linen/trace")
        if (!a.entry) throw new Error("'entry' is required for linen/trace")
        result = await linenTrace(serverUrl, a.path, a.entry)
      } else if (a.action === 'manifest') {
        if (!a.path) throw new Error("'path' is required for linen/manifest")
        if (!a.module) throw new Error("'module' is required for linen/manifest")
        result = await linenManifest(serverUrl, a.path, a.module)
      } else {
        return {
          content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'linen'` }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }

  if (name === 'canvas-query') {
    const a = args as { action: string; path: string; id?: string; filter?: unknown; hops?: number }
    try {
      let result: unknown
      if (a.action === 'getNode') {
        if (!a.id) throw new Error("'id' is required for canvas-query getNode")
        result = await getNode(serverUrl, a.path, a.id)
      } else if (a.action === 'listNodes') {
        result = await listNodes(serverUrl, a.path, a.filter as Parameters<typeof listNodes>[2])
      } else if (a.action === 'listEdges') {
        result = await listEdges(serverUrl, a.path, a.filter as Parameters<typeof listEdges>[2])
      } else if (a.action === 'neighborhood') {
        if (!a.id) throw new Error("'id' is required for canvas-query neighborhood")
        result = await neighborhoodOf(serverUrl, a.path, a.id, a.hops)
      } else {
        return {
          content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'canvas-query'` }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }

  // Handle pack tool specially — requires multi-step HTTP logic not covered by the proxy
  if (name === 'canvas-pack') {
    const a = args as { action: string; canvas?: string; pack?: string }
    if (a.action !== 'describe') {
      return {
        content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'canvas-pack'` }],
        isError: true,
      }
    }
    try {
      let catalog
      if (a.pack) {
        catalog = await describePack(serverUrl, a.pack)
      } else if (a.canvas) {
        catalog = await describePackForCanvas(serverUrl, a.canvas)
      } else {
        return {
          content: [{ type: 'text', text: "Error: provide either 'canvas' or 'pack'" }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(catalog, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }

  const group = toolConfig[name]

  if (!group) {
    return {
      content: [{ type: 'text', text: `Error: Unknown tool '${name}'` }],
      isError: true,
    }
  }

  const actionName = (args as Record<string, unknown>).action as string
  const action = group.actions[actionName]

  if (!action) {
    return {
      content: [{ type: 'text', text: `Error: Unknown action '${actionName}' for tool '${name}'` }],
      isError: true,
    }
  }

  try {
    const result = await httpRequest(serverUrl, action, args as Record<string, unknown>)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
