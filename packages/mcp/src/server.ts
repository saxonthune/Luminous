import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { toolConfig, batchToolConfig, type ActionConfig, type ToolGroupConfig, type ParamType } from './tools.config.js'

const serverUrl = process.env.LUMINOUS_SERVER_URL ?? 'http://localhost:4080'

const server = new Server(
  { name: 'luminous-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

function paramToJsonSchema(param: ParamType): object {
  if (typeof param === 'string') {
    return { type: param }
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

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Object.entries(toolConfig).map(([name, group]) => ({
    name,
    description: group.description,
    inputSchema: buildInputSchema(group),
  }))
  tools.push({
    name: 'batch',
    description: batchToolConfig.description,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Canvas document path' },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              params: { type: 'object' },
              ref: { type: 'string' },
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

// Health check before starting
try {
  const res = await fetch(`${serverUrl}/api/health`)
  if (!res.ok) {
    throw new Error(`status ${res.status}`)
  }
} catch {
  process.stderr.write(
    `Error: Cannot reach Luminous server at ${serverUrl}. Start it with: pnpm dev:next\n`
  )
  process.exit(1)
}

const transport = new StdioServerTransport()
await server.connect(transport)
