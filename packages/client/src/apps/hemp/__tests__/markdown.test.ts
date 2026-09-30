import { expect, it } from "vitest";
import { hempMarkdown } from "../markdown";

it("renders headings, code, and GFM tables from source documentation", () => {
  const html = hempMarkdown(
    "## Configuration\n\n| Variable | Default |\n| --- | --- |\n| `PORT` | 4080 |",
  );
  expect(html).toContain("<h2>Configuration</h2>");
  expect(html).toContain("<table>");
  expect(html).toContain("<code>PORT</code>");
});
it("keeps embedded source HTML and unsafe links inert", () => {
  const html = hempMarkdown(
    "<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n[good](https://example.com)",
  );
  expect(html).not.toContain("<script>");
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain('href="https://example.com"');
});
