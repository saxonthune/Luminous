import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  arrangeHemp,
  parseHempDocument,
  type HempDocument,
} from "../packages/core/src/hemp/index.ts";

export async function generateHemp(workspace: string, output: string): Promise<HempDocument> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = resolve(workspace, "Cargo.toml");
  await access(manifest).catch((error) => {
    throw new Error(`Cannot access workspace manifest ${manifest}: ${error.message}`);
  });
  const result = spawnSync(
    "cargo",
    [
      "+1.94.0",
      "run",
      "--quiet",
      "--locked",
      "--manifest-path",
      resolve(root, "tools/hemp-rust/Cargo.toml"),
      "--",
      manifest,
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, RUSTUP_TOOLCHAIN: "1.94.0" },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Rust inventory failed for ${manifest}:\n${result.stderr.trim()}`);
  let doc = parseHempDocument(result.stdout);
  doc.name = basename(resolve(workspace));
  try {
    const old = parseHempDocument(await readFile(output, "utf8"));
    const ids = new Set(doc.nodes.map((n) => n.id));
    doc.containers = Object.fromEntries(
      Object.entries(old.containers ?? {}).filter(([id]) => ids.has(id)),
    );
    doc.views = Object.fromEntries(
      Object.entries(old.views)
        .filter(([scope]) => scope === "workspace" || ids.has(scope))
        .map(([scope, positions]) => [
          scope,
          Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id))),
        ]),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!doc.views.workspace) doc = arrangeHemp(doc);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(doc, null, 2) + "\n");
  return doc;
}
