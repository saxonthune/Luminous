import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateHempItems, generateHempBinary, binaryDependencyPackages } from "./hemp-items.ts";
import { hempProjection } from "../packages/core/src/hemp/index.ts";
import { functionParts, parseHempDocument } from "../packages/core/src/hemp/index.ts";
import { generateHempFunction } from "./hemp-function.ts";

test(
  "FunctionInfo preserves statement order, deferred bodies and resolved references",
  { timeout: 180_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "hemp-function-test-"));
    try {
      const doc = await generateHempFunction(
        "tools/hemp-fixture",
        "examples/function_board.rs",
        "process_command",
        join(dir, "function.hemp.json"),
      );
      const info = doc.functionInfo!;
      assert.deepEqual(
        info.body.map((p) => p.kind),
        ["binding", "if", "binding", "match", "call", "call"],
      );
      const parts = functionParts(info.body);
      for (const kind of ["guard", "return", "try", "loop", "closure", "assign"])
        assert.ok(
          parts.some((p) => p.kind === kind),
          kind,
        );
      const limit = doc.nodes.find((n) => n.name === "DEFAULT_LIMIT")!;
      const connection = info.connections.find((c) => c.targetId === limit.id)!;
      assert.equal(parts.find((p) => p.id === connection.partId)?.label, "DEFAULT_LIMIT");
      assert.ok(parts.find((p) => p.kind === "closure")?.label.includes("deferred"));
      assert.equal(parseHempDocument(JSON.stringify(doc)).functionInfo?.name, "process_command");
      connection.partId = "missing";
      assert.throws(() => parseHempDocument(JSON.stringify(doc)), /connection/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "semantic references distinguish aliases, shadowing, direct users and containment",
  { timeout: 180_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "hemp-items-test-"));
    try {
      const doc = await generateHempItems(
        "tools/hemp-fixture",
        "src/lib.rs",
        join(dir, "fixture.hemp.json"),
      );
      const find = (name: string) => doc.nodes.find((n) => n.name === name)!;
      const refers = (from: string, to: string) =>
        doc.dependencies.some((e) => e.from === find(from).id && e.to === find(to).id);
      assert.ok(refers("direct", "LIMIT"));
      assert.ok(refers("direct", "TOTAL"));
      assert.ok(refers("alias", "LIMIT"));
      assert.ok(!refers("shadow", "LIMIT"));
      assert.ok(!refers("indirect", "LIMIT"));
      assert.ok(refers("indirect", "direct"));
      assert.equal(find("TOTAL").kind, "static");
      assert.equal(find("Count").kind, "type");
      assert.ok(doc.nodes.some((n) => n.name === "read" && n.parent === find("nested").id));
      assert.equal(hempProjection(doc).nodes.length, doc.nodes.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "crate inventory follows module files and re-exports across binary/library targets",
  { timeout: 180_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "hemp-crates-test-"));
    try {
      const doc = await generateHempBinary(
        "tools/hemp-fixture",
        "hemp-reference-fixture",
        "hemp-reference-fixture",
        join(dir, "crates.hemp.json"),
      );
      const main = doc.nodes.find((n) => n.name === "main")!;
      const shared = doc.nodes.find((n) => n.name === "SHARED")!;
      const support = doc.nodes.find((n) => n.name === "support")!;
      assert.equal(doc.nodes.filter((n) => n.kind === "crate").length, 2);
      assert.equal(shared.parent, support.id);
      assert.equal(shared.source.file, "src/support.rs");
      const method = doc.nodes.find(
        (n) => n.kind === "method" && n.name === "get" && n.source.file === "src/main.rs",
      )!;
      const read = doc.nodes.find(
        (n) => n.kind === "function" && n.name === "read" && n.source.file === "src/support.rs",
      )!;
      assert.ok(doc.nodes.some((n) => n.kind === "branch" && n.parent === method.id));
      assert.ok(doc.nodes.some((n) => n.kind === "branch" && n.parent === read.id));
      assert.ok(
        doc.dependencies.some(
          (e) =>
            e.from === main.id &&
            e.to === shared.id &&
            e.evidence.some((s) => s.file === "src/main.rs" && s.text.includes("RENAMED")),
        ),
      );
      assert.ok(
        doc.dependencies.some(
          (e) =>
            e.from === support.parent &&
            e.to === shared.id &&
            e.evidence.some((s) => s.file === "src/lib.rs"),
        ),
      );
      const collapsed = hempProjection(doc);
      assert.equal(collapsed.nodes.length, 2);
      assert.equal(collapsed.edges.length, 1);
      assert.ok(collapsed.edges[0].evidence.length >= 2);
      assert.equal(new Set(Object.values(doc.views.workspace).map((p) => p.x)).size, 2);
      const run = doc.nodes.find((n) => n.kind === "function" && n.name === "run")!;
      const leaf = doc.nodes.find((n) => n.kind === "function" && n.name === "leaf")!;
      const matches = doc.nodes.filter((n) => n.kind === "match");
      assert.equal(matches.length, 2);
      assert.equal(matches[0].parent, run.id);
      const arm = doc.nodes.find((n) => n.id === matches[1].parent)!;
      assert.equal(arm.kind, "arm");
      assert.equal(arm.parent, matches[0].id);
      const call = doc.nodes.find((n) => n.kind === "call" && n.name === "leaf(…)")!;
      assert.ok(
        doc.dependencies.some((e) => e.from === call.id && e.to === leaf.id && e.kind === "call"),
      );
      assert.ok(call.source.column! > 0);
      const detailed = hempProjection({ ...doc, collapsed: [] });
      assert.ok(detailed.edges.some((e) => e.from === call.id && e.to === leaf.id));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test("binary scope follows transitive normal dependencies, not dev/build or unrelated packages", () => {
  const names = ["cli", "a", "b", "dev", "build", "unrelated", "external"];
  const dep = (pkg: string, kind: string | null = null) => ({ pkg, dep_kinds: [{ kind }] });
  const metadata = {
    workspace_members: names.filter((n) => n !== "external"),
    packages: names.map((name) => ({ id: name, name, description: null, targets: [] })),
    resolve: {
      nodes: names.map((id) => ({
        id,
        deps:
          id === "cli"
            ? [dep("a"), dep("dev", "dev"), dep("build", "build"), dep("external")]
            : id === "a"
              ? [dep("b")]
              : id === "b"
                ? [dep("a")]
                : [],
      })),
    },
  };
  assert.deepEqual(
    binaryDependencyPackages(metadata, "cli").map((p) => p.name),
    ["cli", "a", "b"],
  );
  assert.throws(() => binaryDependencyPackages(metadata, "missing"), /Unknown workspace/);
  assert.throws(
    () => binaryDependencyPackages({ ...metadata, resolve: null }, "cli"),
    /resolution graph/,
  );
});
