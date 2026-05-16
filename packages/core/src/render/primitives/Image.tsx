import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

export default function Image(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const src = String(props['src'] ?? '');
  const alt = String(props['alt'] ?? '');

  const style: JSX.CSSProperties = {
    display: 'block',
    'max-width': '100%',
    height: 'auto',
    'border-radius': '4px',
  };

  return <img src={src} alt={alt} style={style} />;
}
