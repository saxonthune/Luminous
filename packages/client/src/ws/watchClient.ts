const RECONNECT_DELAY_MS = 1000;

interface ChangedMessage {
  event: 'changed';
  path: string;
}

function parseChangedMessage(data: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const msg = parsed as Partial<ChangedMessage>;
  if (msg.event !== 'changed' || typeof msg.path !== 'string') return null;
  return msg.path;
}

/**
 * Subscribes to `/ws/watch` and calls `onChange(path)` whenever the server
 * reports a document changed. Reconnects on close; never opens a socket in
 * static mode, where there is no server to watch.
 */
export function watchDocuments(onChange: (path: string) => void): () => void {
  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function connect() {
    if (disposed || __STATIC__) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws/watch`);
    socket.addEventListener('message', (event) => {
      const path = parseChangedMessage(event.data);
      if (path !== null) onChange(path);
    });
    socket.addEventListener('close', () => {
      socket = null;
      if (!disposed) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    });
  }

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    socket?.close();
  };
}

export { parseChangedMessage };
