export const LINEN_CURRENT_VERSION = 1;

type RawDocument = Record<string, unknown>;

/** Version-keyed migrations: MIGRATIONS[n] rewrites a v:n raw document to
 * v:n+1. Empty until a schema change ships — renames land here so a Trace
 * Node type rename stays a table edit plus one entry (epic decision 3). */
const MIGRATIONS: Record<number, (raw: RawDocument) => RawDocument> = {};

export function migrateLinenDocument(raw: RawDocument): RawDocument {
  let current = raw;
  while (typeof current['v'] === 'number' && current['v'] < LINEN_CURRENT_VERSION) {
    const step = MIGRATIONS[current['v']];
    if (step === undefined) break;
    current = step(current);
  }
  return current;
}
