# Label CSS must agree with generated geometry

Artifact input: packages/portable/examples/local/mermaid-pipeline/design.md.
Companion style.css enlarged label text to 20px/24px without changing generator
measurement. User screenshot showed wrapped labels clipped in 64px-high nodes.
Portable currently estimates plain text at 8px/character and 21px line-height.
Semantic validation passed because it does not inspect rendered text geometry.

Do not treat larger label CSS as a safe presentation-only override. Resolve font,
wrap and padding before measurement, and share the resulting geometry with layout
and rendering. Mermaid uses DOM/SVG measurement; Pele carries an explicit measured
line plan into SVG rendering. Source details/revisions are retained in the artifact
folder's label-sizing-research.md. This is a proposed implementation direction,
not a new agreed product requirement. No renderer fix or browser test was performed
in this research pass.
