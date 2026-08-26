export const MERINO_CURRENT_VERSION = 1;

type RawDocument = Record<string, unknown>;

/** Version-keyed migrations: MIGRATIONS[n] rewrites a v:n raw document to
 * v:n+1. Empty until a schema change ships. */
const MIGRATIONS: Record<number, (raw: RawDocument) => RawDocument> = {};

export function migrateMerinoDocument(raw: RawDocument): RawDocument {
  let current = raw;
  while (typeof current['v'] === 'number' && current['v'] < MERINO_CURRENT_VERSION) {
    const step = MIGRATIONS[current['v']];
    if (step === undefined) break;
    current = step(current);
  }
  return current;
}
