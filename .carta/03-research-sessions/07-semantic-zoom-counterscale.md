---
title: Semantic Zoom and Counter-Scale Typography
summary: Research on level-of-detail semantic zoom and counter-scaled text — how to guarantee canvas text legibility under d3-zoom geometric scaling
tags: [research, semantic-zoom, zoom, typography, legibility, cactus]
deps: [doc02.05]
---

# Semantic Zoom and Counter-Scale Typography

Research session, 2026-05-18. Triggered by an observed defect: at the zoomed-out
end of the canvas, node text is illegible noise. The investigation surfaced a
deeper question — how do we *guarantee* canvas text is never illegible? This doc
captures the prior art and the design rules that follow from it.

## The problem

Luminous applies the d3-zoom transform `{x, y, k}` as a **geometric** scale:
`scale(k)` as a CSS transform on the node container, and an SVG `<g> transform`
on the edge layer. Geometric zoom multiplies *every* pixel — including glyphs —
by `k`.

So a node title styled `font-size: 12px` does not render at 12px on screen. Its
actual on-screen size is:

```
effectiveDeviceSize = cssFontSize × k
```

At the canvas `minZoom` floor (`k ≈ 0.15`), `12px × 0.15 = 1.8px` — sub-pixel
noise. Nothing in the current pipeline prevents this; text simply keeps
shrinking with `k`. Under geometric zoom, **a font size in a stylesheet is
meaningless on its own** — the screen size depends entirely on the current `k`.

## Prior art

Semantic zoom (a.k.a. level-of-detail, progressive disclosure, abstraction
gradient) is the established answer. Unlike geometric zoom, which applies a
uniform affine transform to all marks, **semantic zoom changes the
*representation* qualitatively at discrete thresholds** — revealing or hiding
structure rather than merely scaling it. It is the UI analog of mipmapping in
game graphics and coarse-graining in physics: don't scale a thing continuously
into noise; switch to a representation appropriate for the scale.

Legibility floor (from UI typography research):

- **< ~7px effective** — noise. Cull unconditionally.
- **7–12px effective** — readable for short labels only (names, counts). No prose.
- **≥ 12px effective** — Lighthouse's "legible font" threshold; safe for body text.
  16px is the comfortable default.

The consensus rule: *don't scale text continuously; switch representations at
thresholds, and within each representation pin text to a fixed device size.*
Continuous geometric text scaling is precisely what produces the illegible state.

## The two scaling regimes — "two 12-point fonts"

There are two ways to render text under a `scale(k)` transform. A node can mix
both:

| Regime | Render rule | On-screen size | Use for |
|---|---|---|---|
| **Geometric** (current) | `font-size: 12px`, scaled by `scale(k)` | `12 × k` — shrinks with zoom | Detail/body text that *should* disappear when zoomed out |
| **Counter-scaled** | `font-size: calc(12px / k)`, then scaled by `scale(k)` | `12px` — constant at any zoom | The one label that must stay readable (node title) |

Both declare "12px"; they produce different screen sizes because the
counter-scaled one divides out `k` before the transform multiplies it back:
`(12 / k) × k = 12`. This is the answer to "can there be two 12-point fonts based
on zoom" — yes, and the distinction is whether `k` is divided out first.

This is how Figma / Miro / tldraw keep node titles legible while zoomed out:
titles are counter-scaled to a fixed device size, content is geometric.

Counter-scaled text must also be **clamped** — at high zoom it would otherwise
grow absurdly large. Pin the effective size to a band, e.g. 11px–22px.

## Design rules for Luminous

### Guaranteeing legibility

No single trick suffices — combine a floor and an abstraction:

1. **Counter-scale critical text** (node title, edge label) so it cannot shrink
   below a readable device size. Clamp to a band.
2. **Threshold-cull everything else.** Compute `effectiveDeviceSize =
   cssFontSize × k`. If it falls below ~7px, do not render the text at all —
   replace it with an abstraction (colored block, count badge, nothing). Never
   render text the user can only squint at.

The guarantee: *every disclosure level declares a fixed device-pixel typography,
and text only renders at a level whose footprint actually fits.*

### Tie typography to disclosure levels

`levelFromZoom.ts` already maps `k` to discrete levels
(`peek` / `card` / `open` / `deep`). The missing piece is that each level should
own a **counter-scaled, fixed device-pixel typography**, not geometric text:

- `peek` (`k < 0.4`) — no text, or a single counter-scaled title clamped at
  ~11px. Node is a colored block + title.
- `card` (`0.4–1.2`) — counter-scaled title (~13px) + a few labels at ~11px.
- `open` (`1.2–3.0`) — geometric text is fine; `12 × k` lands in 14–36px.
- `deep` — full geometric detail.

Counter-scaling needs `k` at render time. `RenderContext` already exposes
`zoom()`, so a pack render or `NodeContainer` can compute `1/k` for its title.
Edge labels (currently a fixed `font-size="10"` inside the scaled `<g>`) have the
same illegibility bug and want the same counter-scale treatment.

## Engine/domain boundary note

Counter-scaling is a *visual* concern — it belongs in cactus or the render layer,
driven by the zoom factor cactus already owns. Disclosure *levels* (what content
appears at `peek` vs `open`) are *meaning* — they belong in the domain layer's
pack-defined renders. The two cooperate: the domain picks the representation per
level; cactus guarantees whatever text is shown lands at a legible device size.

## References

- Semantic Zoom: Interactive Multi-Level Visualization — emergentmind.com/topics/semantic-zoom
- semantic-zoom interaction pattern catalogue — github.com/prathyvsh/semantic-zoom
- Canvas Semantic Zoom (John Guerra) — observablehq.com/@john-guerra/canvas-semantic-zoom
- Semantic Zoom and Mini-Maps for Software Cities — arxiv.org/html/2510.00003v1
- Minimum font size for high-density data apps (Stéphanie Walter) — stephaniewalter.design
- Text Too Small Accessibility — equalizedigital.com/accessibility-checker/text-too-small/
