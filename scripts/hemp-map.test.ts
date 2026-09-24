import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateHempMap } from "./hemp-map.ts";
import { indexHempMap, validateFunctionInfo } from "../packages/core/src/hemp/index.ts";

test(
  "map pipeline preserves anchors across line shifts, indexes references and extracts methods",
  { timeout: 180_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "hemp-map-test-"));
    try {
      await mkdir(join(dir, "src"));
      await writeFile(
        join(dir, "Cargo.toml"),
        '[package]\nname="map-test"\nversion="0.0.0"\nedition="2021"\n[workspace]\n',
      );
      const source = await readFile("tools/hemp-fixture/examples/function_board.rs", "utf8");
      await writeFile(join(dir, "src/main.rs"), source);
      const output = join(dir, "test.hemp2.json");
      const first = await generateHempMap(dir, { file: "src/main.rs" }, output);
      const index = indexHempMap(first);
      const fn = index.search("process_command")[0];
      assert.equal(fn.name, "process_command");
      const limit = first.items.find((n) => n.name === "DEFAULT_LIMIT")!;
      assert.ok(index.neighborhood(fn.id, "dependencies").ids.has(limit.id));
      assert.ok(index.neighborhood(limit.id, "usages").ids.has(fn.id));
      assert.ok(first.items.find((n) => n.name === "fetch")?.functionFile);
      for (const item of first.items.filter((n) => n.functionFile)) {
        const chunk = JSON.parse(await readFile(join(dir, item.functionFile!), "utf8"));
        validateFunctionInfo(chunk.info, new Set(first.items.map((n) => n.id)));
      }
      await writeFile(join(dir, "src/main.rs"), "// added comment\n\n" + source);
      const second = await generateHempMap(dir, { file: "src/main.rs" }, output);
      assert.deepEqual(
        second.items.map((n) => n.id),
        first.items.map((n) => n.id),
      );
      assert.deepEqual(second.layout, first.layout);
      assert.equal(second.items.find((n) => n.id === fn.id)!.source.line, fn.source.line + 2);
      const binary = await generateHempMap(
        "tools/hemp-fixture",
        { package: "hemp-reference-fixture", binary: "hemp-reference-fixture" },
        join(dir, "binary.hemp2.json"),
      );
      assert.equal(binary.items.filter((n) => n.kind === "crate").length, 2);
      const bin = binary.items.find((n) => n.kind === "crate" && n.targetKind?.includes("bin"))!;
      const lib = binary.items.find((n) => n.kind === "crate" && n.targetKind?.includes("lib"))!;
      assert.ok(
        binary.layout[bin.id].x < binary.layout[lib.id].x,
        "entry binary is left of its library dependency",
      );
      assert.ok(binary.items.filter((n) => n.kind === "function").every((n) => n.functionFile));
      assert.ok(
        binary.references.some((e) => {
          const from = binary.items.find((n) => n.id === e.from)!;
          const to = binary.items.find((n) => n.id === e.to)!;
          return from.source.file !== to.source.file;
        }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
