# Generate the pipeline skill's primitive reference from a typed source of truth

## Motivation

`.claude/skills/luminous-pipeline/primitives-reference.md` is hand-written and drifts
from the real primitive vocabulary. The only machine-readable source today is
`packages/core/src/render/primitive-names.ts` (`BUILTIN_PRIMITIVE_NAMES`, 14 names) —
prop schemas, enums, descriptions, and examples live as prose in the reference and as
imperative code in the `.tsx` primitive components. This task makes the vocabulary
**declarative** in core, generates the reference from it, and guards against drift in CI.

Source of truth becomes a typed descriptor catalog in `@luminous/core`. The generated
`primitives-reference.md` keeps full parity with today's content (SKILL.md routing
unchanged). A core test asserts descriptor coverage matches `BUILTIN_PRIMITIVE_NAMES`,
and CI fails if the committed reference is stale.

## Do NOT

- **Do NOT import the descriptors through the `@luminous/core` main barrel in the generator.**
  `src/index.ts` → `src/render/index.ts` → `import './builtins.ts'` pulls in Solid.js JSX
  primitive components, which must not load in a headless `tsx` script. Add a **dedicated
  subpath export** and import only that. Keep `primitive-descriptors.ts` plain data with
  **no solid-js imports** (mirror the "safe to import headless" contract in `primitive-names.ts`).
- **Do NOT hand-edit `primitives-reference.md` after wiring the generator.** It becomes a
  generated artifact. Put a header banner saying so.
- **Do NOT change runtime behavior** — no edits to the interpreter, registry, or the
  `.tsx` primitive components. This task only adds a descriptor catalog + generator + guard.
- **Do NOT touch `pack.schema.json` / `graph.schema.json`** in the skill — out of scope.
  This task is the primitive *vocabulary* reference only.
- **Do NOT drop or thin any content** — the generated MD must reach full parity with the
  current `primitives-reference.md` (atoms, layout, control-flow, style tokens, events,
  worked example).

## Plan

### 1. Add the typed descriptor catalog in core

Create `packages/core/src/render/primitive-descriptors.ts` — plain data, no solid-js imports.
Export a typed `PRIMITIVE_DESCRIPTORS` array plus its types. Model the shape on the existing
reference content:

```ts
export type PrimitiveCategory = 'atom' | 'layout' | 'control-flow';

export interface PropDescriptor {
  name: string;
  type: string;            // 'string' | 'number' | 'enum' | 'array' | 'primitive' | ...
  values?: string[];       // enum members or notable literals (e.g. ['INSPECT'])
  notes?: string;
}

export interface PrimitiveDescriptor {
  name: string;            // must be one of BUILTIN_PRIMITIVE_NAMES
  category: PrimitiveCategory;
  description: string;
  props: PropDescriptor[];
  example: string;         // a JSON snippet string, as shown in the reference
}

export const PRIMITIVE_DESCRIPTORS: PrimitiveDescriptor[] = [ /* all 14 */ ];
```

Port every primitive currently documented in `.claude/skills/luminous-pipeline/primitives-reference.md`
into a descriptor at full fidelity:
- Atoms: `text`, `badge`, `chip`, `icon`, `divider`, `link`, `markdown`, `code-block`, `image`, `kv-list`
- Layout: `clamp`, `vstack`, `hstack`, `card`
- Control-flow: `if`, `for-each` (and the `bind` note — see step 3 for where prose-only items go)

Order the array so the generated output matches the reference's section order (atoms, then
layout, then control-flow). `bind` is implicit/prose-only and is NOT in `BUILTIN_PRIMITIVE_NAMES`
— keep it as a generator template constant (step 3), not a descriptor.

### 2. Export the catalog without pulling in builtins

In `packages/core/package.json`, add a subpath export:

```json
"./primitive-descriptors": "./src/render/primitive-descriptors.ts"
```

Do not add it to `src/index.ts` (the barrel triggers `builtins.ts`). Tests inside core may
import the file by relative path.

### 3. Write the generator

Create `scripts/gen-primitives-reference.ts` (run via `tsx`, matching `scripts/analyze-solidjs.ts`).
It imports `PRIMITIVE_DESCRIPTORS` from `@luminous/core/primitive-descriptors` and writes
`.claude/skills/luminous-pipeline/primitives-reference.md` deterministically:

- A header banner: `<!-- GENERATED FILE — do not edit by hand. Source: packages/core/src/render/primitive-descriptors.ts. Regenerate with \`just gen-skill-reference\`. -->` followed by the existing title and intro paragraph (keep the `doc02.16` source-of-truth note and the "fixed set of building blocks" framing).
- Per-category sections (`## Atoms`, `## Layout`, `## Control Flow`), each primitive rendered
  as: `### \`name\``, description, the example fenced as ```json, and a prop table
  (`| Prop | Type | Values / Notes |`) when the descriptor has props. Match the existing
  Markdown structure closely enough that the diff against the current file is reviewable.
- The fixed trailing sections as template constants in the generator (they are prose, not
  per-primitive data): the `bind` note, `## Style References`, `## Events`, and the
  `## Worked Example — a complete nodeKind render` block — copy these verbatim from the
  current reference.

Output must be byte-stable across runs (no timestamps, fixed ordering, trailing newline).

### 4. Coverage test in core

Create `packages/core/tests/primitive-descriptors.test.ts` (vitest, matching the existing
test style in `packages/core/tests/`). Assert:
- the set of `PRIMITIVE_DESCRIPTORS[*].name` equals the set of `BUILTIN_PRIMITIVE_NAMES`
  (no missing, no extra) — this is the guard that adding a primitive to core without a
  descriptor fails the build;
- every descriptor `name` is unique;
- every descriptor has a non-empty `description` and `example`.

### 5. Just recipes + CI guard

In `justfile`, add (near the generators section):

```
# regenerate the pipeline skill's primitive reference from core descriptors
gen-skill-reference:
    pnpm exec tsx scripts/gen-primitives-reference.ts

# fail if the committed primitive reference is stale (used in CI)
check-skill-reference: gen-skill-reference
    git diff --exit-code .claude/skills/luminous-pipeline/primitives-reference.md
```

In `.github/workflows/ci.yml`, add a step after `pnpm install --frozen-lockfile` and the
build/test steps:

```yaml
      - run: just check-skill-reference
```

### 6. Regenerate and update the committed reference

Run `just gen-skill-reference` so the committed `primitives-reference.md` IS the generator's
output (with the banner). Verify the only meaningful change vs the prior file is the added
banner and any whitespace normalization — content parity otherwise.

### 7. Note the new source of truth

- Update the top of `.claude/skills/luminous-pipeline/SKILL.md` routing table row for
  `primitives-reference.md` to note it is generated from `primitive-descriptors.ts`.
- In `CLAUDE.md`, under "Pack/graph schema changes", add a line: the primitive vocabulary
  reference is generated — add/modify primitives via `packages/core/src/render/primitive-descriptors.ts`
  and run `just gen-skill-reference`; CI enforces it via `just check-skill-reference`.

## Files to Modify

- `packages/core/src/render/primitive-descriptors.ts` — NEW typed catalog (plain data)
- `packages/core/package.json` — add `./primitive-descriptors` subpath export
- `scripts/gen-primitives-reference.ts` — NEW generator (tsx)
- `packages/core/tests/primitive-descriptors.test.ts` — NEW coverage test
- `justfile` — add `gen-skill-reference` + `check-skill-reference` recipes
- `.github/workflows/ci.yml` — add `just check-skill-reference` step
- `.claude/skills/luminous-pipeline/primitives-reference.md` — regenerated (banner + parity)
- `.claude/skills/luminous-pipeline/SKILL.md` — note the reference is generated
- `CLAUDE.md` — document the descriptor SoT + regeneration workflow

## Verification

```bash
just typecheck-core
just test-core
just gen-skill-reference
git diff --exit-code .claude/skills/luminous-pipeline/primitives-reference.md
just check-skill-reference
```

All five must succeed. `check-skill-reference` regenerates and diffs; a clean exit proves the
committed reference matches the generator output and the descriptors are the single source of truth.

## Out of Scope

- Generating `pack.schema.json` / `graph.schema.json` (a separate future task).
- Making the `.tsx` primitive components consume the descriptors at runtime (the descriptors
  are documentation-truth for now; unifying them with the components is future work).
- Deriving style tokens / events from code (kept as generator template constants here).

## Notes

- The headless-import trap is the main risk: importing through the core barrel will try to
  load Solid JSX and break the `tsx` generator. The dedicated subpath export + plain-data
  descriptor file avoids it. If the generator errors on a solid-js import, the descriptor
  file or import path is wrong.
- Keep the generated Markdown close to the current structure so the reviewer can diff content
  parity at a glance.
- Determinism matters: the CI `git diff --exit-code` guard only works if generation is
  byte-stable.
