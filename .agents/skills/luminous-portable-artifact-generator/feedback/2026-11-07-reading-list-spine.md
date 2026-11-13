# Reading Buddy list: prefer an ordered spine

User rejected a fan-out architecture diagram as incomprehensible and asked for a vertical spine with necessary data/endpoints to the side, following existing artifacts.

Artifact: /home/saxon/code/github/saxonthune/braincrawl-reading-list-perf/.luminous/artifacts/reading-buddy-list/design.md

Failure: list-loading and document-opening dependencies shared one shallow graph, obscuring execution order. Earlier render inspection checked appearance but did not establish explanatory clarity.

Correction: inspect control-tree recipe and examples/local/mermaid-pipeline/design.md; use layout.spine and right-side attachments. Number meaningful stages, distinguish endpoint/data kinds, explain solid progression versus dashed dependency reads. Exclude document opening from the list sequence and explain separately. Create version 2 for the changed abstraction, keeping the original version.

Verification: generation and headless render inspection planned; no claim of user acceptance.
