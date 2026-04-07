---
skill: solidjs
description: |
  Solid.js framework reference: mental models, API, patterns, antipatterns, and React migration guidance.
  Use when writing, reviewing, or migrating to Solid.js code. Triggers on tasks involving Solid components,
  signals, stores, effects, or React-to-Solid migration.
version: 1.0
author: Claude
tags: [solid, solidjs, reactivity, signals, ui, framework, migration]
---

# Solid.js Reference

Comprehensive reference for building with Solid.js. When this skill triggers, use the relevant sections to guide code generation, reviews, and migration work.

## Routing Table

| File | Topic | When to use |
|------|-------|-------------|
| [01-mental-model.md](01-mental-model.md) | Core mental model, how reactivity works, how compilation works, React comparison | Understanding Solid's paradigm, explaining concepts, making architecture decisions |
| [02-api-reference.md](02-api-reference.md) | All primitives, components, lifecycle, rendering — full type signatures and examples | Writing Solid code, looking up API details, checking parameter types |
| [03-patterns-antipatterns.md](03-patterns-antipatterns.md) | Props handling, control flow, stores, events, testing, common mistakes | Reviewing code, avoiding bugs, migration from React |

## How to Use

1. **Writing new Solid code** -> Read mental model + API reference for the primitives needed.
2. **Migrating from React** -> Read mental model (especially the comparison table) + patterns/antipatterns (especially the migration section).
3. **Reviewing Solid code** -> Read patterns/antipatterns to catch common mistakes (destructured props, side effects in memos, wrong list component).
4. **Debugging** -> Check the antipatterns section for the specific symptom (stale values, no updates, infinite loops).
