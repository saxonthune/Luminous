import type { JSX } from 'solid-js';
import type { Transform } from './useViewport.js';

export interface CrossGridProps {
  transform: Transform;
  patternId?: string;
  spacing?: number;
  strokeColor?: string;
  strokeWidth?: number;
  crossSize?: number;
  backgroundColor?: string;
  rotation?: number;
}

export function CrossGrid(props: CrossGridProps): JSX.Element {
  const patternId = () => props.patternId ?? 'cross-grid';
  const spacing = () => props.spacing ?? 40;
  const strokeColor = () => props.strokeColor ?? 'var(--cactus-grid-dot, #d1d5db)';
  const sw = () => props.strokeWidth ?? 1.2;
  const crossSize = () => props.crossSize ?? 18;
  const backgroundColor = () => props.backgroundColor ?? 'transparent';
  const rotation = () => props.rotation ?? 0;

  const half = () => crossSize() / 2;
  const c1 = () => spacing() * 0.25;
  const c2 = () => spacing() * 0.75;
  const rotateStr = () => rotation() ? ` rotate(${rotation()})` : '';

  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: '0', "pointer-events": 'none' }}
    >
      <defs>
        <pattern
          id={patternId()}
          width={spacing()}
          height={spacing()}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${props.transform.x}, ${props.transform.y}) scale(${props.transform.k})${rotateStr()}`}
        >
          <line x1={c1()} y1={c1() - half()} x2={c1()} y2={c1() + half()}
                stroke={strokeColor()} stroke-width={sw()} stroke-linecap="round" opacity="0.15" />
          <line x1={c1() - half()} y1={c1()} x2={c1() + half()} y2={c1()}
                stroke={strokeColor()} stroke-width={sw()} stroke-linecap="round" opacity="0.15" />
          <line x1={c2()} y1={c2() - half()} x2={c2()} y2={c2() + half()}
                stroke={strokeColor()} stroke-width={sw()} stroke-linecap="round" opacity="0.15" />
          <line x1={c2() - half()} y1={c2()} x2={c2() + half()} y2={c2()}
                stroke={strokeColor()} stroke-width={sw()} stroke-linecap="round" opacity="0.15" />
        </pattern>
      </defs>
      {backgroundColor() !== 'transparent' && (
        <rect width="100%" height="100%" fill={backgroundColor()} />
      )}
      <rect width="100%" height="100%" fill={`url(#${patternId()})`} />
    </svg>
  );
}
