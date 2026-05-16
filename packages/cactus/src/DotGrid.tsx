import type { JSX } from 'solid-js';
import type { Transform } from './useViewport.js';

export interface DotGridProps {
  transform: Transform;
  patternId?: string;
  spacing?: number;
  dotRadius?: number;
  dotColor?: string;
  backgroundColor?: string;
}

export function DotGrid(props: DotGridProps): JSX.Element {
  const patternId = () => props.patternId ?? 'dot-grid';
  const spacing = () => props.spacing ?? 16;
  const dotRadius = () => props.dotRadius ?? 1;
  const dotColor = () => props.dotColor ?? 'var(--cactus-grid-dot, #d1d5db)';
  const backgroundColor = () => props.backgroundColor ?? 'transparent';

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
          patternTransform={`translate(${props.transform.x}, ${props.transform.y}) scale(${props.transform.k})`}
        >
          <circle cx={dotRadius()} cy={dotRadius()} r={dotRadius()} fill={dotColor()} />
        </pattern>
      </defs>
      {backgroundColor() !== 'transparent' && (
        <rect width="100%" height="100%" fill={backgroundColor()} />
      )}
      <rect width="100%" height="100%" fill={`url(#${patternId()})`} />
    </svg>
  );
}
