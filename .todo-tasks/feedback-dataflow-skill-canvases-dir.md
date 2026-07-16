# luminous-dataflow skill points authors at .canvases/, user convention is .luminous/

## What happened

Authoring a dataflow Document for a consumer repo (braincrawl), I followed
the luminous-dataflow skill's "Viewing the Document" section, which names
`.canvases/` as the conventional location in a consumer repo. The user
corrected me: the convention should be `.luminous/`. The Document ended up
at `.luminous/braincrawl.dataflow.json` only because the user caught it.

## Why it matters

The skill is the authoritative instruction set an agent follows verbatim —
a stale directory convention there means every agent-authored Document
lands in the wrong place until a human notices, and workspace roots
configured for `.luminous/` won't list the file, so the Document silently
doesn't render.

## Direction

Update the luminous-dataflow skill's conventional-location guidance (and
any example config / docs that mention `.canvases/` for consumer repos) to
`.luminous/`. If the Luminous repo's own canvases dir is intentionally
different, say so explicitly in the skill so the two aren't conflated.
