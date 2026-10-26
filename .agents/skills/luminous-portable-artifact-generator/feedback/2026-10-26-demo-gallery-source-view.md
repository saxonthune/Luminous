# Demo gallery and source view

Task: publish selected examples as a section of the existing static Luminous demo.

- The input selection is `packages/portable/demo/artifacts.json`; default input
  directory is `packages/portable/examples/`. Order is explicit. Theme/CSS
  companions are filenames within that input directory.
- `just portable-gallery` generates each artifact and a Markdown overview into
  `packages/client/dist/portable/`. `just build-static` runs it after the client
  build, so Vite does not remove the generated gallery.
- Explicit `./slug/index.html` links work both locally and on the static site.
  Portable prose links now accept explicit relative paths as well as web links.
- Source view uses the same self-contained artifact with `?view=source`, displaying
  original Markdown as text. It requires no server-side source endpoint. Theme
  and unrelated URL query values survive navigation.
- Verification: full static build, Portable typecheck, existing component test,
  exact embedded-source comparisons and generated overview ordering passed.
  Browser/E2E interactions were not exercised.
- The path was straightforward. Current gallery generation compiles the runtime
  separately for each artifact and for the overview. If the selection grows,
  sharing one build result during generation would reduce build time; this is an
  implementation idea, not a requested product requirement.
