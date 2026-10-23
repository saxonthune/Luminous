# Portable sample inputs

Keep reusable input files here, not only in `/tmp`. These are manually inspectable
fixtures for development; adding a fixture does not run an automated test.

| Input | Coverage |
|---|---|
| `plain-markdown.md` | No Mermaid: prose, lists, tables, quotes and ordinary code |
| `conversion-walkthrough.md` | Invocation-first execution flow, browser startup, and a separately marked Recipe proposal |
| `modules.md` | A small canvas with surrounding Markdown |
| `recipe-pipeline.md` | Multiple independent canvases and commentary |
| `recipe-pipeline.theme.json` | Class palettes for the Recipe notebook |
| `local/braincrawl-containment.md` | Private large nested graph retained locally, if available |

Public examples are version-controlled. `local/` holds private/ad-hoc inputs and
is gitignored; keep their themes and notes alongside them. `generated/` is also
gitignored and holds reproducible output. Private inputs are not available in a
fresh clone unless copied separately.

From the repository root:

```sh
just portable --input packages/portable/examples/plain-markdown.md --output packages/portable/examples/generated/plain-markdown.html --force
just portable --input packages/portable/examples/modules.md --output packages/portable/examples/generated/modules.html --force
just portable --input packages/portable/examples/recipe-pipeline.md --theme packages/portable/examples/recipe-pipeline.theme.json --output packages/portable/examples/generated/recipe-pipeline.html --force
```

For each new experiment, save its Markdown source and supporting files before
rendering it. Keep using the same output path while iterating so browser tabs can
be refreshed.

```sh
just portable --input packages/portable/examples/conversion-walkthrough.md --theme packages/portable/examples/conversion-walkthrough.theme.json --output packages/portable/examples/generated/conversion-walkthrough.html --debug-performance --force
```
