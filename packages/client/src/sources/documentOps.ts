export type DocumentOpResult = { ok: true; path: string } | { ok: false; error: string };

async function postJson(url: string, body: Record<string, unknown>): Promise<DocumentOpResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// On the static demo site there is no server to persist to. Every mutation
// reports success so in-browser edits (dragging a node, editing text) apply and
// simply evaporate on reload — the read-only-demo behaviour. Reads never route
// through here, so nothing is lost by short-circuiting.

export function copyDocument(from: string, to: string): Promise<DocumentOpResult> {
  if (__STATIC__) return Promise.resolve({ ok: true, path: to });
  return postJson('/api/document/copy', { from, to });
}

export function moveDocument(from: string, to: string): Promise<DocumentOpResult> {
  if (__STATIC__) return Promise.resolve({ ok: true, path: to });
  return postJson('/api/document/move', { from, to });
}

export function deleteDocument(path: string): Promise<DocumentOpResult> {
  if (__STATIC__) return Promise.resolve({ ok: true, path });
  return postJson('/api/document/delete', { path });
}

export function writeDocument(path: string, content: unknown): Promise<DocumentOpResult> {
  if (__STATIC__) return Promise.resolve({ ok: true, path });
  return postJson('/api/document/write', { path, content });
}
