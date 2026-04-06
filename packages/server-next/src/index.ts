import { createServer, IncomingMessage, ServerResponse } from "node:http";

const port = Number(process.env.PORT ?? 4080);

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/api/hello" && req.method === "GET") {
    sendJson(res, 200, { message: "hello world" });
    return;
  }

  if (req.url === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
