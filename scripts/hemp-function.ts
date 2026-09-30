import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, realpath, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { generateHempItems } from "./hemp-items.ts";
import {
  functionParts,
  parseHempDocument,
  type FunctionInfo,
} from "../packages/core/src/hemp/index.ts";

export async function generateHempFunction(
  workspace: string,
  file: string,
  name: string,
  output: string,
) {
  const root = await realpath(resolve(workspace));
  const source = resolve(root, file);
  const text = await readFile(source, "utf8");
  const { stdout } = await promisify(execFile)(
    "cargo",
    [
      "+1.94.0",
      "run",
      "--quiet",
      "--manifest-path",
      resolve("tools/hemp-rust/Cargo.toml"),
      "--bin",
      "function-info",
      "--",
      source,
      name,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const info = JSON.parse(stdout) as FunctionInfo;
  // syn spans count Unicode scalar values; our source locations use UTF-16 columns.
  const lines = text.split("\n");
  for (const part of functionParts(info.body))
    for (const position of [part.start, part.end])
      position.column =
        [...(lines[position.line - 1] ?? "")].slice(0, position.column - 1).join("").length + 1;
  const temporary = await mkdtemp(join(tmpdir(), "hemp-function-"));
  try {
    const doc = await generateHempItems(root, file, join(temporary, "inventory.hemp.json"));
    const fn = doc.nodes.find(
      (n) => n.kind === "function" && n.name === name && n.source.line === info.definitionLine,
    );
    if (!fn) throw new Error(`Analyzer did not inventory function ${name}`);
    info.itemId = fn.id;
    const parents: string[] = [];
    let parent = doc.nodes.find((n) => n.id === fn.parent);
    while (parent) {
      parents.unshift(parent.name);
      parent = doc.nodes.find((n) => n.id === parent!.parent);
    }
    info.namespace = parents.join("::");
    const parts = functionParts(info.body).reverse();
    info.connections = doc.dependencies
      .filter((edge) => edge.from === fn.id)
      .flatMap((edge) =>
        edge.evidence.flatMap((evidence) => {
          const line = evidence.line,
            column = evidence.column ?? 1;
          const part = parts.find(
            (p) =>
              (line > p.start.line || (line === p.start.line && column >= p.start.column)) &&
              (line < p.end.line || (line === p.end.line && column < p.end.column)),
          );
          return part
            ? [{ partId: part.id, targetId: edge.to, kind: "reference" as const, line, column }]
            : [];
        }),
      );
    doc.functionInfo = info;
    doc.name = `${name} · function study`;
    doc.analysis.method += " + syn ordered FunctionInfo";
    doc.analysis.warnings.push(
      "Function study: source-shaped syntax, not a CFG. Other expressions retain source text. Connections are resolved item references, not dataflow; locals, external definitions, macro expansions and inferred runtime targets are not connection targets. Line count includes comments within the function span.",
    );
    const serialized = JSON.stringify(doc, null, 2);
    parseHempDocument(serialized);
    await writeFile(output, serialized + "\n");
    return doc;
  } finally {
    // Only the unique directory created above, containing our intermediate inventory.
    await rm(temporary, { recursive: true, force: true });
  }
}
