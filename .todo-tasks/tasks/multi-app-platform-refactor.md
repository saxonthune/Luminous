# Multi-app platform refactor

## Motivation

Luminous should be a platform of software design tools, not a single canvas app.
Multiple apps (Luminous Canvas today; Dataflow Designer and a CLI grammar workbench
later) sit side by side behind one wrapper, each an independent consumer of cactus.
Architecture: Luminous wrapper → app of choice → cactus. The header gets tabs that
switch between apps; each app owns its own menu of files/workspaces.

Today `AppShell.tsx` fuses three jobs: shell chrome, picker orchestration, and graph
loading. This task splits it: the shell keeps the header, tabs, and active-app
selection; everything else becomes the first app, "Luminous Canvas".

This is phase 2 of a chain. Phase 1 (`rename-packages-drop-next`) renamed the
directories — all paths below use `packages/client/` (formerly `client-next`). Triage
was done against phase 1's declared Surface.

## Do NOT

- Do NOT move `DocumentPicker.tsx`, `CanvasHost.tsx`, `PgCanvasView.tsx`, `sources/`,
  or other existing modules to new locations. Only the new files listed below are
  created; `CanvasApp.tsx` imports the existing modules where they are. Consolidating
  file layout under `apps/canvas/` waits until a second app exists.
- Do NOT add `@solidjs/router` or any router dependency. URL state stays hand-rolled
  query params.
- Do NOT build a plugin/registration system beyond a static array of app entries.
- Do NOT touch `packages/server` — no server changes.
- Do NOT rewrite the design docs `doc02.12` (app-shell statechart) and `doc02.13`
  (app-shell component tree) — they go stale with this change; updating them is a
  follow-up.
- Do NOT hand-edit `.carta/MANIFEST.md` — use `carta create` / `carta regenerate`.

## Plan

### 1. URL state helper — `packages/client/src/urlState.ts` (new)

Two functions over `window.location.search` + `history.replaceState`:
- `readParam(name: string): string | null`
- `writeParam(name: string, value: string | null)` — sets or deletes one param while
  **preserving all others** (the current `writeUrlSrc` in `AppShell.tsx:38-41` clears
  the whole search string; that behavior would drop `?app=`).

Unit test in `packages/client/src/__tests__/urlState.test.ts` (vitest, jsdom —
follow the conventions of the existing tests in that directory).

### 2. App registry — `packages/client/src/apps/registry.ts` (new)

```ts
interface LuminousApp {
  id: string;      // URL value and tab key, e.g. 'canvas'
  label: string;   // tab text, e.g. 'Canvas'
  component: Component;
}
export const APPS: LuminousApp[] = [{ id: 'canvas', label: 'Canvas', component: CanvasApp }];
```

### 3. Extract the Canvas app — `packages/client/src/apps/canvas/CanvasApp.tsx` (new)

Move out of `AppShell.tsx` (see `packages/client/src/AppShell.tsx` for the current
code): the `ShellState` machine (rename to `CanvasAppState`, same five variants —
booting/picker/loadingDoc/canvasMounted/fatalError), the `sources`/`sourceId`/`graph`
signals, `boot`/`loadGraph`/`handleGraphFailed`/`onSelect`/`onBack`/`onRetry`, the
`?src=` read at mount (via `urlState.readParam`) and writes (via `writeParam` — must
preserve `?app=`), the toast state + `ToastTray`, the `document.title` effect, and the
`Switch` rendering `DocumentPicker` / `CanvasHost` / error panel.

Header content the Canvas app owns (back button, `· <source label>` breadcrumb, ⓘ
info button + `InfoModal`) moves here too, rendered into the shell header via Solid
`<Portal>` (see step 5).

### 4. Slim the shell — `packages/client/src/AppShell.tsx`

Keeps only: the `?app=` param (read via `readParam`, default `'canvas'`, written on
tab click), the active-app lookup in `APPS`, the theme effect + F2 handler, the
default `document.title = 'Luminous'`, and the layout frame rendering `<AppHeader>`
plus the active app's `component`. No async boot, no Switch, no toasts.

A plain `?src=...` URL with no `app` param must keep working (app defaults to
canvas; CanvasApp reads `src` as today).

### 5. Header with tabs and app slots — `packages/client/src/AppHeader.tsx`

- Left cluster: the "Luminous" wordmark, then one tab button per `APPS` entry
  (active tab visually distinct — follow the existing Tailwind token classes like
  `text-fg` / `text-fg-muted` / `bg-surface-alt`), then an empty app slot:
  `<span id="app-header-left" class="flex items-center gap-3" />`.
- Right cluster: an empty `<span id="app-header-right" class="flex items-center gap-1" />`
  before the theme button.
- Props change: drop `sourceLabel`/`showBack`/`onBack`/`info`; add
  `apps`, `activeAppId`, `onSelectApp`. `InfoModal` usage moves to CanvasApp.
- `CanvasApp` fills the slots with `<Portal mount={document.getElementById('app-header-left')!}>`
  (back button + breadcrumb) and the right slot (ⓘ button). The header renders before
  the app component, so the mount targets exist.
- Note: the back button moves from left of the wordmark to right of the tabs — an
  accepted visual change.

### 6. Product doc in `.carta/01-vision/`

```
carta create 01-vision platform-of-apps --title "A platform of apps"
```

then write brief plain-English content (a few short paragraphs, no invented doctrine):
Luminous is a platform of software design tools. Each tool is an app built on the
cactus canvas engine; the wrapper supplies the header, tabs, and theme, and each app
owns its own menu of files or workspaces. The first app is Luminous Canvas — the
general canvas formerly known simply as Luminous. Planned siblings: a Dataflow
Designer and a CLI grammar workbench.

### 7. CLAUDE.md

In the Project Structure section, note that `packages/client` is the platform wrapper
hosting apps under `src/apps/`, with Luminous Canvas as the first app. One or two
lines; don't restructure the file.

## Files to Modify

- `packages/client/src/urlState.ts` — new; param read/write preserving others
- `packages/client/src/__tests__/urlState.test.ts` — new; unit tests
- `packages/client/src/apps/registry.ts` — new; `LuminousApp` + `APPS`
- `packages/client/src/apps/canvas/CanvasApp.tsx` — new; extracted app
- `packages/client/src/AppShell.tsx` — slimmed to shell duties
- `packages/client/src/AppHeader.tsx` — tabs + slots, prop change
- `.carta/01-vision/04-platform-of-apps.md` — new via `carta create`
- `CLAUDE.md` — one-line structure note

## Verification

```bash
just typecheck
just test
just build
just test-e2e
```

## Out of Scope

- Any second app (Dataflow Designer is its own task, `dataflow-designer-app`).
- Moving existing canvas modules under `apps/canvas/` — wait for the second app.
- Updating design docs doc02.12 / doc02.13 — follow-up task.
- Router adoption.

## Notes

- The e2e smoke test (`packages/client/e2e/smoke.spec.ts`) drives the picker flow:
  picker heading visible → click `sample-primitives` → chrome renders. It must pass
  unchanged — the canvas app is the default tab, so the flow is identical. If the
  heading moved, fix the app, not the test.
- Reviewer watch-items: `writeParam` preserving `?app=` when CanvasApp clears `src`
  on back; Portal mount timing (header before app); F2 theme cycling still global.

## Surface after this phase

- `packages/client/src/apps/registry.ts` exports `LuminousApp` and `APPS`.
- `packages/client/src/apps/canvas/CanvasApp.tsx` exports `CanvasApp`, the full
  former single-app behavior.
- `packages/client/src/urlState.ts` exports `readParam` / `writeParam`.
- `AppShell` mounts the active app from `?app=` (default `canvas`); `AppHeader` shows
  tabs and two portal slots (`app-header-left`, `app-header-right`) an app may fill.
- Adding an app = one entry in `APPS` plus a component; the shell needs no other change.
- Unchanged and still relied on: `DocumentPicker.tsx`, `CanvasHost.tsx`,
  `PgCanvasView.tsx`, `sources/` at their current paths; all server endpoints; the
  e2e smoke flow.
