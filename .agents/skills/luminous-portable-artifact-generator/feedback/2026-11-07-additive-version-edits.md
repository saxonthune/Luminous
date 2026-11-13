# Additive edits should not create redundant versions

User steering: “we don't need new version if request is non-destructive or trivial”;
adding another diagram should leave one version containing all diagrams.

Updated the skill to distinguish meaningful alternatives from additive/trivial
edits. Added `--amend-latest` so the generator can update the current numbered
snapshot and source companions under its history lock; earlier versions stay
unchanged. Authors must use the generator rather than hand-edit snapshot JSON.

Applied to Braincrawl's `.luminous/artifacts/08-cli-store-v2-routes/`: added the
QUERY API-code diagram to v1. Focused history tests cover stable version IDs,
preservation of prior snapshots, source companions and publication failure.
Type checking passed. Browser interactions were not exercised.
