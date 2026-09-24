import { expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { readFileSync } from "node:fs";
import { parseHempDocument, functionParts } from "@luminous/core/hemp";
import { FunctionBoard } from "../FunctionBoard";

it("renders every generated part without disclosure or node movement", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const doc = parseHempDocument(readFileSync("../../.luminous/function-study.hemp.json", "utf8"));
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <FunctionBoard doc={doc} info={doc.functionInfo!} />, host);
  try {
    expect(host.querySelectorAll("[data-part-id]").length).toBe(
      functionParts(doc.functionInfo!.body).length,
    );
    expect(host.querySelectorAll("[data-node-id]").length).toBe(0);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Fit function",
      "100%",
    ]);
    expect(host.textContent).toContain("DEFAULT_LIMIT");
    expect(host.textContent).toContain("deferred body");
  } finally {
    dispose();
    host.remove();
    vi.unstubAllGlobals();
  }
});
