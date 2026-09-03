/**
 * Reusable route geometry: spreading a group of edges that share one crossing so
 * they read as distinct lines rather than a single converging pencil.
 *
 * Domain-agnostic — no knowledge of ports, containers, or packs. A host decides
 * which edges share a crossing; this does the spacing.
 */

/**
 * Centered fan-out offsets: `count` evenly spaced values summing to zero, so a
 * group of edges through one shared crossing spreads symmetrically about it.
 * `fanOffsets(1)` is `[0]`; `fanOffsets(3, 10)` is `[-10, 0, 10]`.
 */
export function fanOffsets(count: number, spacing: number): number[] {
  const center = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => (i - center) * spacing);
}
