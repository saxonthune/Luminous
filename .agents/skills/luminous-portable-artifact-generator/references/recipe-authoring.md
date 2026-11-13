# Creating and maintaining recipes

A recipe specifies a reusable diagram's purpose, vocabulary, relationships, visual presentation, and any validation or interaction expectations. Identify whether it is an authoring convention, a proposed implementation, or a registered, implemented recipe; never imply that documentation alone adds parser or renderer support.

Recipes can create highly customized components for arbitrarily narrow needs. Design and implement a purpose-built component when the requested representation needs one; do not force the design into existing generic components or settle for a workaround merely because the component does not yet exist.

When creating or altering a recipe, extract independently reviewable requirements from the user's prompt into that recipe's Markdown. Preserve the user's scope, qualifications, and uncertainty. Distinguish user requirements from examples, proposed techniques, open questions, and agent inferences. Reconcile later corrections with earlier requirements instead of leaving conflicting statements. Keep illustrative project details outside universal requirements.

Develop a representative artifact to explore the recipe and record current renderer limitations. Describe what the generator actually validates; do not claim unimplemented checks or interactions. Maintain existing recipes in their own reference files and link them from the skill. Prefer reusable semantics and legible legends over incidental presentation conventions.

## Composing recipes

A recipe may compose other recipes. Describe the purpose and order of each child view, shared identities/vocabulary, and the relationship between views. Composition in an authored Markdown document does not imply a registered parser recipe or automated cross-canvas validation.

For the Braincrawl change-design composition, see [change-design.md](change-design.md).
