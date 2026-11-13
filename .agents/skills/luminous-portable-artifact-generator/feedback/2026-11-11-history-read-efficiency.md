# Applying list-read learnings to generation history

User asked to merge latest Braincrawl main and apply efficient Reading Buddy list PR learnings to history-aware Commentary and reads inside an open document.

Input: `/home/saxon/code/github/saxonthune/braincrawl-feature-design/.luminous/artifacts/history-aware-commentary/design.md`. Baseline updated to `42104f2b`; source evidence includes PR #67 (`61d78965`). Existing design described bounded context but reused an API wrapper that drains every page. Current reader applies private position filters after decryption and may publish completed generations while loading; a cache does not bound cold reads.

Corrected approach: separate read-only bounded history collection from the viewer loader; disclose partial coverage and unresolved policy, retain nested type disclosure, and treat encrypted projections/indexing as an evidence-dependent alternative with full consistency and writer scope. Added general read-path review guidance to spec-artifacts.md. No new product requirement or implementation is implied. Prior list fixture byte savings are not Commentary performance evidence. Generation validates rendering, not proposed query cost or semantic suppression quality.
