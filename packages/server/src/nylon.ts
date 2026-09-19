import { NylonHistory, type NylonActionRequest } from '@luminous/core/nylon/history';
import { readNylonText, resolveDocPath, writeNylonText } from './store.js';

// Canonical paths make aliases for the same document share a queue and history.
const sessions = new Map<string, NylonHistory>();
export function nylonSession(path: string): NylonHistory {
  const key = resolveDocPath(path);
  let session = sessions.get(key);
  if (!session) {
    session = new NylonHistory({
      read: () => readNylonText(path),
      write: (text, expected) => writeNylonText(path, text, expected),
    });
    sessions.set(key, session);
  }
  return session;
}

export function dispatchNylon(path: string, request: NylonActionRequest) {
  return nylonSession(path).dispatch(request);
}
