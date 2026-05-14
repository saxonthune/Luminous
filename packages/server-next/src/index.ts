import { createHash } from "node:crypto"
import { execSync } from "node:child_process"
import { createServer, IncomingMessage, ServerResponse } from "node:http"
import type { Socket } from "node:net"
import { resolve } from "node:path"
import { scanDocuments } from "./workspace.js"
import { getDocument, applyAction, applyBatch, flushAll, setRootDir, watchDocuments, createDocument } from "./store.js"
import type { V2Document } from "./types.js"
import { roots as diagRoots, bbox as diagBbox, outliers as diagOutliers, subtree as diagSubtree, outline as diagOutline, summary as diagSummary, query as diagQuery } from "./diag.js"
import type { QueryFilter } from "./diag.js"

const port = Number(process.env.PORT ?? 4080)

// Git commit hash — resolved once at startup
let gitCommit = "unknown"
try {
  gitCommit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim()
} catch {
  // not a git repo or git not available
}

// Parse --dir CLI arg
const dirArgIndex = process.argv.indexOf("--dir")
const rootDir = resolve(
  dirArgIndex !== -1 && process.argv[dirArgIndex + 1]
    ? process.argv[dirArgIndex + 1]
    : process.cwd()
)
setRootDir(rootDir)

// ---------------------------------------------------------------------------
// WebSocket helpers (text frames only, no library)
// ---------------------------------------------------------------------------

const clients = new Set<Socket>()

function wsHandshake(socket: Socket, key: string): void {
  const accept = createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64")
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
  )
}

function wsSendText(socket: Socket, text: string): void {
  const payload = Buffer.from(text, "utf-8")
  const len = payload.length
  let header: Buffer
  if (len < 126) {
    header = Buffer.alloc(2)
    header[0] = 0x81
    header[1] = len
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  socket.write(Buffer.concat([header, payload]))
}

function broadcast(path: string): void {
  const msg = JSON.stringify({ event: "changed", path })
  for (const socket of clients) {
    try {
      wsSendText(socket, msg)
    } catch {
      socket.destroy()
      clients.delete(socket)
    }
  }
}

// ---------------------------------------------------------------------------

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  setCorsHeaders(res)
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8")
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on("error", reject)
  })
}

function hasTraversal(p: string): boolean {
  return p.includes("..") || p.startsWith("/")
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res)
    res.writeHead(204)
    res.end()
    return
  }

  const url = req.url ?? "/"

  // GET /api/health
  if (url === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { status: "ok", commit: gitCommit })
    return
  }

  // GET /api/documents
  if (url === "/api/documents" && req.method === "GET") {
    const documents = await scanDocuments(rootDir)
    sendJson(res, 200, { documents })
    return
  }

  // GET /api/document/:path
  if (url.startsWith("/api/document/") && req.method === "GET") {
    const docPath = decodeURIComponent(url.slice("/api/document/".length))
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    console.log(`[api] GET document: ${docPath}`)
    const doc = await getDocument(docPath)
    sendJson(res, 200, doc)
    return
  }

  // GET /api/diag/roots/:path
  if (url.startsWith("/api/diag/roots/") && req.method === "GET") {
    const docPath = decodeURIComponent(url.slice("/api/diag/roots/".length))
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    const doc = await getDocument(docPath)
    sendJson(res, 200, diagRoots(doc as unknown as V2Document))
    return
  }

  // GET /api/diag/outliers/:path
  if (url.startsWith("/api/diag/outliers/") && req.method === "GET") {
    const docPath = decodeURIComponent(url.slice("/api/diag/outliers/".length))
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    const doc = await getDocument(docPath)
    sendJson(res, 200, diagOutliers(doc as unknown as V2Document))
    return
  }

  // GET /api/diag/bbox/:path/:id  — split on last slash to extract id
  if (url.startsWith("/api/diag/bbox/") && req.method === "GET") {
    const raw = decodeURIComponent(url.slice("/api/diag/bbox/".length))
    const lastSlash = raw.lastIndexOf("/")
    if (lastSlash === -1) {
      sendJson(res, 400, { error: "missing id" })
      return
    }
    const docPath = raw.slice(0, lastSlash)
    const nodeId = raw.slice(lastSlash + 1)
    if (!docPath || hasTraversal(docPath) || !nodeId) {
      sendJson(res, 400, { error: "invalid path or id" })
      return
    }
    const doc = await getDocument(docPath)
    const result = diagBbox(doc as unknown as V2Document, nodeId)
    if (result === null) {
      sendJson(res, 404, { error: "node not found" })
      return
    }
    sendJson(res, 200, result)
    return
  }

  // GET /api/diag/subtree/:path/:id  — split on last slash to extract id
  if (url.startsWith("/api/diag/subtree/") && req.method === "GET") {
    const raw = decodeURIComponent(url.slice("/api/diag/subtree/".length))
    const lastSlash = raw.lastIndexOf("/")
    if (lastSlash === -1) {
      sendJson(res, 400, { error: "missing id" })
      return
    }
    const docPath = raw.slice(0, lastSlash)
    const nodeId = raw.slice(lastSlash + 1)
    if (!docPath || hasTraversal(docPath) || !nodeId) {
      sendJson(res, 400, { error: "invalid path or id" })
      return
    }
    const doc = await getDocument(docPath)
    const result = diagSubtree(doc as unknown as V2Document, nodeId)
    if (result === null) {
      sendJson(res, 404, { error: "node not found" })
      return
    }
    sendJson(res, 200, result)
    return
  }

  // GET /api/diag/outline/:path/:id  — subtree from a specific node (id is last segment, not .json)
  // GET /api/diag/outline/:path        — all roots (last segment ends in .json)
  if (url.startsWith("/api/diag/outline/") && req.method === "GET") {
    const raw = decodeURIComponent(url.slice("/api/diag/outline/".length))
    const lastSlash = raw.lastIndexOf("/")
    const lastSegment = lastSlash !== -1 ? raw.slice(lastSlash + 1) : raw
    // If the last segment ends in .json it's the canvas filename — path-only (all roots)
    if (lastSegment.endsWith(".json")) {
      const docPath = raw
      if (!docPath || hasTraversal(docPath)) {
        sendJson(res, 400, { error: "invalid path" })
        return
      }
      const doc = await getDocument(docPath)
      sendJson(res, 200, diagOutline(doc as unknown as V2Document, null))
      return
    }
    // Otherwise last segment is a node id — split on lastSlash
    if (lastSlash === -1) {
      sendJson(res, 400, { error: "missing id or invalid path" })
      return
    }
    const docPath = raw.slice(0, lastSlash)
    const nodeId = lastSegment
    if (!docPath || hasTraversal(docPath) || !nodeId) {
      sendJson(res, 400, { error: "invalid path or id" })
      return
    }
    const doc = await getDocument(docPath)
    sendJson(res, 200, diagOutline(doc as unknown as V2Document, nodeId))
    return
  }

  // GET /api/diag/summary/:path
  if (url.startsWith("/api/diag/summary/") && req.method === "GET") {
    const docPath = decodeURIComponent(url.slice("/api/diag/summary/".length))
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    const doc = await getDocument(docPath)
    sendJson(res, 200, diagSummary(doc as unknown as V2Document))
    return
  }

  // POST /api/diag/query
  if (url === "/api/diag/query" && req.method === "POST") {
    let body: { path?: string; filter?: unknown; fields?: unknown }
    try {
      body = (await parseBody(req)) as typeof body
    } catch {
      sendJson(res, 400, { error: "invalid JSON" })
      return
    }
    const docPath = body.path
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    if (
      typeof body.filter !== 'object' ||
      body.filter === null ||
      Array.isArray(body.filter)
    ) {
      sendJson(res, 400, { error: "filter must be an object" })
      return
    }
    const filter = body.filter as QueryFilter
    const fields = Array.isArray(body.fields)
      ? (body.fields as Array<'title' | 'schemaName' | 'parent' | 'geometry'>)
      : undefined
    const doc = await getDocument(docPath)
    sendJson(res, 200, diagQuery(doc as unknown as V2Document, filter, fields))
    return
  }

  // POST /api/canvas/create
  if (url === "/api/canvas/create" && req.method === "POST") {
    let body: { path?: string; packs?: Record<string, string> }
    try {
      body = (await parseBody(req)) as typeof body
    } catch {
      sendJson(res, 400, { error: "invalid JSON" })
      return
    }
    if (!body.path) {
      sendJson(res, 400, { ok: false, error: "missing path" })
      return
    }
    if (hasTraversal(body.path)) {
      sendJson(res, 400, { ok: false, error: "invalid path" })
      return
    }
    const result = await createDocument(body.path, body.packs ?? {})
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  // POST /api/action/batch
  if (url === "/api/action/batch" && req.method === "POST") {
    let body: { path?: string; actions?: unknown[] }
    try {
      body = (await parseBody(req)) as typeof body
    } catch {
      sendJson(res, 400, { error: "invalid JSON" })
      return
    }
    const docPath = body.path as string | undefined
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    const actions = body.actions
    if (!Array.isArray(actions) || actions.length === 0) {
      sendJson(res, 400, { error: "actions must be a non-empty array" })
      return
    }
    const results = await applyBatch(docPath, actions as Array<{ action: string; params: Record<string, unknown>; ref?: string }>)
    const allOk = results.every((r) => r.ok)
    sendJson(res, allOk ? 200 : 400, { ok: allOk, results })
    return
  }

  // POST /api/{action}
  if (url.startsWith("/api/") && req.method === "POST") {
    const action = url.slice("/api/".length)
    if (!action) {
      sendJson(res, 400, { error: "missing action" })
      return
    }
    let body: Record<string, unknown>
    try {
      body = (await parseBody(req)) as Record<string, unknown>
    } catch {
      sendJson(res, 400, { error: "invalid JSON" })
      return
    }
    const docPath = body.path as string | undefined
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    const result = await applyAction(docPath, action, body)
    if (!result.ok) {
      console.error(`[api] action failed: ${action} on ${docPath}`, result)
    }
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  sendJson(res, 404, { error: "not found" })
})

server.on("upgrade", (req: IncomingMessage, socket: Socket, _head: Buffer) => {
  if (req.url !== "/ws/watch") {
    socket.destroy()
    return
  }
  const key = req.headers["sec-websocket-key"] as string | undefined
  if (!key) {
    socket.destroy()
    return
  }
  wsHandshake(socket, key)
  clients.add(socket)
  socket.on("close", () => clients.delete(socket))
  socket.on("error", () => {
    socket.destroy()
    clients.delete(socket)
  })
})

server.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`)
  console.log(`serving documents from: ${rootDir}`)
  watchDocuments(rootDir, (path) => {
    console.log(`[watch] external change detected: ${path}`)
    broadcast(path)
  })
})

async function shutdown(): Promise<void> {
  console.log("flushing dirty documents…")
  await flushAll()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
