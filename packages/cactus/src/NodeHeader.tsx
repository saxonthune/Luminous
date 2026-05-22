import { type JSX } from 'solid-js';

export interface NodeHeaderProps {
  /** The node this header belongs to. */
  nodeId: string;
  /** Optional inline padding around the header content. */
  padding?: number | string;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

export function NodeHeader(props: NodeHeaderProps): JSX.Element {

  const toLen = (v: number | string | undefined, fallback: string) =>
    typeof v === 'number' ? `${v}px` : (v ?? fallback);

  return (
    <div
      class={props.class}
      style={{
        padding: toLen(props.padding, '0'),
        'box-sizing': 'border-box',
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}
