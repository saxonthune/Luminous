import { describe, expect, it } from "vitest";
import {
  arrangeHemp,
  hempItemContainers,
  hempNodeSize,
  hempProjection,
  moveHempNode,
  parseHempDocument,
  type HempDocument,
} from "../src/hemp/index.ts";

function fixture(): HempDocument {
  return {
    version: 1,
    name: "test",
    analysis: { method: "fixture", scope: "fixture", warnings: [] },
    views: {},
    nodes: [
      {
        id: "cli",
        name: "cli",
        kind: "crate",
        description: "",
        source: { file: "cli.rs", line: 1 },
      },
      {
        id: "lib",
        name: "lib",
        kind: "crate",
        description: "",
        source: { file: "lib.rs", line: 1 },
      },
      {
        id: "cli::command",
        name: "command",
        kind: "module",
        parent: "cli",
        description: "",
        source: { file: "command.rs", line: 1 },
      },
    ],
    dependencies: [
      {
        from: "cli::command",
        to: "lib",
        kind: "import",
        evidence: [{ file: "command.rs", line: 2, text: "use lib" }],
      },
    ],
  };
}
describe("Hemp projection and persistence", () => {
  it("collects hidden references at visible owners and restores their exact endpoints", () => {
    const doc: HempDocument = {
      version: 1,
      projection: "items",
      name: "two modules",
      views: {},
      analysis: { method: "fixture", scope: "", warnings: [] },
      nodes: [
        { id: "orders", kind: "module" },
        { id: "pricing", kind: "module" },
        { id: "checkout", kind: "function", parent: "orders" },
        { id: "quote", kind: "function", parent: "orders" },
        { id: "price", kind: "constant", parent: "pricing" },
        { id: "subtotal", kind: "function", parent: "pricing" },
      ].map((n) => ({
        ...n,
        kind: n.kind as HempDocument["nodes"][number]["kind"],
        name: n.id,
        description: "",
        source: { file: "demo.rs", line: 1 },
      })),
      dependencies: [
        ["checkout", "price"],
        ["quote", "price"],
        ["subtotal", "price"],
      ].map(([from, to]) => ({ from, to, kind: "reference", evidence: [] })),
    };
    const original = JSON.stringify(doc.dependencies);
    const closed = hempProjection({ ...doc, collapsed: ["orders", "pricing"] });
    expect(closed.nodes.map((n) => n.id)).toEqual(["orders", "pricing"]);
    expect(closed.edges).toHaveLength(1);
    expect(closed.edges[0]).toMatchObject({ from: "orders", to: "pricing" });
    expect(closed.edges[0].evidence).toHaveLength(2);
    const half = hempProjection({ ...doc, collapsed: ["pricing"] });
    expect(half.edges.map((e) => [e.from, e.to])).toEqual([
      ["checkout", "pricing"],
      ["quote", "pricing"],
    ]);
    expect(hempProjection({ ...doc, collapsed: [] }).edges).toHaveLength(3);
    expect(JSON.stringify(doc.dependencies)).toBe(original);
    expect(parseHempDocument(JSON.stringify({ ...doc, collapsed: ["pricing"] })).collapsed).toEqual(
      ["pricing"],
    );
  });
  it("separates owner cards from their contents and preserves saved container geometry", () => {
    const doc = fixture();
    doc.projection = "items";
    doc.nodes[0].kind = "module";
    doc.nodes[1].kind = "constant";
    doc.nodes[1].parent = "cli";
    const next = hempItemContainers(doc);
    expect(Object.keys(next.views.workspace)).toEqual(["cli"]);
    expect(Object.keys(next.views.cli).sort()).toEqual(["cli::command", "lib"]);
    expect(next.containers!["cli::command"]).toBeDefined();
    for (const [id, p] of Object.entries(next.views.cli)) {
      const dimensions = hempNodeSize(next.nodes.find((n) => n.id === id)!);
      expect(p.x).toBeGreaterThanOrEqual(16);
      expect(p.y).toBeGreaterThanOrEqual(48);
      expect(p.x + dimensions.width).toBeLessThan(next.containers!.cli.width);
      expect(p.y + dimensions.height).toBeLessThan(next.containers!.cli.height);
    }
    next.containers!.cli.x += 123;
    next.containers!.cli.width += 100;
    next.views.cli.lib.x += 10;
    expect(hempItemContainers(next)).toBe(next);
    expect(hempItemContainers(parseHempDocument(JSON.stringify(next)))).toEqual(next);
  });
  it("lifts module dependencies to crates and places consumers left of dependencies", () => {
    const doc = fixture();
    expect(hempProjection(doc).edges[0]).toMatchObject({ from: "cli", to: "lib" });
    const next = arrangeHemp(doc);
    expect(next.views.workspace.cli.x).toBeLessThan(next.views.workspace.lib.x);
    expect(doc.views).toEqual({});
  });
  it("defers global placement of hidden body frames while retaining their local layouts", () => {
    const doc = fixture();
    doc.projection = "items";
    doc.collapsed = ["cli", "cli::command"];
    doc.unplacedContainers = ["cli", "cli::command"];
    const next = arrangeHemp(doc);
    expect(next.containers!.cli).toMatchObject({ x: 0, y: 0 });
    expect(next.views.cli["cli::command"]).toBeDefined();
    expect(next.views.workspace.cli.x).toBeLessThan(next.views.workspace.lib.x);
    expect(next.unplacedContainers).toEqual(doc.unplacedContainers);
    expect(hempItemContainers(next)).toBe(next);
  });
  it("keeps per-view positions and dependency evidence through serialization", () => {
    const doc = moveHempNode(arrangeHemp(fixture()), "cli", "cli::command", 501, -30);
    const next = parseHempDocument(JSON.stringify(doc));
    expect(next.views.cli["cli::command"]).toEqual({ x: 501, y: -30 });
    expect(next.views.workspace).toEqual(doc.views.workspace);
    expect(next.dependencies).toEqual(fixture().dependencies);
  });
  it("rejects cyclic containment and dangling dependencies before traversal", () => {
    const doc = fixture();
    doc.nodes[0].parent = "cli::command";
    expect(() => parseHempDocument(JSON.stringify(doc))).toThrow("Cyclic");
    const broken = fixture();
    broken.dependencies[0].to = "missing";
    expect(() => parseHempDocument(JSON.stringify(broken))).toThrow("dependency");
  });
});
