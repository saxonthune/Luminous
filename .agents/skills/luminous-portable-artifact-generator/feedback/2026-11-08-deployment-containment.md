# Put modules inside their runtime resource

User requested module containers representing where code is deployed/executed and
an authored YAML-like placement map; asked whether Terraform work could supply it.
Artifact: braincrawl-code-tree/.luminous/artifacts/12-source-code-tree/design.html v4.

Wrangler names/bindings and source entry/import/Cargo manifests feed a small JSON
map. Terraform PR44 provisions isolated infrastructure, not module bundle contents.
Keep the map a join of authoritative inputs rather than duplicate infrastructure.
Browser code runs in a browser while its assets are served by a Worker: containment
and asset delivery are different relationships. Shared source may appear in several
runtime containers while retaining one source identity in the IR. Unassigned code
must stay explicitly unassigned instead of being guessed into a production Worker.

The view is declared source placement, not exact compiler-retained symbols or live
Cloudflare attestation. Cargo cfg/optional dependency treatment is conservative;
missing dynamic/alias/generated imports remain coverage gaps. Validate references,
preserve source membership provenance, and keep function evidence out of overview
panels. Exact build membership should later come from bundler/compiler metadata.
