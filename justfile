# Luminous task runner. Run `just` (or `just --list`) to see all recipes.
# Task commands live here, not in package.json. package.json holds only
# dependencies, metadata, exports, and bin entries.

set shell := ["bash", "-c"]

# show available recipes
default:
    @just --list

# install workspace dependencies
install:
    pnpm install

# ---- build ----

# build all compiled packages (core's runtime is source-only)
build: build-cactus build-server build-mcp build-client

# build cactus type declarations
build-cactus:
    pnpm exec tsc -p packages/cactus/tsconfig.build.json

# build the server and its environment-independent Nylon executor
build-server:
    pnpm -C packages/server exec esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js

# build (regenerate) the MCP server bundle
build-mcp:
    pnpm -C packages/mcp exec tsup

# regenerate the MCP server bundle — alias of build-mcp
mcp: build-mcp

# build the canvas client
build-client:
    pnpm exec tsc -b packages/client/tsconfig.json
    pnpm -C packages/client exec vp build

# build the client as a static, no-backend demo site (bundles public/canvases/)
build-static:
    pnpm exec tsc -b packages/client/tsconfig.json
    STATIC_BUILD=true pnpm -C packages/client exec vp build

# ---- test ----

# run all unit tests
test: test-core test-cactus test-mcp test-client test-server

test-core:
    pnpm -C packages/core exec vitest run

test-cactus:
    pnpm -C packages/cactus exec vitest run

test-mcp:
    pnpm -C packages/mcp exec vitest run

test-client:
    pnpm -C packages/client exec vitest run

# Nylon action/history and projection checks, without browser E2E tests
test-nylon:
    pnpm -C packages/core exec vitest run tests/nylon
    pnpm -C packages/client exec vitest run src/apps/nylon/__tests__ src/ws/__tests__

# run the independent CI test groups concurrently
test-ci:
    #!/usr/bin/env bash
    set -u
    just test-cactus & cactus_pid=$!
    just test-server & server_pid=$!
    just test-nylon & nylon_pid=$!
    status=0
    wait "$cactus_pid" || status=1
    wait "$server_pid" || status=1
    wait "$nylon_pid" || status=1
    exit "$status"

test-server:
    pnpm -C packages/server exec vitest run

# run client end-to-end tests (Playwright)
test-e2e:
    pnpm -C packages/client exec playwright test

# ---- typecheck ----

# typecheck all packages
typecheck: typecheck-core typecheck-cactus typecheck-mcp typecheck-client typecheck-server

typecheck-server:
    pnpm exec tsc --noEmit -p packages/server/tsconfig.json

typecheck-core:
    pnpm exec tsc --noEmit -p packages/core/tsconfig.json

typecheck-cactus:
    pnpm exec tsc --noEmit -p packages/cactus/tsconfig.json

typecheck-mcp:
    pnpm exec tsc --noEmit -p packages/mcp/tsconfig.json

typecheck-client:
    pnpm exec tsc --noEmit -p packages/client/tsconfig.json

# ---- lint ----

# lint the workspace
lint:
    pnpm exec vp lint

# ---- dev ----

# run the storage server + canvas client together
dev:
    pnpm -C packages/server exec tsx watch src/index.ts -- --config {{justfile_directory()}}/luminous.config.json --dir {{justfile_directory()}}/.luminous & pnpm -C packages/client exec vp dev

# run the canvas client only
dev-client:
    pnpm -C packages/client exec vp dev

# run the client in static (no-backend) mode against the bundled demo docs
dev-static:
    STATIC_BUILD=true pnpm -C packages/client exec vp dev

# run the storage server only
dev-server:
    pnpm -C packages/server exec tsx watch src/index.ts -- --config {{justfile_directory()}}/luminous.config.json --dir {{justfile_directory()}}/.luminous

# run the MCP server from source over stdio
dev-mcp:
    pnpm -C packages/mcp exec tsx src/server.ts

# call an app CLI against the storage server, e.g. `just cli nylon list`
cli *args:
    pnpm exec tsx scripts/luminous-cli.ts {{args}}

# preview the production client build
preview:
    pnpm -C packages/client exec vp preview

# start the built storage server
start-server:
    node packages/server/dist/index.js

# ---- generators ----

# extract braincrawl crates, modules, documentation, and dependencies into Hemp
generate-hemp:
    pnpm exec tsx scripts/luminous-cli.ts hemp generate braincrawl .luminous/braincrawl.hemp.json

# single-function source-order study with fixed, fully visible internals
generate-hemp-function:
    pnpm exec tsx scripts/luminous-cli.ts hemp function tools/hemp-fixture examples/function_board.rs process_command .luminous/function-study.hemp.json

# Searchable fixed code map, preserving saved anchors on regeneration
generate-hemp-map:
    pnpm exec tsx scripts/luminous-cli.ts hemp map tools/hemp-fixture examples/function_board.rs .luminous/function-map.hemp2.json

# Complete workspace dependency map for Braincrawl's CLI binary
generate-hemp-map-braincrawl:
    pnpm exec tsx scripts/luminous-cli.ts hemp map-binary braincrawl braincrawl-cli braincrawl .luminous/braincrawl.hemp2.json

# extract a module-sized semantic item/reference graph into Hemp
generate-hemp-items workspace="braincrawl" module="stem/crates/l3/src/ids.rs" output=".luminous/braincrawl-ids.hemp.json":
    pnpm exec tsx scripts/luminous-cli.ts hemp items {{quote(workspace)}} {{quote(module)}} {{quote(output)}}

# two-module source example for Hemp progressive disclosure
generate-hemp-two-modules:
    pnpm exec tsx scripts/luminous-cli.ts hemp items tools/hemp-fixture examples/two_modules.rs .luminous/two-modules.hemp.json

# semantic items and cross-file references in Braincrawl's CLI and CLI-support
generate-hemp-cli:
    pnpm exec tsx scripts/luminous-cli.ts hemp crates braincrawl braincrawl-cli braincrawl-cli-support .luminous/braincrawl-cli.hemp.json

# main/run body preview, in a separate artifact from the item-only graph
generate-hemp-cli-bodies:
    pnpm exec tsx scripts/luminous-cli.ts hemp crates braincrawl braincrawl-cli braincrawl-cli-support .luminous/braincrawl-cli-bodies.hemp.json --bodies stem/apps/cli/src/main.rs

# all inventoried function/method bodies in the selected CLI packages
generate-hemp-cli-all-bodies:
    pnpm exec tsx scripts/luminous-cli.ts hemp crates braincrawl braincrawl-cli braincrawl-cli-support .luminous/braincrawl-cli-all-bodies.hemp.json --bodies all

# CLI binary + its transitive workspace libraries, with all source function bodies
generate-hemp-cli-complete:
    pnpm exec tsx scripts/luminous-cli.ts hemp binary braincrawl braincrawl-cli braincrawl .luminous/braincrawl-cli-complete.hemp.json

# semantic extraction regression (requires rust-analyzer component for Rust 1.94.0)
test-hemp-items:
    pnpm exec tsx --test scripts/hemp-items.test.ts scripts/hemp-map.test.ts

# install local Rust visualization tools and link ../braincrawl
hemp-prior-art-setup:
    node scripts/hemp-prior-art.mjs setup

# regenerate braincrawl's interactive workspace diagram
hemp-prior-art-arc:
    node scripts/hemp-prior-art.mjs arc

# generate workspace + focused library module diagrams (open .hemp-prior-art/index.html)
hemp-prior-art package="braincrawl-core":
    node scripts/hemp-prior-art.mjs generate {{quote(package)}}

# generate the Solid.js project-summary canvas
generate-canvas:
    pnpm exec tsx scripts/analyze-solidjs.ts

# generate the RankThePlanet canvas
generate-rtp-canvas:
    pnpm exec tsx scripts/build-rtp-canvas.ts

# validate a pack file
validate-pack:
    pnpm exec tsx scripts/validate-pack.ts

# regenerate the pipeline skill's primitive reference from core descriptors
gen-skill-reference:
    pnpm exec tsx scripts/gen-primitives-reference.ts

# fail if the committed primitive reference is stale (used in CI)
check-skill-reference: gen-skill-reference
    git diff --exit-code .agents/skills/luminous-pipeline/primitives-reference.md

# ---- misc ----

# kill dev servers on ports 4080 and 5200
kill:
    -bash scripts/kill-dev.sh
    @echo "Killed processes on ports 4080 and 5200"
