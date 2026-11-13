# Exhaustive final change inventories

User steering: Spec Artifacts must always end with exhaustive production-source change diagrams, then test-code/stack/etc change diagrams, so the user can ask questions about everything affected.

Corrected references/spec-artifacts.md: final order is mandatory, replacing the earlier optional ordering. Both inventories cover the full stated scope; explain known omissions and unresolved files. Follow-up alternatives remain distinct from immediate scope. Linked the ordering into change-design.md.

The current EPUB artifact is a proposed file inventory, not a verified exhaustive implementation plan. In particular, naming harness-core as shared document contracts must not imply that Rust consumes its TypeScript definitions or that all runtime validation is centralized there.

No renderer changes or application tests involved in this documentation correction.
