---
title: Canvas headers
summary: Canvas Header and Fullscreen Canvas Header glossary, features, and requirements.
tags: [portable, glossary, requirements, fullscreen]
---

# Canvas headers

## Glossary

- **PHTERM1.** [p] **Canvas Header** — the header containing controls for an individual canvas component.
- **PHTERM2.** [p] **Fullscreen Canvas Header** — the header shown for a viewport-filling canvas, combining its regular controls with the source filename and theme selector.

## Canvas Header

```yaml rhidoc-feature
prefix: PCH
name: Canvas Header
description: Users can access controls for an individual canvas, including opening it fullscreen.
```

- **PCH1.** [p] The Canvas Header provides a fullscreen button.
- **PCH2.** [p] Activating fullscreen expands the canvas to fill the entire browser viewport.

- **PCH3.** [p] The Canvas Header has a settings icon that opens a dropdown.
- **PCH4.** [p] The first settings option is a checkbox labeled “Scroll Zoom”, checked by default.
- **PCH5.** [p] Authors can override the initial Scroll Zoom setting in Markdown.
- **PCH6.** [p] When Scroll Zoom is unchecked, scrolling inside the canvas pans vertically; Ctrl+scroll performs normal canvas zoom.

- **PCH7.** [p] The settings button matches the height of the other Canvas Header buttons.

- **PCH8.** [p] Authors can set a canvas title in Markdown; regular and fullscreen headers display it, falling back to the generated canvas ID when no title is supplied.

- **PCH9.** [p] The Canvas Header background is visually distinct from the article/content background.

## Fullscreen Canvas Header

```yaml rhidoc-feature
prefix: PFCH
name: Fullscreen Canvas Header
description: Users can control a fullscreen canvas and its theme without returning to the surrounding page.
```

- **PFCH1.** [p] The Fullscreen Canvas Header contains the regular Canvas Header controls.
- **PFCH2.** [p] The Fullscreen Canvas Header displays the source filename.
- **PFCH3.** [p] The Fullscreen Canvas Header provides the theme selector.
- **PFCH4.** [p] While a canvas is fullscreen, users cannot interact with or scroll the surrounding page.

## Current implementation

Fullscreen means filling the browser viewport, without invoking browser F11 or
hiding browser chrome. A native modal dialog makes background content inert and
contains keyboard focus. A document scroll lock prevents background scrolling.
The existing canvas is moved into the modal and returned on exit; it is not
recreated. A placeholder retains its place in the document.

The source filename is embedded during generation; the browser does not need
filesystem access. The shared theme signal feeds both page and fullscreen headers.
Expand width remains visible but disabled in fullscreen. Exit fullscreen or Escape
returns to the previous article/expanded-width mode and restores focus. Camera
translation compensates for viewport displacement on entry and exit.

| Input | Action |
|---|---|
| Settings icon | Toggle the settings dropdown |
| Scroll Zoom checkbox | Switch between wheel zoom and wheel pan |
| Ctrl+wheel | Zoom with normal wheel sensitivity |
| Fullscreen | Fill the browser viewport with this canvas |
| Exit fullscreen | Return the canvas to its place in the document |
| Escape while fullscreen | Exit fullscreen |
| Tab / Shift-Tab while fullscreen | Navigate controls inside the modal |
| Theme selector | Change the shared page and canvas theme |

Canvas Header surface: `--portable-canvas-header-bg` defaults to the canvas/body
background, independently of the article surface token.
