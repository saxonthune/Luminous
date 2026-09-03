export const MERINO_CURRENT_VERSION = 3;

type RawDocument = Record<string, unknown>;

/** v1 gave a Node Type a boolean `container`; v2 replaces it with the
 * three-way `layout` (`container` | `list` | absent). A v1 `container: true`
 * becomes `layout: 'container'`; anything else drops the field. */
function migrateV1toV2(raw: RawDocument): RawDocument {
  const nodeTypes = Array.isArray(raw['nodeTypes'])
    ? (raw['nodeTypes'] as unknown[]).map((t) => {
        if (t === null || typeof t !== 'object') return t;
        const { container, ...rest } = t as Record<string, unknown>;
        return container === true ? { ...rest, layout: 'container' } : rest;
      })
    : raw['nodeTypes'];
  return { ...raw, nodeTypes, v: 2 };
}

/** Version-keyed migrations: MIGRATIONS[n] rewrites a v:n raw document to
 * v:n+1. */
const MIGRATIONS: Record<number, (raw: RawDocument) => RawDocument> = {
  1: migrateV1toV2,
  2: (raw) => ({ ...raw, v: 3 }),
};

export function migrateMerinoDocument(raw: RawDocument): RawDocument {
  let current = raw;
  while (typeof current['v'] === 'number' && current['v'] < MERINO_CURRENT_VERSION) {
    const step = MIGRATIONS[current['v']];
    if (step === undefined) break;
    current = step(current);
  }
  return current;
}
