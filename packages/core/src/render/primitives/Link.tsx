import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

export default function Link(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const value = String(props['value'] ?? '');
  const target = props['target'] as string | undefined;
  // onClick is resolved by the interpreter (INSPECT → ctx.inspect);
  // non-special targets fall through here as a plain anchor.
  const onClick = props['onClick'] as (() => void) | undefined;

  const style: JSX.CSSProperties = {
    color: '#3b82f6',
    'text-decoration': 'underline',
    cursor: 'pointer',
    'font-size': '12px',
  };

  function handleClick(e: MouseEvent): void {
    e.preventDefault();
    if (onClick) {
      onClick();
    } else if (target) {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <a
      href={target ?? '#'}
      style={style}
      onClick={handleClick}
      rel="noopener noreferrer"
    >
      {value}
    </a>
  );
}
