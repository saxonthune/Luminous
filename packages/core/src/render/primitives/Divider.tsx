import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

export default function Divider(
  _props: Record<string, unknown>,
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const style: JSX.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '1px',
    background: 'var(--cactus-border, #e5e7eb)',
    border: 'none',
    margin: '4px 0',
  };
  return <hr style={style} />;
}
