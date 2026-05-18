import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

const toneMap: Record<string, JSX.CSSProperties> = {
  default: { background: '#fff', border: '1px solid #d0d0d0' },
  muted: { background: '#f5f5f5', border: '1px solid #e0e0e0' },
  accent: { background: '#eff6ff', border: '1px solid #93c5fd' },
  danger: { background: '#fef2f2', border: '1px solid #fca5a5' },
};

// Shape is applied via CSS — exactness is 02b polish; prop accepted and applied.
const shapeMap: Record<string, JSX.CSSProperties> = {
  rectangle: { 'border-radius': '6px' },
  pill: { 'border-radius': '9999px' },
  diamond: { transform: 'rotate(45deg)' },
  ellipse: { 'border-radius': '50%' },
  hexagon: { 'clip-path': 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' },
};

export default function Card(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  children: () => JSX.Element,
): JSX.Element {
  const tone = String(props['tone'] ?? 'default');
  const shape = String(props['shape'] ?? 'rectangle');
  const padding = props['padding'] != null ? `${props['padding']}px` : '8px 12px';

  const color = props['color'];
  const style: JSX.CSSProperties = {
    ...(toneMap[tone] ?? toneMap['default']),
    ...(shapeMap[shape] ?? shapeMap['rectangle']),
    padding,
    'box-sizing': 'border-box',
    ...(typeof color === 'string' && color !== '' ? { border: `1px solid ${color}` } : {}),
  };

  return <div style={style}>{children()}</div>;
}
