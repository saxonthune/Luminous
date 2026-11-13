# Reading Buddy item-model specification authoring

Input: `/home/saxon/code/github/saxonthune/braincrawl-feature-design/.luminous/artifacts/reading-buddy-items/design.md`; generator: `/home/saxon/code/github/saxonthune/luminous-portable`.

Initial spine metadata supplied `spine` and `attachments` but omitted `nonOrderingEdges`. Generation failed with `ERROR input/parse: layout accepts nonOrderingEdges: [{ source, target }]`. Adding an explicit empty `nonOrderingEdges: []` to each spine declaration worked. Suggest documenting that requirement alongside every spine example, or separately considering a parser default; no implementation change was made.

The artifact composes baseline-preserving diff views, vertical read/write spines, inline portable-schema nested definitions, and final Code Changes/Test Changes inventories. Semantic kind/legend validation and generation passed. Browser loading had no page errors; nested CommentarySource expansion and collapse were exercised. Screenshots inspected locally. These checks do not validate the proposed product architecture or execute the future item-storage tests. Prior Commentary live evidence is labeled separately from planned storage-cutover verification.
