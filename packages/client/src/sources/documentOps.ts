export type DocumentOpResult = { ok: true; path: string } | { ok: false; error: string };

async function postJson(url: string, body: Record<string, unknown>): Promise<DocumentOpResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function copyDocument(from: string, to: string): Promise<DocumentOpResult> {
  return postJson('/api/document/copy', { from, to });
}

export function moveDocument(from: string, to: string): Promise<DocumentOpResult> {
  return postJson('/api/document/move', { from, to });
}

export function deleteDocument(path: string): Promise<DocumentOpResult> {
  return postJson('/api/document/delete', { path });
}

export function writeDocument(path: string, content: unknown): Promise<DocumentOpResult> {
  return postJson('/api/document/write', { path, content });
}
