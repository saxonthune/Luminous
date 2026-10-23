# Canvas legend ownership and concrete explanations

The initial legend implementation was page-global, with a separate fullscreen
instance. The user explicitly rejected this: legends must be declared per canvas
and live inside that canvas; remove the page-shared component entirely.

Implemented portable-canvas.legend with optional title and ordered entries
(class plus optional label). Class colors come from the injected theme. Omission
means no legend. Each canvas mounts its own Legend inside its viewport, outside
zoomed geometry; fullscreen moves the same component and preserves its state.
There is no page App legend. Requirements and authoring guidance now reflect this.

User also found the abstract core/adapter diagram meaningless. Replaced it in
Braincrawl's retained input with a numbered source-derived passage-reading path,
identifying work performed, execution location, ciphertext retrieval, browser
decryption and selected plaintext sent for inference. General lesson: component
names alone do not explain what happens; use concrete operations for focused views.

Input: /home/saxon/code/github/saxonthune/braincrawl-service-standardization/.luminous/service-standardization/2026-10-22-architecture.md
Output: /tmp/braincrawl-service-standardization.html
Generation succeeded; no browser interaction tests were run. Earlier input was
retained as 2026-10-22-architecture-before-canvas-legends.md.
