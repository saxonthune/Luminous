import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, realpath, mkdtemp, rm, rename } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { generateHempItems, generateHempBinary } from "./hemp-items.ts";
import { parseHempMap, type FunctionInfo, type HempMap } from "../packages/core/src/hemp/index.ts";
import { layoutHempMap } from "./hemp-map-layout.ts";
import { normalizeMapItems, joinFunctionFacts } from "./hemp-map-analysis.ts";

const exec = promisify(execFile);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Batch syntax -> semantic inventory -> normalized items -> chunks -> saved layout. */
export async function generateHempMap(
  workspace: string,
  selection: { file: string } | { package: string; binary: string },
  output: string,
  relayout = false,
) {
  const root = await realpath(resolve(workspace));
  const collection = hash(JSON.stringify([root, selection]));
  let previous: HempMap | undefined;
  try {
    previous = parseHempMap(await readFile(output, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (previous && previous.collection !== collection)
    throw new Error("Output belongs to another source collection; use a different output path");
  const temporary = await mkdtemp(join(tmpdir(), "hemp-map-"));
  try {
    const inventoryPath = join(temporary, "inventory.hemp.json");
    const doc =
      "file" in selection
        ? await generateHempItems(root, selection.file, inventoryPath)
        : await generateHempBinary(root, selection.package, selection.binary, inventoryPath, false);
    const items = normalizeMapItems(doc);
    const warnings = [...doc.analysis.warnings];
    const functions = new Map<string, FunctionInfo>();
    await exec("cargo", [
      "+1.94.0",
      "build",
      "--quiet",
      "--manifest-path",
      resolve("tools/hemp-rust/Cargo.toml"),
      "--bin",
      "function-info",
    ]);
    const helper = resolve("tools/hemp-rust/target/debug/function-info");
    const files = [
      ...new Set(
        items.filter((n) => ["function", "method"].includes(n.kind)).map((n) => n.source.file),
      ),
    ];
    const outgoing = new Map<string, typeof doc.dependencies>();
    for (const edge of doc.dependencies) {
      const list = outgoing.get(edge.from) ?? [];
      list.push(edge);
      outgoing.set(edge.from, list);
    }
    for (const file of files) {
      const source = resolve(root, file);
      const text = await readFile(source, "utf8");
      const { stdout } = await exec(helper, [source, "*"], { maxBuffer: 64 * 1024 * 1024 });
      const extracted = JSON.parse(stdout) as FunctionInfo[];
      for (const syntax of extracted) {
        const item = items.find(
          (n) =>
            n.source.file === file &&
            n.source.line === syntax.definitionLine &&
            n.name === syntax.name &&
            ["function", "method"].includes(n.kind),
        );
        if (!item) continue; // cfg-disabled or otherwise outside semantic inventory
        const info = joinFunctionFacts(syntax, item, text, outgoing.get(item.id) ?? []);
        item.lineCount = info.lineCount;
        functions.set(item.id, info);
        const chunk = JSON.stringify({ format: "hemp2-function", info });
        item.functionFile = `${basename(output, ".hemp2.json")}.${hash(chunk).slice(0, 24)}.hemp2-part.json`;
        await writeFile(join(dirname(output), item.functionFile), chunk + "\n");
      }
    }
    for (const item of items)
      if (["function", "method"].includes(item.kind) && !functions.has(item.id))
        warnings.push(
          `No source body extracted for ${item.id} (declaration, macro or unsupported mapping).`,
        );
    const placed = layoutHempMap(
      items,
      doc.dependencies,
      functions,
      relayout ? undefined : previous,
    );
    const map: HempMap = {
      format: "hemp2",
      name: "file" in selection ? selection.file : `${selection.package}/${selection.binary}`,
      collection,
      analysis: {
        sourceRoot: root,
        warnings: [
          ...warnings,
          ...placed.warnings,
          "Resolved workspace item references, not complete dataflow or execution prerequisites. Bodies are source-shaped syntax, not CFGs. Duplicate definition IDs and renames can change identity.",
        ],
      },
      items,
      references: doc.dependencies,
      layout: placed.layout,
    };
    const serialized = JSON.stringify(map, null, 2);
    parseHempMap(serialized);
    await writeFile(output + ".tmp", serialized + "\n");
    await rename(output + ".tmp", output);
    console.log(
      `${output}: ${items.length} items, ${functions.size} function chunks, ${doc.dependencies.length} reference edges`,
    );
    return map;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
