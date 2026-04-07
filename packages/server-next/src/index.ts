import { createServer, IncomingMessage, ServerResponse } from "node:http"
import { resolve } from "node:path"
import { scanDocuments } from "./workspace.js"
import { getDocument, applyAction, flushAll, setRootDir } from "./store.js"

const port = Number(process.env.PORT ?? 4080)

// Parse --dir CLI arg
const dirArgIndex = process.argv.indexOf("--dir")
const rootDir = resolve(
  dirArgIndex !== -1 && process.argv[dirArgIndex + 1]
    ? process.argv[dirArgIndex + 1]
    : process.cwd()
)
setRootDir(rootDir)

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

server.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`)
  console.log(`serving documents from: ${rootDir}`)
})

async function shutdown(): Promise<void> {
  console.log("flushing dirty documents…")
  await flushAll()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
