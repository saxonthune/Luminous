# Blender Object Assembly recipe

The user requested a reusable assembly recipe, badges for parts currently represented as blocks, removal of duplicated status prose through badges, and more legible modifier settings. The arithmometer artifact is at computation-site/.luminous/artifacts/arithmometer-tree/.

Existing Card bodies could only flatten settings into prose. Added validated `badges` and structured `modifiers` to Portable cards, rendering persistent status chips and named parameter sections with aligned labels and monospaced values. The recipe documents these fields and uses existing collapsible tree layout. This is an authoring convention, not a registered parser recipe. Current design values are read-only.

Version 4 applies Block, Master linked, To design, and unit-count badges. Modifier values moved out of duplicate prose into sections. Typecheck and five focused parser/regression tests pass. Generation measures the real components and creates the retained HTML. Browser gestures were not tested. Potential future improvement: a dedicated assembly layout keyword instead of using the existing rest-api-tree infrastructure.
