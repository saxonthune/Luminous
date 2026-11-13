# Doc Shop artifact: retain accepted code-plan grouping

User steering: “code changes should use the new/additive/destructive changes style”; later, “the code changes diagrams in the past groups things well … artifacts should be improving over time.” The user specifically referenced artifact 08 as the successful example.

Failure: initial artifact 09 used a flat file list, status-colored nodes and incomplete ownership labels despite established earlier conventions. Adding shared diff badges alone did not restore the conceptual groupings.

Correction: artifact 09 v2 uses containers for CLI library, HTTP-client library, proposed document-prep library, shared TS contracts, Web client, Worker deployment and verification. File headers use filenames; footers carry repo-relative paths and Zed links for existing code. Shared badges express new/additive/modified changes independently of role colors. Existing server dependencies have no speculative change badges. Dashed compatibility links do not imply Rust imports TypeScript.

Inputs: braincrawl-stem-client-design/.luminous/artifacts/08-cli-store-v2-routes/design-v2.md and .luminous/artifacts/09-cli-docshop/design-v2.md. Output: artifact 09/design.html, new v2 preserving v1. Progressive schema disclosure from the prior revision is retained.

Reusable learning: inspect user-approved reference artifacts and relevant feedback before authoring another code-plan view. Retain learned grouping and component conventions; distinguish file-ownership views from function/control-flow views. Update the appropriate reference when steering establishes a reusable practice.

Verification: generation checks input/component validity and layout. No browser-interaction or product behavior claim is made by generation.

Further user steering: this is a reusable Braincrawl change recipe; recipes may compose other recipes. Add a testing-strategy diagram at the bottom identifying test-library additions that prove native CLI upload to Reading Buddy. Captured in references/change-design.md. Artifact 09 v2 gains the sixth diagram without creating another version for an additive edit. No test implementation or test execution is implied.
