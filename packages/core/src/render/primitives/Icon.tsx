import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

// Minimal inline-SVG icon set (~8 common icons). Not an exhaustive library.
// Unknown names render as a small placeholder square.
const iconPaths: Record<string, string> = {
  check: 'M4 12l5 5 9-9',
  warning: 'M12 2L2 20h20L12 2zm0 6v6m0 2v2',
  info: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 4v6m0 4v2',
  close: 'M6 6l12 12M6 18L18 6',
  'arrow-right': 'M5 12h14m-6-6 6 6-6 6',
  'arrow-left': 'M19 12H5m6 6-6-6 6-6',
  'external-link': 'M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4m-6-4 6-6m0 0h-6m6 0v6',
  code: 'M8 6l-4 6 4 6m8-12 4 6-4 6',
};

export default function Icon(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const name = String(props['name'] ?? '');
  const size = Number(props['size'] ?? 16);
  const d = iconPaths[name];

  const style: JSX.CSSProperties = {
    display: 'inline-block',
    width: `${size}px`,
    height: `${size}px`,
    'flex-shrink': '0',
  };

  if (!d) {
    // Placeholder for unknown icon names
    return (
      <span
        style={{
          ...style,
          background: 'var(--cactus-grid-dot, #d1d5db)',
          'border-radius': '2px',
          'vertical-align': 'middle',
        }}
        title={name}
      />
    );
  }

  return (
    <svg
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-label={name}
    >
      <path d={d} />
    </svg>
  );
}
