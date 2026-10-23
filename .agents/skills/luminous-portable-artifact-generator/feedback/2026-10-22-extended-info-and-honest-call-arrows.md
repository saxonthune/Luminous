# Extended Info and honest call arrows

The user rejected hiding the real harness-to-BraincrawlInstance lookup in prose
to obtain a downward layout. Restored that edge in both privacy views and added
an explicit nonOrderingEdges layout hint: the edge remains in the graph and
renderer, but is excluded from layered ordering. Generated coordinates retain
browser → service → harness vertical order. Do not conflate topology with layout.

User requested Extended Info Plugin, with [more] footer links, input-defined
Markdown, a floating container, drag/resize/scroll, minimize-to-header and close.
Captured EIP1–EIP11 in Portable requirements with local GFR prepare/apply evidence.
Implemented reusable canvas-owned ExtendedInfo and portable-info references;
metadata lives in the input and source links use the working Zed file handler.

Privacy artifact has 16 entries. Source explanations distinguish Wrangler entry
modules and resource bindings from request-method/path dispatch in code, and
identify current decryption handlers versus proposed changes. Book-open metadata
is kept distinct from private document content. Zed triple-slash inputs normalize
to zed://file/ rather than emitting a known unsupported handler path.

Evidence: Portable type check and generation succeeded; inspected embedded output
for restored direct lookup edges and downward component coordinates. No automated
or browser interaction tests were run. Existing Firefox tab was not reopened.
