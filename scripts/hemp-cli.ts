import { readFile } from "node:fs/promises";
import {
  arrangeHemp,
  moveHempNode,
  parseHempDocument,
  parseHempMap,
} from "../packages/core/src/hemp/index.ts";
import { generateHemp } from "./hemp-pipeline.ts";
import { generateHempFunction } from "./hemp-function.ts";
import { generateHempMap } from "./hemp-map.ts";
import { generateHempItems, generateHempCrates, generateHempBinary } from "./hemp-items.ts";

export async function hempCli(args: string[], server: string, dry = false) {
  const relayout = args.includes("--relayout");
  args = args.filter((arg) => arg !== "--relayout");
  const bodyIndex = args.indexOf("--bodies");
  let bodyFile: string | undefined;
  if (bodyIndex >= 0) {
    if (!args[bodyIndex + 1]) throw new Error("--bodies needs a source file (main/run) or all");
    bodyFile = args.splice(bodyIndex, 2)[1];
  }
  const index = args.indexOf("--scope");
  let scope = "workspace";
  if (index >= 0) {
    if (!args[index + 1]) throw new Error("--scope needs a crate ID");
    scope = args.splice(index, 2)[1];
  }
  const [command, path, ...rest] = args;
  if ((command === "map" || command === "map-binary") && path) {
    if (dry) throw new Error("map generation does not support --dry-run");
    const output = rest.at(-1);
    if (rest.length !== (command === "map" ? 2 : 3) || !output?.endsWith(".hemp2.json"))
      throw new Error(
        "Usage: hemp map <workspace> <file> <output.hemp2.json> or hemp map-binary <workspace> <package> <binary> <output.hemp2.json> [--relayout]",
      );
    await generateHempMap(
      path,
      command === "map" ? { file: rest[0] } : { package: rest[0], binary: rest[1] },
      output,
      relayout,
    );
    return;
  }
  if (command === "function" && path && rest.length === 3) {
    if (dry) throw new Error("function does not support --dry-run");
    if (!rest[2].endsWith(".hemp.json")) throw new Error("Output must end in .hemp.json");
    await generateHempFunction(path, rest[0], rest[1], rest[2]);
    console.log(`Saved ${rest[2]}`);
    return;
  }
  if (command === "binary" && path && rest.length === 3) {
    if (dry) throw new Error("binary does not support --dry-run");
    if (!rest[2].endsWith(".hemp.json")) throw new Error("Output must end in .hemp.json");
    const doc = await generateHempBinary(path, rest[0], rest[1], rest[2]);
    console.log(
      `${rest[2]}: ${doc.nodes.length} items, ${doc.dependencies.length} reference edges`,
    );
    return;
  }
  if (command === "crates" && path && rest.length >= 2) {
    if (dry) throw new Error("crates does not support --dry-run");
    const output = rest.at(-1)!;
    if (!output.endsWith(".hemp.json")) throw new Error("Output must end in .hemp.json");
    const doc = await generateHempCrates(path, rest.slice(0, -1), output, bodyFile);
    console.log(`${output}: ${doc.nodes.length} items, ${doc.dependencies.length} reference edges`);
    return;
  }
  if (command === "items" && path && rest.length === 2) {
    if (dry) throw new Error("items does not support --dry-run");
    if (!rest[1].endsWith(".hemp.json")) throw new Error("Output must end in .hemp.json");
    const doc = await generateHempItems(path, rest[0], rest[1]);
    console.log(
      `${rest[1]}: ${doc.nodes.length} items, ${doc.dependencies.length} reference edges`,
    );
    return;
  }
  async function request(endpoint: string, body?: unknown) {
    const response = await fetch(server + endpoint, {
      signal: AbortSignal.timeout(15_000),
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
    return response;
  }
  if (command === "generate" && path && rest.length === 1) {
    if (dry) throw new Error("generate does not support --dry-run");
    if (!rest[0].endsWith(".hemp.json")) throw new Error("Output must end in .hemp.json");
    const doc = await generateHemp(path, rest[0]);
    console.log(`${rest[0]}: ${doc.nodes.length} nodes, ${doc.dependencies.length} dependencies`);
    return;
  }
  if (path?.endsWith(".hemp2.json") && ["read", "check"].includes(command)) {
    const map = parseHempMap(
      await (await request("/api/document/" + encodeURIComponent(path))).text(),
    );
    console.log(command === "read" ? JSON.stringify(map, null, 2) : "Valid Hemp map manifest");
    return;
  }
  if (command === "list") {
    const data = (await (await request("/api/documents")).json()) as {
      documents: { path: string }[];
    };
    console.log(
      data.documents
        .filter((d) => d.path.endsWith(".hemp.json") || d.path.endsWith(".hemp2.json"))
        .map((d) => d.path)
        .join("\n"),
    );
    return;
  }
  if (
    !path ||
    !path.endsWith(".hemp.json") ||
    !["read", "check", "write", "layout", "move"].includes(command)
  ) {
    throw new Error(`Usage: just cli hemp generate <workspace> <output.hemp.json>
  just cli hemp map <workspace> <file> <output.hemp2.json> [--relayout]
  just cli hemp map-binary <workspace> <package> <binary> <output.hemp2.json> [--relayout]
  just cli hemp function <workspace> <file> <function-name> <output.hemp.json>
  just cli hemp items <workspace> <module-file-relative-to-workspace> <output.hemp.json>
  just cli hemp binary <workspace> <package> <binary> <output.hemp.json>
  just cli hemp crates <workspace> <package> [<package> ...] <output.hemp.json> [--bodies SOURCE_FILE|all]
  just cli hemp list [--server URL]
  just cli hemp read|check <path.hemp.json> [--server URL]
  just cli hemp write <path.hemp.json> <local-file> [--dry-run]
  just cli hemp layout <path.hemp.json> [--scope CRATE_ID] [--dry-run]
  just cli hemp move <path.hemp.json> <node-id> <x> <y> [--scope CRATE_ID] [--dry-run]`);
  }
  if (command === "write" && rest.length !== 1) throw new Error("write needs a local file");
  const doc = parseHempDocument(
    command === "write"
      ? await readFile(rest[0], "utf8")
      : await (await request("/api/document/" + encodeURIComponent(path))).text(),
  );
  if (command === "read") {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }
  if (command === "check") {
    console.log("Valid Hemp document");
    return;
  }
  let next = doc;
  if (command === "layout") next = arrangeHemp(doc, scope);
  if (command === "move") {
    if (rest.length !== 3 || rest[1].trim() === "" || rest[2].trim() === "")
      throw new Error("move needs node-id x y");
    next = moveHempNode(doc, scope, rest[0], Number(rest[1]), Number(rest[2]));
  }
  if (dry) console.log(JSON.stringify(next, null, 2));
  else {
    await request("/api/document/write", { path, content: next });
    console.log(`Saved ${path}`);
  }
}
