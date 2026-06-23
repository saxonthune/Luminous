# Per-canvas info modal: graph `info` markdown + accent (i) button

## Motivation

A canvas should be able to carry a human-readable explanation of itself (what it shows, how to read
the views). Add an optional top-level `info` markdown field to graph v3, and surface it as a blue
(theme-aware accent) (i) button in the app header that opens a modal rendering the markdown. The
`marked` package is already a dependency (`packages/client-next/package.json:26`, `^18`) but is not
yet imported anywhere — this is its first use. The sample-primitives canvas will later use `info` to
narrate its four views.

## Do NOT

- Do NOT add the (i) button when the active graph has no `info` (or it's empty/whitespace). It is
  conditional chrome.
- Do NOT block graph loading on `info` — it is optional. `loadGraphFromText` does manual field checks
  (no strict JSON-schema), so an absent `info` must remain valid; an `info` that is not a string
  should throw a clear error (consistent with the existing `pack` check at `loader.ts:27`).
- Do NOT pull in a new dependency (DOMPurify, etc.). Render with `marked`. See the XSS note below —
  flag it, don't solve it here.
- Do NOT put the modal/markdown into a node render or the pack — this is app chrome (header +
  modal), graph-level, not pack vocabulary.
- Do NOT touch the canvas data files or the primitives pack — those `info` strings get authored in a
  separate change once this ships.

## Plan

### 1. Add `info` to the graph model — `packages/core/src/types.ts`

- Add `info?: string;` to `interface Graph` (line 63, alongside `pack`).
- Add `info?: string;` to `interface GraphFileV3` (line ~322, alongside `defaultView`), with a doc
  comment: "Optional markdown describing this canvas, shown in the info modal."

### 2. Thread it through `buildGraph` — `packages/core/src/graph.ts`

`buildGraph(nodes, edges, pack = '')` (line 13): add a trailing optional param `info?: string` and
set `info` on the returned `Graph` object (find the `return { ... pack }` and add `info`).

### 3. Parse it — `packages/core/src/loader.ts`

In `loadGraphFromText`, after the `pack` check (line 27-29), add:
`if ('info' in file && typeof file.info !== 'string') throw new Error('loadGraphFile: "info" must be a string');`
then pass it to `buildGraph`: `buildGraph(nodes, edges, pack, typeof file.info === 'string' ? file.info : undefined)`.

### 4. New modal component — `packages/client-next/src/InfoModal.tsx`

A screen-space modal (model the overlay/token usage on `InspectorPanel.tsx`):
- Props: `info: string`, `onClose: () => void`.
- Fixed full-screen backdrop (`position: fixed; inset: 0; background: rgba(0,0,0,0.4)`), centered
  card using theme tokens (`bg-surface`, `text-fg`, border tokens), max-width ~640px, scrollable if
  tall.
- Close on: a `×` button, backdrop click (but not card click — stop propagation), and `Escape`
  (window keydown listener, cleaned up `onCleanup`).
- Render markdown: `import { marked } from 'marked';` then set the card body via
  `innerHTML={marked.parse(props.info) as string}` (marked v18 `.parse` is sync for string input).
  Apply a `prose`-ish wrapper class for basic spacing if Tailwind typography is available; otherwise
  minimal inline styles for headings/lists/code are fine.

### 5. Wire the (i) button into the header — `packages/client-next/src/AppHeader.tsx`

- Add prop `info?: string` to `AppHeaderProps`.
- Add a local `const [showInfo, setShowInfo] = createSignal(false);`.
- In the right-side button group (next to the theme button, line 33-39), render — wrapped in
  `<Show when={props.info && props.info.trim()}>` — an (i) button: an `ⓘ`/`i` glyph styled with the
  **accent token** so it is blue and theme-aware (use `text-accent` — the same token the AppShell
  retry button uses via `bg-accent`/`text-on-accent`), `title="About this canvas"`, onClick →
  `setShowInfo(true)`.
- Render `<Show when={showInfo() && props.info}>{<InfoModal info={props.info!} onClose={() => setShowInfo(false)} />}</Show>`.

### 6. Pass the active graph's info — `packages/client-next/src/AppShell.tsx`

Where `<AppHeader .../>` is rendered (line 143), pass `info={graph()?.info}`. (`graph()` is the
active `Graph` signal; it's `null` on the picker screen, so `graph()?.info` is `undefined` there and
the button hides — correct.)

### 7. Schema + skill docs

- `.claude/skills/luminous-pipeline/graph.schema.json` — add an optional top-level `info`:
  `{ "type": "string" }` (keep whatever `additionalProperties` posture the file already has; if it's
  `false`, `info` MUST be added or pipeline-authored canvases with `info` fail validation).
- `.claude/skills/luminous-pipeline/SKILL.md` — document the `info` field in the graph.json section:
  optional top-level markdown string describing the canvas, surfaced as an (i) info modal in the
  viewer. (Per the CLAUDE.md rule that graph/pack schema changes update the skill in the same change.)

### 8. Tests — `packages/core/tests/`

- Extend/added loader test: a graph JSON with `"info": "# Hello"` round-trips so `loadGraphFromText(...).info === '# Hello'`; a graph without `info` yields `info === undefined`; a graph with a non-string `info` throws.

## Files to Modify

- `packages/core/src/types.ts` — `info?` on `Graph` + `GraphFileV3`
- `packages/core/src/graph.ts` — `buildGraph` info param
- `packages/core/src/loader.ts` — parse + validate `info`
- `packages/client-next/src/InfoModal.tsx` — new modal (marked render)
- `packages/client-next/src/AppHeader.tsx` — (i) accent button + modal toggle
- `packages/client-next/src/AppShell.tsx` — pass `graph()?.info`
- `.claude/skills/luminous-pipeline/graph.schema.json` — add `info`
- `.claude/skills/luminous-pipeline/SKILL.md` — document `info`
- `packages/core/tests/` — loader `info` round-trip test

## Verification

```bash
pnpm --filter @luminous/core test
pnpm --filter @luminous/core typecheck
pnpm --filter @luminous/canvas typecheck
```

## Out of Scope

- Authoring `info` content into any canvas (sample-primitives gets its `info` in a later change).
- Markdown sanitization / a markdown render primitive in the pack (see XSS note).
- An in-canvas (per-node) info affordance — this is canvas-level only.

## Notes

- **XSS, flagged not solved:** `marked` does not sanitize, and `info` is author-controlled graph
  data, so `innerHTML` of `marked.parse(info)` can execute embedded HTML/script from an untrusted
  canvas. Acceptable for the current demo/own-canvas use; leave a `// SECURITY:` comment at the
  innerHTML site noting that untrusted canvases need sanitization (future: DOMPurify or a safe
  renderer). Do not add the dep now.
- `marked ^18` exports a named `marked` with `.parse()` returning a string for string input. If tsgo
  complains about a `Promise<string>` overload, use `marked.parse(info, { async: false }) as string`.
- The accent token is theme-aware (light/dark), satisfying the "blue, theme-dependent" requirement —
  don't hardcode a hex blue.
