---
title: A platform of apps
status: draft
summary: Luminous is a platform of software design tools sharing one canvas engine and one wrapper.
tags: [apps, platform, architecture]
deps: []
---

# A platform of apps

Luminous is a platform of software design tools, not a single canvas app. Each
tool is an app built on the cactus canvas engine. The wrapper — header, tabs,
theme — is shared; each app owns its own menu of files or workspaces.

The first app is Luminous Canvas, the general canvas formerly known simply as
Luminous. Its siblings are the Dataflow Designer (doc01.05), which reads
dataflow documents; Atlas (doc01.07), which holds a whole program on one
canvas; Linen (doc01.09), which draws what happens when a piece of software
runs; and Merino (doc01.10), a general node-and-edge app for designing a
program as event-driven requirements and their deployments. Nylon (doc01.12)
draws an alternating network of data Contracts and the Transformations that
act on them.

Hemp (doc01.13) inspects Rust crates, modules, and their dependencies from a
pipeline-produced source inventory.

Twill (doc01.14) queries source entities, module relationships, and contracts,
then renders query results as progressively disclosed code maps.

Denim (doc01.15) is a graph-based design system for user Journeys,
Capabilities, Resources, and their implementation details.

## Static demo controls

The shared header shows **Reset Demo State** to the right of the theme control
on the static demo site. It discards browser-saved demo databases (including
browser-created projects) and app view state, then reloads to the current app’s
project picker so bundled examples can be opened fresh. The theme preference is
preserved. The control is available across demo apps and is absent in server-backed
mode. Reset failures are shown in the header.

The theme control has a prominent, centered icon and an accessible label naming
the current theme.

Reset Demo State uses the shared primary danger Button treatment: a filled red
background with contrasting text in every theme. Light, Dusk, and Ground each
provide matching red normal and hover colors, with visible keyboard focus and
disabled feedback. Other destructive actions can reuse this treatment.

### Reset confirmation

```yaml rhidoc-feature
prefix: DEMO
name: Reset Demo State
description: >-
  Users can reset the demo state after confirming their choice.
```

- **DEMO1.** [p] Pressing Reset Demo State opens a confirmation component underneath the button before resetting state.
- **DEMO2.** [p] Clicking outside the confirmation component dismisses it.
- **DEMO3.** [p] Pressing Reset Demo State again while its confirmation component is open dismisses the component.
