import { createHash } from "node:crypto"
import { createServer, IncomingMessage, ServerResponse } from "node:http"
import type { Socket } from "node:net"
import { resolve } from "node:path"
import { scanDocuments } from "./workspace.js"
import { getDocument, applyAction, applyBatch, flushAll, setRootDir, watchDocuments } from "./store.js"

const port = Number(process.env.PORT ?? 4080)

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
    sendJson(res, 200, { status: "ok" })
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
