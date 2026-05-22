import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';
import { useOverflowInspect } from '../useOverflowInspect.ts';

const CLAMP_STYLE: JSX.CSSProperties = {
  display: '-webkit-box',
  '-webkit-box-orient': 'vertical',
  overflow: 'hidden',
  'text-overflow': 'ellipsis',
};

export default function Clamp(
  props: Record<string, unknown>,
  ctx: RenderContext,
  children: () => JSX.Element,
): JSX.Element {
  const lines = Number(props['lines'] ?? 3);

  if (ctx.expanded?.()) {
    return <div>{children()}</div>;
  }

  const { overflowed, setRef, onMouseDown, onClick } = useOverflowInspect(ctx);

  return (
    <div
      ref={setRef}
      style={{
        ...CLAMP_STYLE,
        '-webkit-line-clamp': String(lines),
        'line-clamp': String(lines),
        ...(overflowed() ? { cursor: 'pointer' } : {}),
      }}
      title={overflowed() ? 'Click to expand' : undefined}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children()}
    </div>
  );
}
