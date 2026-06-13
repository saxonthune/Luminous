import type { JSX } from 'solid-js';

export interface NodeBodyProps {
  direction?: 'vertical' | 'horizontal';
  gap?: number | string;
  padding?: number | string;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between';
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

const toLen = (v: number | string | undefined, fallback: string) =>
  typeof v === 'number' ? `${v}px` : (v ?? fallback);

export function NodeBody(props: NodeBodyProps): JSX.Element {
  return (
    <div
      class={props.class}
      style={{
        display: 'flex',
        'flex-direction': props.direction === 'horizontal' ? 'row' : 'column',
        gap: toLen(props.gap, '0'),
        padding: toLen(props.padding, '0'),
        'align-items': props.align ?? 'stretch',
        'justify-content': props.justify ?? 'flex-start',
        'box-sizing': 'border-box',
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}
