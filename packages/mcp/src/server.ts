import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { toolConfig, batchToolConfig, type ActionConfig, type ToolGroupConfig, type ParamType } from './tools.config.js'
import { describePack, describePackForCanvas } from './pack-describe.js'
import { getNode, listNodes, listEdges, neighborhoodOf } from './query-tools.js'
import { listViews, project } from './view-tools.js'

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
    `Error: Cannot reach Luminous server at ${serverUrl}. Start it with: pnpm dev:next\n`
  )
  process.exit(1)
}

const instructions = `\
Luminous is a structured visual canvas tool for software design. It maintains v3 .graph.json files — each referencing a single pack and containing nodes and edges.

Core concepts:
- Pack: a library (e.g. "primitives") that defines node and edge kinds along with their props schemas and default views. Each canvas declares one pack, resolved from a sibling <name>.pack.json file.
- Node: a content element with a pack-defined kind (e.g. "prim.box"), props (kind-specific key-value data), and tags (free-form strings). Layout is computed by the viewer — nodes have no x/y/w/h in the file.
- Edge: a directed connection from one node to another. Has a kind (e.g. "prim.arrow"), from/to node IDs, props, and tags. The server validates that both endpoints exist when adding an edge.

Recommended workflow:
1. canvas list — discover available canvas documents
2. query getNode / listNodes / listEdges / neighborhood — orient yourself in the graph without loading it all into context
3. pack describe — inspect the pack's kind catalog (node and edge kinds with props JSON Schemas) — use before node/add or edge/add to discover valid kinds and required props
4. canvas read — inspect the full canvas when you need everything at once
5. canvas create — author a new canvas, specifying which pack it will use
6. node add / edge add — add nodes and edges using kinds the pack defines
7. batch — use for multi-step operations to reduce round-trips

All mutations go through the same API that the browser canvas uses — there is no separate write path.

Prefer the batch tool for multi-step operations. Batch executes actions atomically (fail-fast, no rollback), supports ID references via $ref:<name> for chaining creates, and reduces round-trips. Example: add a node with ref "n1", then add an edge using "$ref:n1" as the from ID.

Tool groups: pack (describe — inspect kind catalog), canvas (list/read/create documents), node (add/setProps/setTags/delete), edge (add/setProps/setTags/remove), batch (atomic multi-action sequences), query (getNode/listNodes/listEdges/neighborhood — local read-only queries, no server write path), view (list/project — inspect views and project the canvas through one; project returns visible structure — spatial/latent nodes, arrows, summary chips, containment tree — not pixel positions or the user's live zoom).`

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
    name: 'batch',
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
  if (name === 'batch') {
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
  if (name === 'view') {
    const a = args as { action: string; path: string; viewId?: string }
    try {
      let result: unknown
      if (a.action === 'list') {
        result = await listViews(serverUrl, a.path)
      } else if (a.action === 'project') {
        result = await project(serverUrl, a.path, a.viewId)
      } else {
        return {
          content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'view'` }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }

  if (name === 'query') {
    const a = args as { action: string; path: string; id?: string; filter?: unknown; hops?: number }
    try {
      let result: unknown
      if (a.action === 'getNode') {
        if (!a.id) throw new Error("'id' is required for query/getNode")
        result = await getNode(serverUrl, a.path, a.id)
      } else if (a.action === 'listNodes') {
        result = await listNodes(serverUrl, a.path, a.filter as Parameters<typeof listNodes>[2])
      } else if (a.action === 'listEdges') {
        result = await listEdges(serverUrl, a.path, a.filter as Parameters<typeof listEdges>[2])
      } else if (a.action === 'neighborhood') {
        if (!a.id) throw new Error("'id' is required for query/neighborhood")
        result = await neighborhoodOf(serverUrl, a.path, a.id, a.hops)
      } else {
        return {
          content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'query'` }],
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
  if (name === 'pack') {
    const a = args as { action: string; canvas?: string; pack?: string }
    if (a.action !== 'describe') {
      return {
        content: [{ type: 'text', text: `Error: Unknown action '${a.action}' for tool 'pack'` }],
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
