/** Semantic item graphs, using rust-analyzer's LSP surface. */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, realpath, mkdir } from "node:fs/promises";
import { resolve, relative, dirname, basename } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  arrangeHemp,
  parseHempDocument,
  type HempDocument,
  type HempNode,
  type HempDependency,
} from "../packages/core/src/hemp/index.ts";

type Position = { line: number; character: number };
type Range = { start: Position; end: Position };
type Symbol = {
  name: string;
  detail?: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children?: Symbol[];
};
type Location = { uri: string; range: Range };
type Definition = Location | { targetUri: string; targetSelectionRange: Range };
const locations = (result: Definition | Definition[] | null): Location[] =>
  (result ? (Array.isArray(result) ? result : [result]) : []).map((d) =>
    "targetUri" in d ? { uri: d.targetUri, range: d.targetSelectionRange } : d,
  );
type ItemRoot = { file: string; node: HempNode };
type CargoMetadata = {
  workspace_members: string[];
  packages: {
    id: string;
    name: string;
    description: string | null;
    targets: { name: string; kind: string[]; src_path: string }[];
  }[];
  resolve: {
    nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[];
  } | null;
};

/** Normal dependencies only; tests and build tools are not runtime dependencies. */
export function binaryDependencyPackages(metadata: CargoMetadata, packageName: string) {
  const entry = metadata.packages.find(
    (p) => p.name === packageName && metadata.workspace_members.includes(p.id),
  );
  if (!entry) throw new Error(`Unknown workspace package: ${packageName}`);
  if (!metadata.resolve) throw new Error("Cargo metadata has no dependency resolution graph");
  const graph = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const pending = [entry.id];
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = graph.get(id);
    if (!node) throw new Error(`Missing Cargo resolution node: ${id}`);
    for (const dep of node.deps)
      if (dep.dep_kinds.some((k) => k.kind === null)) pending.push(dep.pkg);
  }
  return metadata.packages.filter(
    (p) => seen.has(p.id) && metadata.workspace_members.includes(p.id),
  );
}

export async function generateHempBinary(
  workspace: string,
  packageName: string,
  binary: string,
  output: string,
  includeBodies = true,
) {
  const root = await realpath(resolve(workspace));
  const exec = promisify(execFile);
  const rustc = await exec("rustc", ["+1.94.0", "-vV"]);
  const host = /^host: (.+)$/m.exec(rustc.stdout)?.[1];
  if (!host) throw new Error("Cannot determine Rust host target");
  const { stdout } = await exec(
    "cargo",
    ["+1.94.0", "metadata", "--format-version", "1", "--filter-platform", host],
    { cwd: root, maxBuffer: 64 * 1024 * 1024 },
  );
  const metadata = JSON.parse(stdout) as CargoMetadata;
  const packages = binaryDependencyPackages(metadata, packageName);
  const entry = packages.find((p) => p.name === packageName)!;
  if (!entry.targets.some((t) => t.name === binary && t.kind.includes("bin")))
    throw new Error(`Unknown binary ${binary} in ${packageName}`);
  const roots: ItemRoot[] = [];
  for (const pkg of packages) {
    for (const target of pkg.targets.filter(
      (t) =>
        (pkg.id === entry.id && t.kind.includes("bin") && t.name === binary) ||
        t.kind.some((k) => ["lib", "rlib", "cdylib", "staticlib"].includes(k)),
    )) {
      const file = await realpath(target.src_path);
      roots.push({
        file,
        node: {
          id: `${pkg.name}:${target.kind.join(",")}:${target.name}`,
          kind: "crate",
          name: pkg.name,
          target: target.name,
          targetKind: target.kind,
          description: pkg.description ?? "",
          source: { file: relative(root, file), line: 1 },
        },
      });
    }
  }
  console.error(
    `Binary dependency scope: ${roots.length} targets in ${packages.length} workspace packages (${host})`,
  );
  console.error(packages.map((p) => p.name).join(", "));
  return generateItems(root, roots, output, true, includeBodies ? "all" : undefined, [
    `Root binary: ${packageName}/${binary}. Cargo normal-dependency workspace closure for ${host}, default features as resolved by the workspace. All inventoried source functions are included, not a proven live call graph. Third-party sources, build dependencies, dev-only dependencies and other binaries are excluded.`,
  ]);
}
const compare = (a: Position, b: Position) => a.line - b.line || a.character - b.character;
const contains = (r: Range, p: Position) => compare(r.start, p) <= 0 && compare(p, r.end) < 0;

/** Small process-local JSON-RPC client; never exposes an MCP server. */
function analyzer(root: string) {
  const child = spawn("rustup", ["run", "1.94.0", "rust-analyzer"], { cwd: root, stdio: "pipe" });
  let buffer = Buffer.alloc(0),
    serial = 0,
    stderr = "";
  let status: { quiescent: boolean; health: string; message?: string } | undefined;
  let failure: Error | undefined;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  function fail(error: Error) {
    failure = error;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  }
  function send(message: object) {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.stderr.on("data", (b) => {
    stderr = (stderr + b).slice(-8000);
  });
  child.on("exit", (code) => fail(new Error(`rust-analyzer exited (${code}): ${stderr}`)));
  child.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, end).toString())?.[1]);
      if (!Number.isFinite(length)) {
        fail(new Error("Invalid LSP frame"));
        return;
      }
      if (buffer.length < end + 4 + length) return;
      const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString());
      buffer = buffer.subarray(end + 4 + length);
      if (message.method === "experimental/serverStatus") status = message.params;
      if (message.method && message.id !== undefined) {
        if (message.method === "workspace/configuration")
          send({ id: message.id, result: message.params.items.map(() => null) });
        else send({ id: message.id, result: null });
      } else if (message.id !== undefined) {
        const p = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) p?.reject(new Error(JSON.stringify(message.error)));
        else p?.resolve(message.result);
      }
    }
  });
  async function request<T>(method: string, params: unknown): Promise<T> {
    if (failure) throw failure;
    const id = ++serial;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`LSP timeout: ${method}`));
      }, 180_000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      send({ id, method, params });
    });
  }
  return {
    request,
    notify: (method: string, params: unknown) => send({ method, params }),
    async ready() {
      const deadline = Date.now() + 180_000;
      while (!status?.quiescent) {
        if (failure) throw failure;
        if (Date.now() > deadline)
          throw new Error(`rust-analyzer workspace loading timed out: ${stderr}`);
        await new Promise((r) => setTimeout(r, 100));
      }
      if (status.health === "error")
        throw new Error(status.message || "rust-analyzer workspace failed");
      return status.health === "warning"
        ? [status.message || "rust-analyzer reports partial analysis"]
        : [];
    },
    close() {
      child.kill();
    },
  };
}

export async function generateHempItems(workspace: string, moduleFile: string, output: string) {
  const root = await realpath(resolve(workspace));
  const file = await realpath(resolve(root, moduleFile));
  const rel = relative(root, file);
  return generateItems(
    root,
    [
      {
        file,
        node: {
          id: rel,
          kind: "module",
          name: basename(file),
          description: "Module-sized semantic inventory.",
          source: { file: rel, line: 1 },
        },
      },
    ],
    output,
    false,
  );
}

/** Cargo selects actual lib/bin targets; the analyzer resolves out-of-line modules. */
export async function generateHempCrates(
  workspace: string,
  packages: string[],
  output: string,
  bodyFile?: string,
) {
  const root = await realpath(resolve(workspace));
  const { stdout } = await promisify(execFile)(
    "cargo",
    ["+1.94.0", "metadata", "--no-deps", "--format-version", "1"],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  );
  const metadata = JSON.parse(stdout) as {
    workspace_members: string[];
    packages: {
      id: string;
      name: string;
      description: string | null;
      targets: { name: string; kind: string[]; src_path: string }[];
    }[];
  };
  const roots: ItemRoot[] = [];
  for (const name of new Set(packages)) {
    const pkg = metadata.packages.find(
      (p) => p.name === name && metadata.workspace_members.includes(p.id),
    );
    if (!pkg) throw new Error(`Unknown workspace package: ${name}`);
    for (const target of pkg.targets.filter((t) =>
      t.kind.some((k) => ["lib", "bin", "rlib", "cdylib", "staticlib", "proc-macro"].includes(k)),
    )) {
      const file = await realpath(target.src_path);
      roots.push({
        file,
        node: {
          id: `${name}:${target.kind.join(",")}:${target.name}`,
          kind: "crate",
          name,
          target: target.name,
          targetKind: target.kind,
          description: pkg.description ?? "",
          source: { file: relative(root, file), line: 1 },
        },
      });
    }
  }
  if (!roots.length) throw new Error("No library/binary crate targets selected");
  return generateItems(root, roots, output, true, bodyFile);
}

async function generateItems(
  root: string,
  roots: ItemRoot[],
  output: string,
  recursive: boolean,
  bodyFile?: string,
  scopeWarnings: string[] = [],
) {
  const client = analyzer(root);
  try {
    console.error("Loading Rust semantic workspace…");
    const initialized = await client.request<{
      capabilities: { semanticTokensProvider: { legend: { tokenTypes: string[] } } };
    }>("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(root).href,
      capabilities: {
        experimental: { serverStatusNotification: true },
        textDocument: {
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          semanticTokens: {
            requests: { full: true },
            tokenTypes: [
              "namespace",
              "type",
              "struct",
              "enum",
              "interface",
              "typeParameter",
              "parameter",
              "variable",
              "property",
              "enumMember",
              "function",
              "method",
              "macro",
            ],
            tokenModifiers: [],
            formats: ["relative"],
          },
        },
      },
      initializationOptions: { checkOnSave: false, cargo: { allTargets: true } },
    });
    client.notify("initialized", {});
    const warnings = await client.ready();
    warnings.push(...scopeWarnings);
    type Unit = { uri: string; rel: string; lines: string[]; rootId: string };
    const units = new Map<string, Unit>();
    const nodes: HempNode[] = roots.map((r) => r.node);
    const entries: { node: HempNode; symbol: Symbol; depth: number; unit: Unit }[] = [];
    const definitions = new Map<string, Location[]>();
    async function definition(uri: string, position: Position) {
      const key = JSON.stringify([uri, position.line, position.character]);
      if (definitions.has(key)) return definitions.get(key)!;
      const result = locations(
        await client.request<Definition | Definition[] | null>("textDocument/definition", {
          textDocument: { uri },
          position,
        }),
      );
      definitions.set(key, result);
      return result;
    }
    async function inventory(file: string, rootId: string) {
      const uri = pathToFileURL(file).href;
      if (units.has(uri)) {
        throw new Error(`Source file belongs to multiple selected module trees: ${file}`);
      }
      const source = await readFile(file, "utf8");
      const rel = relative(root, file);
      const lines = source.split("\n");
      const unit: Unit = { uri, rel, lines, rootId };
      units.set(uri, unit);
      console.error(`Inventory: ${rel}`);
      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "rust", version: 1, text: source },
      });
      const symbols = await client.request<Symbol[] | null>("textDocument/documentSymbol", {
        textDocument: { uri },
      });
      if (!symbols) throw new Error(`No Rust outline available for ${rel}`);
      const kinds: Record<number, HempNode["kind"]> = {
        2: "module",
        5: "struct",
        6: "method",
        8: "field",
        10: "enum",
        11: "trait",
        12: "function",
        13: "static",
        14: "constant",
        22: "variant",
        23: "struct",
        26: "type",
      };
      async function visit(items: Symbol[], parent: string, depth: number) {
        for (const s of items) {
          const prefix = lines
            .slice(s.range.start.line, s.selectionRange.start.line + 1)
            .join("\n");
          const declaration = lines[s.selectionRange.start.line].slice(
            0,
            s.selectionRange.start.character,
          );
          const kind = /\bstatic\s+(mut\s+)?$/.test(declaration)
            ? "static"
            : /\bimpl\b/.test(s.name)
              ? "impl"
              : /\bmacro_rules!/.test(prefix)
                ? "macro"
                : (kinds[s.kind] ?? "item");
          const base = `${parent}::${kind}:${s.name}`;
          const id = nodes.some((n) => n.id === base)
            ? `${base}@${s.selectionRange.start.line + 1}`
            : base;
          const node: HempNode = {
            id,
            name: s.name,
            kind,
            parent,
            description: s.detail ?? "",
            source: {
              file: rel,
              line: s.selectionRange.start.line + 1,
              column: s.selectionRange.start.character + 1,
            },
          };
          nodes.push(node);
          entries.push({ node, symbol: s, depth, unit });
          await visit(s.children ?? [], id, depth + 1);
          if (
            recursive &&
            kind === "module" &&
            lines[s.range.end.line].slice(0, s.range.end.character).trimEnd().endsWith(";")
          ) {
            const targets = await definition(uri, s.selectionRange.start);
            const external = targets.find((t) => t.uri !== uri && t.uri.startsWith("file:"));
            if (external) await inventory(await realpath(fileURLToPath(external.uri)), id);
            else
              warnings.push(
                `Unresolved or inactive module body: ${rel}:${node.source.line} (${s.name})`,
              );
          }
        }
      }
      await visit(symbols, rootId, 1);
    }
    for (const entry of roots) await inventory(entry.file, entry.node.id);
    const bodyEntries: {
      node: HempNode;
      range: Range;
      target?: Position;
      unit: Unit;
      depth: number;
    }[] = [];
    if (bodyFile) {
      const selectedUnits =
        bodyFile === "all"
          ? [...units.values()]
          : [units.get(pathToFileURL(await realpath(resolve(root, bodyFile))).href)];
      for (const unit of selectedUnits) {
        if (!unit) throw new Error(`Body source is outside selected crate inventory: ${bodyFile}`);
        const file = fileURLToPath(unit.uri);
        const manifest = fileURLToPath(new URL("../tools/hemp-rust/Cargo.toml", import.meta.url));
        const { stdout } = await promisify(execFile)(
          "cargo",
          [
            "+1.94.0",
            "run",
            "--quiet",
            "--manifest-path",
            manifest,
            "--bin",
            "bodies",
            "--",
            file,
            ...(bodyFile === "all" ? [] : ["main", "run"]),
          ],
          { maxBuffer: 16 * 1024 * 1024 },
        );
        const bodies = JSON.parse(stdout) as {
          name: string;
          position: Position;
          nodes: {
            id: string;
            parent: string;
            kind: HempNode["kind"];
            name: string;
            range: Range;
            target?: Position;
          }[];
        }[];
        // proc-macro2 columns are Unicode scalar offsets; LSP positions use UTF-16.
        const lsp = (p: Position): Position => ({
          line: p.line,
          character: Array.from(unit.lines[p.line] ?? "")
            .slice(0, p.character)
            .join("").length,
        });
        for (const body of bodies) {
          const owner = entries.find(
            (e) =>
              e.unit === unit &&
              (e.node.kind === "function" || e.node.kind === "method") &&
              contains(e.symbol.selectionRange, lsp(body.position)),
          );
          if (!owner) continue;
          const ids = new Map([["function", owner.node.id]]);
          const depths = new Map([["function", owner.depth]]);
          for (const b of body.nodes) {
            const id = `${owner.node.id}::body:${b.id}`;
            const r = { start: lsp(b.range.start), end: lsp(b.range.end) };
            const depth = depths.get(b.parent)! + 1;
            const node: HempNode = {
              id,
              parent: ids.get(b.parent)!,
              kind: b.kind,
              name: b.name,
              description: `Source structure, not an execution trace.\n\n\`\`\`rust\n${unit.lines.slice(r.start.line, r.end.line + 1).join("\n")}\n\`\`\``,
              source: {
                file: unit.rel,
                line: r.start.line + 1,
                column: r.start.character + 1,
                endLine: r.end.line + 1,
                endColumn: r.end.character + 1,
              },
            };
            nodes.push(node);
            bodyEntries.push({
              node,
              range: r,
              target: b.target ? lsp(b.target) : undefined,
              unit,
              depth,
            });
            ids.set(b.id, id);
            depths.set(b.id, depth);
          }
        }
      }
      bodyEntries.sort((a, b) => b.depth - a.depth);
      warnings.push(
        `Function-body preview covers ${bodyFile === "all" ? "inventoried functions and methods in all selected source files" : "main and run in the selected file"}: matches, arms, if/else, closures and calls. No complete sequencing, loop/exit/async control flow, macro expansion, or runtime dispatch. Body IDs are traversal-based and can change after edits.`,
      );
    }
    function targetNode(def: Location) {
      const unit = units.get(def.uri);
      if (!unit) return undefined;
      return (
        entries.find((e) => e.unit === unit && contains(e.symbol.selectionRange, def.range.start))
          ?.node ??
        (def.range.start.line === 0 && def.range.start.character === 0
          ? nodes.find((n) => n.id === unit.rootId)
          : undefined)
      );
    }
    const owners = [...entries].sort((a, b) => b.depth - a.depth);
    const edges = new Map<string, HempDependency>();
    function addReference(node: HempNode, position: Position, unit: Unit) {
      const owner = owners.find((e) => e.unit === unit && contains(e.symbol.range, position));
      const body = bodyEntries.find((e) => e.unit === unit && contains(e.range, position));
      const from = body?.node.id ?? owner?.node.id ?? unit.rootId;
      const kind =
        body?.node.kind === "call" &&
        body.target &&
        compare(body.target, position) === 0 &&
        ["function", "method"].includes(node.kind)
          ? "call"
          : "reference";
      const key = JSON.stringify([from, node.id, kind]);
      const edge = edges.get(key) ?? { from, to: node.id, kind, evidence: [] };
      const evidence = {
        file: unit.rel,
        line: position.line + 1,
        column: position.character + 1,
        text: unit.lines[position.line]?.trim() ?? "",
      };
      if (!edge.evidence.some((e) => e.file === evidence.file && e.line === evidence.line))
        edge.evidence.push(evidence);
      edges.set(key, edge);
    }
    let outside = 0;
    for (const {
      node,
      symbol,
      unit: { uri },
    } of entries) {
      console.error(`References: ${node.name}`);
      const position = symbol.selectionRange.start;
      const hover = await client.request<{ contents?: { value?: string } } | null>(
        "textDocument/hover",
        { textDocument: { uri }, position },
      );
      if (hover?.contents?.value) node.description = hover.contents.value;
      if (node.kind === "impl") continue;
      const references =
        (await client.request<Location[] | null>("textDocument/references", {
          textDocument: { uri },
          position,
          context: { includeDeclaration: false },
        })) ?? [];
      for (const ref of references) {
        const sourceUnit = units.get(ref.uri);
        if (!sourceUnit) {
          outside++;
          continue;
        }
        // Reference search can conflate trait associated items with implementations.
        // A use belongs to the definition it resolves to, not every related symbol.
        if (
          entries.some(
            (e) => e.unit === sourceUnit && contains(e.symbol.selectionRange, ref.range.start),
          )
        )
          continue;
        const resolved = await definition(ref.uri, ref.range.start);
        if (resolved.length && !resolved.some((d) => targetNode(d)?.id === node.id)) continue;
        addReference(node, ref.range.start, sourceUnit);
      }
    }
    // Find-references stops at renamed imports. Resolve semantic identifier tokens
    // back to their definitions as well; this follows aliases without name matching.
    console.error("Resolving identifier definitions…");
    for (const unit of units.values()) {
      const { uri } = unit;
      console.error(`Definitions: ${unit.rel}`);
      const tokens = await client.request<{ data: number[] } | null>(
        "textDocument/semanticTokens/full",
        { textDocument: { uri } },
      );
      let line = 0,
        character = 0;
      const legend = initialized.capabilities.semanticTokensProvider.legend.tokenTypes;
      for (let i = 0; i < (tokens?.data.length ?? 0); i += 5) {
        const [dl, dc, , type] = tokens!.data.slice(i, i + 5);
        line += dl;
        character = dl ? dc : character + dc;
        if (
          ![
            "namespace",
            "type",
            "typeAlias",
            "struct",
            "enum",
            "interface",
            "variable",
            "const",
            "static",
            "selfTypeKeyword",
            "property",
            "enumMember",
            "function",
            "method",
            "macro",
          ].includes(legend[type])
        )
          continue;
        const position = { line, character };
        if (entries.some((e) => e.unit === unit && contains(e.symbol.selectionRange, position)))
          continue;
        for (const def of await definition(uri, position)) {
          const node = targetNode(def);
          if (node) addReference(node, position, unit);
        }
      }
    }
    warnings.push(
      recursive
        ? "Selected library/binary crate targets and analyzer-resolved module bodies only. Standalone integration tests, examples, build scripts and external dependency definitions are not inventoried."
        : "One source file plus inline modules only. External module bodies are not inventoried.",
      "Macro-generated declarations, locals and closure identities are not fully inventoried. References are not calls or runtime observations.",
      `${outside} reference locations outside the selected source files were excluded. External dependency definitions are not included.`,
      "Uses rust-analyzer's active default Cargo configuration (including test targets); this is not a union of all feature configurations. An empty reference list is not proof that an item is unused.",
    );
    // Semantic work is finished; release the analyzer before layout/serialization.
    client.close();
    console.error(`Arranging ${nodes.length} nodes and ${edges.size} reference edges…`);
    const parentIds = new Set(nodes.flatMap((n) => (n.parent ? [n.parent] : [])));
    let doc: HempDocument = {
      version: 1,
      projection: "items",
      name: `${basename(root)} · ${roots.map((r) => (recursive ? `${r.node.name} (${r.node.targetKind?.join(",")})` : r.node.source.file)).join(" + ")}`,
      analysis: {
        sourceRoot: root,
        method:
          "rust-analyzer 1.94.0 documentSymbol + references + semantic token definitions" +
          (bodyFile ? " + syn function-body syntax" : ""),
        scope: roots.map((r) => r.node.source.file).join(", "),
        warnings,
      },
      nodes,
      dependencies: [...edges.values()],
      views: {},
      ...(bodyFile
        ? {
            unplacedContainers: nodes.filter((n) => parentIds.has(n.id)).map((n) => n.id),
          }
        : {}),
      ...(recursive
        ? {
            collapsed: nodes
              .filter((n) => n.kind === "module" || parentIds.has(n.id))
              .map((n) => n.id),
          }
        : {}),
    };
    doc = arrangeHemp(doc);
    try {
      const old = parseHempDocument(await readFile(output, "utf8"));
      const ids = new Set(nodes.map((n) => n.id));
      if (old.collapsed) doc.collapsed = old.collapsed.filter((id) => ids.has(id));
      doc.unplacedContainers = doc.unplacedContainers?.filter(
        (id) => !old.nodes.some((n) => n.id === id) || old.unplacedContainers?.includes(id),
      );
      // Flat legacy coordinates are not local coordinates inside the new frames.
      if (old.containers) {
        for (const [scope, positions] of Object.entries(old.views)) {
          if (scope !== "workspace" && !ids.has(scope)) continue;
          doc.views[scope] = {
            ...doc.views[scope],
            ...Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id))),
          };
        }
        for (const [id, rect] of Object.entries(old.containers)) {
          if (doc.containers?.[id]) doc.containers[id] = rect;
        }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    parseHempDocument(JSON.stringify(doc));
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(output, JSON.stringify(doc, null, 2) + "\n");
    return doc;
  } finally {
    client.close();
  }
}
