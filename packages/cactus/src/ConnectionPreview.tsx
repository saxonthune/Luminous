import type { JSX } from 'solid-js';

export interface ConnectionPreviewProps {
  d: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}

export function ConnectionPreview(props: ConnectionPreviewProps): JSX.Element {
  return (
    <path
      d={props.d}
      fill="none"
      stroke={props.stroke ?? 'var(--color-accent)'}
      stroke-width={props.strokeWidth ?? 2}
      stroke-dasharray={(props.strokeDasharray ?? '4 4') === 'none' ? undefined : (props.strokeDasharray ?? '4 4')}
      style={{ "pointer-events": 'none' }}
    />
  );
}
