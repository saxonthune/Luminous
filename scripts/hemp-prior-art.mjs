// Local prior-art workbench. Tools and generated artifacts are gitignored.
// cargo-arc: https://github.com/seflue/cargo-arc
// cargo-modules: https://github.com/regexident/cargo-modules
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tools = join(root, ".hemp-tools");
const output = join(root, ".hemp-prior-art");
const specimen = join(root, "braincrawl");
const toolchain = "1.94.0";
const action = process.argv[2];
const packageName = process.argv[3] ?? "braincrawl-core";

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      RUSTUP_TOOLCHAIN: toolchain,
      CARGO_TARGET_DIR: join(tools, "target"),
      NO_COLOR: "1",
    },
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
}

function linkSpecimen() {
  const expected = resolve(root, "../braincrawl");
  if (!existsSync(join(expected, "Cargo.toml")))
    throw new Error("Expected ../braincrawl/Cargo.toml");
  let existing;
  try {
    existing = lstatSync(specimen);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!existing) symlinkSync("../braincrawl", specimen, "dir");
  else if (!existing.isSymbolicLink() || realpathSync(specimen) !== realpathSync(expected)) {
    throw new Error(
      "braincrawl already exists and is not the expected symlink; leaving it untouched.",
    );
  }
}

function arcBinary() {
  const local = join(tools, "bin/cargo-arc");
  return existsSync(local) ? local : "cargo-arc";
}

function generateArc() {
  run(arcBinary(), [
    "arc",
    "--manifest-path",
    join(specimen, "Cargo.toml"),
    "--no-volatility",
    "--expand-level",
    "0",
    "--output",
    join(output, "braincrawl-arc.svg"),
  ]);
  console.log(`Interactive workspace diagram: ${join(output, "braincrawl-arc.svg")}`);
}

try {
  if (!["setup", "arc", "generate"].includes(action))
    throw new Error("Use setup, arc, or generate [library-package].");
  if (!/^[a-zA-Z0-9_-]+$/.test(packageName)) throw new Error("Expected a Cargo package name.");
  linkSpecimen();
  mkdirSync(output, { recursive: true });
  if (action === "setup") {
    run("rustup", [
      "toolchain",
      "install",
      toolchain,
      "--profile",
      "minimal",
      "--component",
      "rust-src",
    ]);
    run("cargo", [
      "install",
      "cargo-modules",
      "--version",
      "0.26.0",
      "--locked",
      "--root",
      tools,
      "--jobs",
      "4",
    ]);
    const arc = spawnSync(arcBinary(), ["--version"], { encoding: "utf8" });
    if (arc.status !== 0)
      run("cargo", [
        "install",
        "cargo-arc",
        "--version",
        "0.5.0",
        "--locked",
        "--root",
        tools,
        "--jobs",
        "4",
      ]);
    run("npm", [
      "install",
      "--prefix",
      tools,
      "--no-save",
      "--package-lock=false",
      "@viz-js/viz@3.30.0",
    ]);
    console.log("Ready. Run just hemp-prior-art.");
  } else {
    generateArc();
    if (action === "generate") {
      const binary = join(tools, "bin/cargo-modules");
      if (!existsSync(binary)) throw new Error("Run just hemp-prior-art-setup first.");
      const common = [
        "--manifest-path",
        join(specimen, "Cargo.toml"),
        "--package",
        packageName,
        "--lib",
      ];
      const structure = run(binary, ["structure", ...common], true);
      writeFileSync(join(output, `${packageName}-structure.txt`), structure);
      const dot = run(
        binary,
        ["dependencies", ...common, "--no-externs", "--no-fns", "--no-traits", "--no-types"],
        true,
      );
      writeFileSync(join(output, `${packageName}-modules.dot`), dot);
      const { instance } = await import(
        pathToFileURL(join(tools, "node_modules/@viz-js/viz/dist/viz.js")).href
      );
      const viz = await instance();
      writeFileSync(
        join(output, `${packageName}-modules.svg`),
        viz.renderString(dot, { format: "svg", engine: "dot" }),
      );
      writeFileSync(
        join(output, "index.html"),
        `<!doctype html>
<meta charset="utf-8"><title>Hemp prior art — braincrawl</title>
<h1>Hemp prior art — braincrawl</h1>
<ul>
<li><a href="braincrawl-arc.svg">cargo-arc: interactive workspace diagram</a> — expand crates and select dependencies.</li>
<li><a href="${packageName}-modules.svg">cargo-modules: ${packageName} module graph</a></li>
<li><a href="${packageName}-structure.txt">cargo-modules: ${packageName} item hierarchy</a></li>
<li><a href="${packageName}-modules.dot">Graphviz source</a></li>
</ul>
<p>cargo-arc follows imports and has cfg/macro limitations. cargo-modules uses Rust analysis for the default features and host target. Neither diagram is an execution trace.</p>
<p>Regenerate after source changes with <code>just hemp-prior-art ${packageName}</code>.</p>
`,
      );
      console.log(`Open ${join(output, "index.html")} in a browser.`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
