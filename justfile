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
    pnpm -C packages/cactus exec tsc -p tsconfig.build.json

# build the storage server
build-server:
    pnpm -C packages/server-next exec rimraf dist
    pnpm -C packages/server-next exec tsc

# build (regenerate) the MCP server bundle
build-mcp:
    pnpm -C packages/mcp exec tsup

# regenerate the MCP server bundle — alias of build-mcp
mcp: build-mcp

# build the canvas client
build-client:
    pnpm -C packages/client-next exec tsc -b
    pnpm -C packages/client-next exec vite build

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
    pnpm -C packages/client-next exec vitest run

test-server:
    pnpm -C packages/server-next exec vitest run

# run client end-to-end tests (Playwright)
test-e2e:
    pnpm -C packages/client-next exec playwright test

# ---- typecheck ----

# typecheck all packages
typecheck: typecheck-core typecheck-cactus typecheck-mcp typecheck-client

typecheck-core:
    pnpm -C packages/core exec tsgo --noEmit

typecheck-cactus:
    pnpm -C packages/cactus exec tsgo --noEmit

typecheck-mcp:
    pnpm -C packages/mcp exec tsgo --noEmit -p tsconfig.json

typecheck-client:
    pnpm -C packages/client-next exec tsgo --noEmit

# ---- lint ----

# lint the workspace
lint:
    pnpm exec eslint .

# ---- dev ----

# run the storage server + canvas client together
dev:
    pnpm -C packages/server-next exec tsx watch src/index.ts -- --config {{justfile_directory()}}/luminous.config.json --dir {{justfile_directory()}}/.canvases & pnpm -C packages/client-next exec vite

# run the canvas client only
dev-client:
    pnpm -C packages/client-next exec vite

# run the storage server only
dev-server:
    pnpm -C packages/server-next exec tsx watch src/index.ts -- --config {{justfile_directory()}}/luminous.config.json --dir {{justfile_directory()}}/.canvases

# run the MCP server from source over stdio
dev-mcp:
    pnpm -C packages/mcp exec tsx src/server.ts

# preview the production client build
preview:
    pnpm -C packages/client-next exec vite preview

# start the built storage server
start-server:
    node packages/server-next/dist/index.js

# ---- generators ----

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
    git diff --exit-code .claude/skills/luminous-pipeline/primitives-reference.md

# ---- misc ----

# kill dev servers on ports 4080 and 5200
kill:
    -lsof -ti :4080 -ti :5200 | xargs -r kill -9 2>/dev/null
    @echo "Killed processes on ports 4080 and 5200"
