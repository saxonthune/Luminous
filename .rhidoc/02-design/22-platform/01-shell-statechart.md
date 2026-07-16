---
title: Platform shell statechart
summary: Statechart of the platform shell — which app is mounted, and which theme the UI wears. Two orthogonal regions, one global keymap, an ?app= projection. Each app's own surface is a black box.
tags: [ui, statechart, platform, shell, theme]
deps: [doc01.04, doc02.12]
---

# Platform shell statechart

## Intent

The platform shell is the outer layer that decides *which app the user is looking at* and *which theme they are looking at it in*. It decides nothing else. Each app — Canvas (doc01.08), Dataflow (doc01.05), Atlas (doc01.07) — is a black box the shell mounts.

The shell is deliberately thin. It holds no document, no picker, no graph: an app's state is that app's own. The whole contract between the shell and an app is the registry entry `{ id, label, component }`, and an app receives no props.

The authoritative artifact is the sidecar `01-shell.statechart.json`. The prose here exists to explain it. When the two disagree, the JSON wins; the prose is wrong.

## Boundary

| In scope (modeled here) | Out of scope (app concern) |
|---|---|
| Which app is mounted | Listing or selecting documents |
| The `?app=` projection | Loading a document |
| Theme (light / dusk / ground) | Error recovery within an app |
| Global keymap (F2 = cycle theme) | Anything inside an app's surface |

An app mounts inside `appMounted`. The shell does not know what the app is doing, and the app does not know the shell exists.

## Regions

The chart is a top-level **parallel** machine with two orthogonal regions:

- **`app`** — which app the user is looking at.
- **`theme`** — which palette the UI wears.

The regions are independent: `CYCLE_THEME` is legal whichever app is mounted. This is the formal expression of *"change theme anywhere."*

## App region

```
appMounted
  └── SELECT_APP(id)  → appMounted  (self-transition; sets activeAppId, writes ?app=)
```

A single state with a self-transition. There is no boot state and no error state: the registry is a compile-time constant, so an app is always mountable and the shell cannot fail to find one. An unknown id from `?app=` falls back to the first registered app rather than erroring.

### Invariants

- **SHELL-INV-1** — `activeAppId` always names a registered app. An unrecognized `?app=` resolves to the first entry in the registry.
- **SHELL-INV-2** — The `?app=` query parameter is a *projection* of `activeAppId`, not an input. Events drive transitions; the URL is updated as a side effect.
- **SHELL-INV-3** — The shell holds no app's state. Switching apps and switching back gives the app whatever state it rebuilds for itself.

### URL projection

| Region state | URL |
|---|---|
| `appMounted` | `?app=<id>` |

On initial load, `?app=<id>` selects that app when the id is registered, and the first registered app otherwise.

## Theme region

```
light → dusk → ground → light   (CYCLE_THEME, wraps)
```

A flat ring of three states. `CYCLE_THEME` is dispatched by the visible theme toggle in the app header, and by the global key binding **F2**. Both dispatch the same event: there is exactly one way to change the theme and exactly two ways to trigger it.

Theme persists to `localStorage` as a side effect of entering each state; at boot the initial state is read back from `localStorage`, defaulting to `light`.

## Global keymap

| Key | Event | Region | Notes |
|---|---|---|---|
| `F2` | `CYCLE_THEME` | theme | Active whichever app is mounted. |

The keymap is intentionally tiny. A key belongs here only when it means the same thing in every app; anything app-specific belongs to that app.

## Event catalog

| Event | Source | Payload | Target region |
|---|---|---|---|
| `SELECT_APP` | AppHeader app switcher, or URL `?app=` on boot | `{id}` | app |
| `CYCLE_THEME` | AppHeader theme button, F2 keybinding | — | theme |

## Context

| Field | Type | Mutation rate |
|---|---|---|
| `activeAppId` | `string` | On SELECT_APP |
| `theme` | `"light" \| "dusk" \| "ground"` | On CYCLE_THEME |

Two fields is the whole of the shell's state.

## What the sidecar adds

`01-shell.statechart.json` is XState v5-shaped and tool-agnostic (carries `"_placeholder": true` until the toolchain binds a runtime). It is the source of truth for state names, event names, transitions, and the `meta` fields on each state. The TypeScript implementation in `AppShell.tsx` is a transliteration of this JSON.

## Why this doc exists

The shell and the apps have different reasons to change: the shell changes when the platform gains an app or a global affordance, and an app changes when its own surface does. This document draws that line and gives it a name, so a change to one does not drift into the other. The Canvas app's own statechart is doc02.12.
