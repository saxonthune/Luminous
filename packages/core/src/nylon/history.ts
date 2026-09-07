import { actionLabel, executeNylonAction, type NylonAction } from './actions.ts';
import { parseNylonDocument } from './document.ts';
import type { NylonDocument } from './types.ts';
export const NYLON_HISTORY_LIMIT = 50;

export interface NylonActionRequest {
  actionId: string;
  baseRevision: string;
  origin: 'ui' | 'cli' | 'api';
  action: NylonAction;
  dryRun?: boolean;
}
export interface NylonHistoryEntry { actionId: string; label: string; origin: string; document: NylonDocument }
interface Change extends Omit<NylonHistoryEntry, 'document'> { before: NylonDocument; after: NylonDocument }
export interface NylonSnapshot {
  document: NylonDocument;
  revision: string;
  undo: NylonHistoryEntry[];
  redo: NylonHistoryEntry[];
}
export type NylonActionResponse =
  | { ok: true; snapshot: NylonSnapshot; changed: boolean; replayed?: boolean }
  | { ok: false; error: string; conflict?: boolean };

export interface NylonStorage {
  read(): Promise<string>;
  /** Reject if storage no longer equals expected. Publish a whole file atomically. */
  write(text: string, expected: string): Promise<void>;
}

/** One serialized, bounded history shared by all callers of one Document. */
export class NylonHistory {
  private revision = crypto.randomUUID();
  private text: string | undefined;
  private document!: NylonDocument;
  private past: Change[] = [];
  private future: Change[] = [];
  private completed = new Map<string, { request: string; changed: boolean }>();
  private queue: Promise<unknown> = Promise.resolve();
  private storage: NylonStorage;
  private limit: number;

  constructor(storage: NylonStorage, limit = NYLON_HISTORY_LIMIT) { this.storage = storage; this.limit = limit; }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async refresh(): Promise<void> {
    const text = await this.storage.read();
    if (text === this.text) return;
    // Even an invalid external edit must invalidate the previous undo chain.
    this.past = [];
    this.future = [];
    this.revision = crypto.randomUUID();
    const parsed = parseNylonDocument(text);
    if (!parsed.ok) throw new Error(parsed.issues.join('; '));
    this.document = parsed.doc;
    this.text = text;
  }

  private snapshot(): NylonSnapshot {
    const summarize = (change: Change, document: NylonDocument): NylonHistoryEntry => ({
      actionId: change.actionId, label: change.label, origin: change.origin, document,
    });
    return structuredClone({ document: this.document, revision: this.revision,
      undo: this.past.map((change) => summarize(change, change.before)),
      redo: this.future.map((change) => summarize(change, change.after)) });
  }

  read(): Promise<NylonSnapshot> {
    return this.serial(async () => { await this.refresh(); return this.snapshot(); });
  }

  dispatch(request: NylonActionRequest): Promise<NylonActionResponse> {
    // Capture input now, before queued work runs or the caller mutates it.
    const encoded = JSON.stringify(request);
    return this.serial(async () => {
      try {
        const input = JSON.parse(encoded) as NylonActionRequest;
        if (!input || typeof input.actionId !== 'string' || !input.actionId
          || typeof input.baseRevision !== 'string' || !input.baseRevision
          || !['ui', 'cli', 'api'].includes(input.origin)
          || !input.action || typeof input.action.op !== 'string'
          || (input.dryRun !== undefined && typeof input.dryRun !== 'boolean')) {
          return { ok: false, error: 'Invalid action request' };
        }
        await this.refresh();
        const previous = this.completed.get(input.actionId);
        if (previous) {
          if (previous.request !== encoded) return { ok: false, error: 'Action ID was already used for a different request' };
          // Return current state, never an old document after subsequent changes.
          return { ok: true, changed: previous.changed, snapshot: this.snapshot(), replayed: true };
        }
        if (input.baseRevision !== this.revision) {
          return { ok: false, conflict: true, error: 'Document changed. Refresh before retrying the action.' };
        }
        const action = input.action;
        const undoing = action.op === 'undo';
        const redoing = action.op === 'redo';
        const entry = undoing ? this.past.at(-1) : redoing ? this.future.at(-1) : undefined;
        if ((undoing || redoing) && !entry) return { ok: false, error: `Nothing to ${action.op}` };
        const result = entry
          ? { ok: true as const, doc: undoing ? entry.before : entry.after }
          : executeNylonAction(this.document, action);
        if (!result.ok) return result;
        const changed = JSON.stringify(result.doc) !== JSON.stringify(this.document);
        if (input.dryRun) return { ok: true, snapshot: { ...this.snapshot(), document: result.doc }, changed };
        // A replacement can materialize an empty new file without creating an
        // undo step for an unchanged Document.
        if (!changed && action.op === 'document.replace') await this.storage.write(this.text!, this.text!);
        if (changed) {
          const nextText = JSON.stringify(result.doc, null, 2) + '\n';
          await this.storage.write(nextText, this.text!);
          if (undoing) { this.future.push(this.past.pop()!); }
          else if (redoing) { this.past.push(this.future.pop()!); }
          else {
            this.past.push({ actionId: input.actionId, label: actionLabel(action), origin: input.origin,
              before: this.document, after: result.doc });
            if (this.past.length > this.limit) this.past.shift();
            this.future = [];
          }
          this.document = result.doc;
          this.text = nextText;
          this.revision = crypto.randomUUID();
        }
        const response: NylonActionResponse = { ok: true, snapshot: this.snapshot(), changed };
        this.completed.set(input.actionId, { request: encoded, changed });
        // IDs are bounded too. An evicted changed action still has a stale base revision.
        if (this.completed.size > this.limit * 4) this.completed.delete(this.completed.keys().next().value!);
        return response;
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  }
}

export function memoryNylonHistory(document: NylonDocument): NylonHistory {
  let text = JSON.stringify(document);
  return new NylonHistory({
    read: async () => text,
    write: async (next, expected) => {
      if (text !== expected) throw new Error('Document changed');
      text = next;
    },
  });
}
