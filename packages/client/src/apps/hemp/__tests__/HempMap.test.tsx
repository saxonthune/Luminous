import { expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { readFileSync } from "node:fs";
import { parseHempMap } from "@luminous/core/hemp";
import { HempMapView } from "../HempMap";

it("search focuses a fixed item, dims unrelated items and fetches function chunks", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const doc = parseHempMap(readFileSync("../../.luminous/function-map.hemp2.json", "utf8"));
  const focusItem = doc.items.find((n) => n.name === "process_command")!;
  focusItem.description =
    "## Documentation\n\n| Input | Meaning |\n| --- | --- |\n| command | Work to perform |";
  const unrelated = doc.items.find((n) => n.name === "main")!;
  doc.layout[unrelated.id] = {
    ...doc.layout[unrelated.id],
    x: doc.layout[focusItem.id].x + 100,
    y: doc.layout[focusItem.id].y + 500,
  };
  const fetcher = vi.fn(async (url: string) => {
    const path = decodeURIComponent(url.replace("/api/document/", ""));
    return { ok: true, json: async () => JSON.parse(readFileSync(`../../${path}`, "utf8")) };
  });
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(
    () => <HempMapView doc={doc} sourceId=".luminous/function-map.hemp2.json" />,
    host,
  );
  try {
    const input = host.querySelector("input")!;
    input.value = "process_command";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host.querySelector(".hemp-map-results")?.textContent).toContain("process_command");
    host.querySelector<HTMLButtonElement>(".hemp-map-results button")!.click();
    await vi.waitFor(() =>
      expect(host.querySelector(".hemp-map-selected")?.textContent).toContain("process_command"),
    );
    await vi.waitFor(() =>
      expect(host.querySelectorAll("[data-part-id]").length).toBeGreaterThan(0),
    );
    expect(fetcher).toHaveBeenCalled();
    const sidebar = host.querySelector('aside[aria-label="Item details"]')!;
    expect(sidebar.textContent).toContain("process_command");
    expect(sidebar.querySelector("table")).not.toBeNull();
    for (const editor of ["vscode", "zed"]) {
      const href = sidebar.querySelector(`a[href^="${editor}:"]`)?.getAttribute("href");
      expect(href).toContain("examples/function_board.rs:");
      expect(href).toContain(`:${focusItem.source.line}:`);
    }
    expect(host.querySelectorAll(".hemp-map-dim").length).toBeGreaterThan(0);
    const fn = doc.items.find((n) => n.name === "process_command")!;
    const selected = host.querySelector<HTMLElement>(".hemp-map-selected")!;
    const originalLeft = selected.style.left;
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Clear focus")!.click();
    expect(host.querySelectorAll(".hemp-map-dim")).toHaveLength(0);
    expect(host.querySelector<HTMLElement>(`[data-map-item="${fn.id}"]`)!.style.left).toBe(
      originalLeft,
    );
    const beforeZoom = host.querySelectorAll(`[data-map-item="${fn.id}"] [data-part-id]`).length;
    const panSurface = host.querySelector("[data-pan-surface]")!;
    panSurface.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 4000,
        clientX: 100,
        clientY: 100,
      }),
    );
    await vi.waitFor(() =>
      expect(host.querySelectorAll("[data-map-item]").length).toBe(doc.items.length),
    );
    expect(host.querySelectorAll(`[data-map-item="${fn.id}"] [data-part-id]`).length).toBe(
      beforeZoom,
    );
  } finally {
    dispose();
    host.remove();
    vi.unstubAllGlobals();
  }
});
