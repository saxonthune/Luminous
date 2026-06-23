# Static-site publish: serverless bundled graph+pack demo

## Motivation

The GitHub Pages deploy is a non-functional shell: the client boots via `fetchServerSources()` →
`GET /api/documents` and per-doc `GET /api/document/{path}`, plus pack resolution via
`siblingPackUrl` → `GET /api/pack/...` — none of which exist on a static host, so every canvas
load 404s. Everything else is already serverless-ready: graph/pack construction is pure
(`loadGraphFromText`, `parsePackJson`, `registerPack`), node drags are transient client state
(`nodeOverrides` in `PgCanvasView.tsx:264`, reset on reload), and view switching is pure client
(`CanvasHost`). There is no Yjs / sync layer to deal with.

This task adds a static `CanvasSource` provider + static-aware pack resolution, gated by the
existing `__GITHUB_PAGES__` build flag, so a bundled set of demo canvases renders fully client-side:
a picker lists all bundled canvases AND `?src=<id>` deep-links into one. Edits don't persist (reset
on reload) — exactly the demo behavior wanted.

## Do NOT

- Do NOT add any persistence, save, or write-back of node positions / edits. Moves stay transient
  (existing `nodeOverrides` behavior). The whole point is non-persistent demo state.
- Do NOT introduce Yjs / a sync provider / a CRDT. None exists; none is needed.
- Do NOT remove or break the server (`fetchServerSources`) path — branch on the build flag so dev
  (with `@luminous/server`) keeps working unchanged. The static path is additive.
- Do NOT hardcode a single canvas / bypass the picker. Use a manifest so multiple canvases + the
  existing `DocumentPicker` + `?src=` deep links all work.
- Do NOT hardcode `/Luminous/`. Use `import.meta.env.BASE_URL` for all static asset paths so dev
  (`/`) and Pages (`/Luminous/`) both resolve correctly.
- Do NOT touch CLAUDE.md (the Yjs references were already fixed in a separate change).

## Plan

### 1. Static asset location — `packages/client-next/public/canvases/`

Vite serves `public/` at the base path and copies it into `dist/` on build, so bundled demo data
needs no CI copy hack. Create `packages/client-next/public/canvases/` containing:
- `index.json` — the manifest (see shape below).
- At least one working demo: copy the committed fixture `.canvases/sample-primitives.graph.json`
  here as `sample-primitives.graph.json`. It declares `"pack": "primitives"`, which resolves to the
  shipped builtin (`siblingLoader.ts:64`) — so it needs NO pack file and renders immediately,
  guaranteeing the static build is functional even without the pipeline.

Manifest shape (array mirrors the `CanvasSource` fields that `DocumentPicker` consumes):
```json
{
  "canvases": [
    { "path": "sample-primitives.graph.json", "name": "Sample Primitives", "root": "demos" }
  ]
}
```

### 2. Static source provider — `packages/client-next/src/sources/staticSources.ts` (new)

Mirror `serverSources.ts`. Export `fetchStaticSources(): Promise<CanvasSource[]>` that:
- fetches `${import.meta.env.BASE_URL}canvases/index.json`,
- maps each manifest entry to a `CanvasSource` whose `id` is the entry `path`, `label` is `name`,
  `root` is `root`, and `load: () => fetch(`${import.meta.env.BASE_URL}canvases/${path}`).then(r => r.text())`.
Re-export it from `packages/client-next/src/sources/index.ts` (alongside the existing
`fetchServerSources` export).

### 3. Branch boot on the build flag — `packages/client-next/src/AppShell.tsx`

In `boot()` (line 98), choose the provider:
`const fetchSources = __GITHUB_PAGES__ ? fetchStaticSources : fetchServerSources;`
and call `fetchSources()` instead of `fetchServerSources()` directly. Import `fetchStaticSources`
from `./sources`. Everything downstream (`DocumentPicker`, `?src=` deep-link at lines 104-108,
`loadGraph`) is provider-agnostic and unchanged.

### 4. Static-aware pack resolution — `packages/client-next/src/pack/siblingLoader.ts`

`siblingPackUrl` (line 12) hardcodes `/api/pack/...`. Make it resolve to a static asset URL when
`__GITHUB_PAGES__` is set:
- static: `${import.meta.env.BASE_URL}canvases/${dir}${packName}.pack.json`
  (the pack ships co-located with its graph under `public/canvases/`),
- server: the existing `/api/pack/${encodeURIComponent(siblingPath)}`.
The builtin fallback (`siblingLoader.ts:64`) already covers `primitives` with no file, so the
sample demo works without a pack file; custom-pack demos just drop their `<pack>.pack.json` next to
the graph in `public/canvases/`.

### 5. Declare the build-flag global — `packages/client-next/src/env.d.ts` (new)

`vite.config.ts:23` defines `__GITHUB_PAGES__` but there is no TS declaration (no `env.d.ts`
exists). Add one:
```ts
/// <reference types="vite/client" />
declare const __GITHUB_PAGES__: boolean;
```
(Include `__APP_VERSION__` / `__GIT_COMMIT__` declarations too if tsgo flags them as undeclared —
they're defined in the same `define` block.)

### 6. Fix the deploy workflow — `.github/workflows/release-web.yml`

The current step copies one canvas into `dist/canvases/` (line ~31) that the app never reads —
remove that. Demo data now lives in `public/canvases/` and is bundled by `vite build`
automatically. Update the workflow so that, after `pnpm generate:canvas`, the generated
`solidjs-analysis` graph **and its pack** are copied into `packages/client-next/public/canvases/`
and added to `public/canvases/index.json` BEFORE the build runs (so they're bundled). Keep
`GITHUB_PAGES=true` for the build. If wiring the generated canvas in is non-trivial, at minimum
ensure the committed `sample-primitives` demo ships, and leave a clear `# TODO` for adding the
generated canvas — do not silently drop it.

### 7. Tests — `packages/client-next/tests/staticSources.test.ts` (new)

- Mock `fetch` to return a manifest; assert `fetchStaticSources()` returns `CanvasSource[]` with the
  right `id`/`label`/`root`, and that `load()` fetches `${BASE_URL}canvases/<path>` and returns text.
- Add a `siblingPackUrl` test asserting the static branch produces a `${BASE_URL}canvases/...` URL
  and the server branch produces `/api/pack/...` (drive the branch by the flag — if `__GITHUB_PAGES__`
  isn't easily togglable in a unit test, factor the URL builder to take a `static: boolean` param and
  test that).

## Files to Modify

- `packages/client-next/public/canvases/index.json` — new manifest
- `packages/client-next/public/canvases/sample-primitives.graph.json` — copied committed fixture
- `packages/client-next/src/sources/staticSources.ts` — new `fetchStaticSources`
- `packages/client-next/src/sources/index.ts` — export it
- `packages/client-next/src/AppShell.tsx` — branch `boot()` on `__GITHUB_PAGES__`
- `packages/client-next/src/pack/siblingLoader.ts` — static-aware `siblingPackUrl`
- `packages/client-next/src/env.d.ts` — declare `__GITHUB_PAGES__` (+ siblings if needed)
- `.github/workflows/release-web.yml` — bundle demo data via public/, drop the dead copy step
- `packages/client-next/tests/staticSources.test.ts` — new tests

## Verification

```bash
pnpm --filter @luminous/canvas test
pnpm --filter @luminous/canvas typecheck
GITHUB_PAGES=true pnpm --filter @luminous/canvas build
```

(The build must succeed with the flag set and copy `public/canvases/` into `dist/canvases/`. The
actual Pages deploy is verified on push, out of scope for the local gate.)

## Out of Scope

- Persisting edits / any write-back (resets-on-reload is the intended behavior).
- A runtime server-vs-static auto-detect fallback (gating on `__GITHUB_PAGES__` is enough for the
  demo; a "try /api, fall back to static" probe can come later).
- Authoring new demo canvases or the pipeline that generates `solidjs-analysis` (wire in what
  exists; don't build new content).
- CLAUDE.md edits (already done).

## Notes

- `import.meta.env.BASE_URL` is the load-bearing detail: Vite sets it from `base` (`/` dev,
  `/Luminous/` Pages), so all static fetches must prefix it — never a leading `/`.
- The committed `sample-primitives` fixture is the safety net: primitives→builtin pack means the
  static site renders even if the generated canvas/pack wiring isn't finished.
- `.gitignore` ignores `.canvases/*.canvas.json` but `packages/client-next/public/canvases/` is a
  different path and is NOT ignored — the demo data there is committed/bundled normally.
- Companion context: node moves are already transient (`PgCanvasView.tsx:264`); no change needed for
  the "doesn't persist" requirement.
