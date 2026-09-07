import type { NylonActionRequest, NylonActionResponse, NylonSnapshot } from '@luminous/core/nylon/history';

export async function readNylonSnapshot(path: string): Promise<NylonSnapshot> {
  const response = await fetch(`/api/nylon/document/${encodeURIComponent(path)}`, { signal: AbortSignal.timeout(10_000) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error ?? 'Failed to read Nylon Document');
  return result.snapshot;
}

/** Only retry transport failures, with the exact same ID, revision and payload. */
export async function sendNylonAction(path: string, request: NylonActionRequest): Promise<NylonActionResponse> {
  const body = JSON.stringify({ path, ...request });
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch('/api/nylon/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(10_000),
      });
      return await response.json();
    } catch (error) {
      if (attempt >= 1) throw error;
    }
  }
}
