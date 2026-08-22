import { createHash } from "node:crypto"
import { execSync } from "node:child_process"
import { createServer, IncomingMessage, ServerResponse } from "node:http"
import type { Socket } from "node:net"
import { resolve } from "node:path"
import { scanDocuments, resolveRoots } from "./workspace.js"
import {
  getDocument,
  applyAction,
  applyBatch,
  flushAll,
  setRoots,
  watchDocuments,
  createDocument,
  readPackFile,
  readAtlasDataFile,
  getRawDocument,
  writeRawDocument,
  isDataflowPath,
  isRawDocPath,
  copyDocument,
  moveDocument,
  deleteDocument,
} from "./store.js"

const port = Number(process.env.PORT ?? 4080)

// Git commit hash — resolved once at startup
let gitCommit = "unknown"
try {
  gitCommit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim()
} catch {
  // not a git repo or git not available
}

// Parse CLI args. --config points at a gitignored multi-root config file;
// --dir is the single-root fallback when no config is present.
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

const configPath = argValue("--config") ? resolve(argValue("--config")!) : null
const fallbackDir = resolve(argValue("--dir") ?? process.cwd())

const roots = await resolveRoots(configPath, fallbackDir)
setRoots(roots)

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

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    const documents = await scanDocuments(roots)
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
    if (isRawDocPath(docPath)) {
      try {
        const doc = await getRawDocument(docPath)
        sendJson(res, 200, doc)
      } catch {
        sendJson(res, 404, { error: "document not found" })
      }
      return
    }
    const doc = await getDocument(docPath)
    sendJson(res, 200, doc)
    return
  }

  // POST /api/document/write — { path, content } — whole-document write for
  // .dataflow.json files. Graph mutations keep their single write path
  // through /api/action/* and /api/action/batch.
  if (url === "/api/document/write" && req.method === "POST") {
    let body: { path?: string; content?: unknown }
    try {
      body = (await parseBody(req)) as typeof body
    } catch {
      sendJson(res, 400, { error: "invalid JSON" })
      return
    }
    const docPath = body.path
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { ok: false, error: "invalid path" })
      return
    }
    if (!isRawDocPath(docPath)) {
      sendJson(res, 400, { ok: false, error: "only .dataflow.json or .atlas.json paths may be written here" })
      return
    }
    if (body.content === undefined) {
      sendJson(res, 400, { ok: false, error: "missing content" })
      return
    }
    await writeRawDocument(docPath, body.content)
    broadcast(docPath)
    sendJson(res, 200, { ok: true, path: docPath })
    return
  }

  // POST /api/document/copy — { from, to } — duplicate a .dataflow.json file.
  if (url === "/api/document/copy" && req.method === "POST") {
    let body: { from?: string; to?: string }
    try {
      body = (await parseBody(req)) as typeof body
    } catch {
      sendJson(res, 400, { error: "invalid JSON" })
      return
    }
    const { from, to } = body
    if (!from || hasTraversal(from) || !to || hasTraversal(to)) {
      sendJson(res, 400, { ok: false, error: "invalid path" })
      return
    }
    if (!isDataflowPath(from) || !isDataflowPath(to)) {
      sendJson(res, 400, { ok: false, error: "only .dataflow.json paths may be copied here" })
      return
    }
    const result = await copyDocument(from, to)
    if (result.ok) broadcast(to)
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  // POST /api/document/move — { from, to } — move or rename a .dataflow.json file.
  if (url === "/api/document/move" && req.method === "POST") {
    let body: { from?: string; to?: string }
    try {
      body = (await parseBody(req)) as typeof body
    } catch {
      sendJson(res, 400, { error: "invalid JSON" })
      return
    }
    const { from, to } = body
    if (!from || hasTraversal(from) || !to || hasTraversal(to)) {
      sendJson(res, 400, { ok: false, error: "invalid path" })
      return
    }
    if (!isDataflowPath(from) || !isDataflowPath(to)) {
      sendJson(res, 400, { ok: false, error: "only .dataflow.json paths may be moved here" })
      return
    }
    const result = await moveDocument(from, to)
    if (result.ok) {
      broadcast(from)
      broadcast(to)
    }
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  // POST /api/document/delete — { path } — delete a .dataflow.json file.
  if (url === "/api/document/delete" && req.method === "POST") {
    let body: { path?: string }
    try {
      body = (await parseBody(req)) as typeof body
    } catch {
      sendJson(res, 400, { error: "invalid JSON" })
      return
    }
    const docPath = body.path
    if (!docPath || hasTraversal(docPath)) {
      sendJson(res, 400, { ok: false, error: "invalid path" })
      return
    }
    if (!isDataflowPath(docPath)) {
      sendJson(res, 400, { ok: false, error: "only .dataflow.json paths may be deleted here" })
      return
    }
    const result = await deleteDocument(docPath)
    if (result.ok) broadcast(docPath)
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  // POST /api/graph/create
  if (url === "/api/graph/create" && req.method === "POST") {
    let body: { path?: string; pack?: string }
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
    const result = await createDocument(body.path, body.pack ?? '')
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

  // GET /api/pack/:path — serve a *.pack.json file as raw JSON
  if (url.startsWith("/api/pack/") && req.method === "GET") {
    const packPath = decodeURIComponent(url.slice("/api/pack/".length))
    if (!packPath || hasTraversal(packPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    try {
      const content = await readPackFile(packPath)
      setCorsHeaders(res)
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(content)
    } catch {
      sendJson(res, 404, { error: "pack not found" })
    }
    return
  }

  // GET /api/atlasdata/:path — serve a *.atlasdata.json sidecar as raw JSON
  if (url.startsWith("/api/atlasdata/") && req.method === "GET") {
    const dataPath = decodeURIComponent(url.slice("/api/atlasdata/".length))
    if (!dataPath || hasTraversal(dataPath)) {
      sendJson(res, 400, { error: "invalid path" })
      return
    }
    try {
      const content = await readAtlasDataFile(dataPath)
      setCorsHeaders(res)
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(content)
    } catch {
      sendJson(res, 404, { error: "atlas data not found" })
    }
    return
  }

  sendJson(res, 404, { error: "not found" })
}

// Every request is funnelled through a single catch — a thrown handler must
// produce a 500, never take the process down.
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  handleRequest(req, res).catch((err) => {
    console.error("[api] unhandled error:", err)
    if (res.headersSent) {
      res.end()
    } else {
      sendJson(res, 500, { error: "internal server error" })
    }
  })
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
  console.log(`serving ${roots.length} workspace root(s):`)
  for (const r of roots) console.log(`  ${r.name} → ${r.dir}`)
  watchDocuments(roots, (path) => {
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

// Last-resort safety net — log and keep serving rather than exit. A dropped
// request is recoverable; a dead storage server is not.
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled rejection:", reason)
})
process.on("uncaughtException", (err) => {
  console.error("[server] uncaught exception:", err)
})
