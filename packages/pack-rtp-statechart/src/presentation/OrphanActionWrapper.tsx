import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

interface OrphanActionWrapperProps {
  isOrphan: boolean;
  children: JSX.Element;
}

export function OrphanActionWrapper(props: OrphanActionWrapperProps): JSX.Element {
  return (
    <Show
      when={props.isOrphan}
      fallback={<>{props.children}</>}
    >
      <div style={{
        outline: '2px dashed #d68a3a',
        'outline-offset': '4px',
        position: 'relative',
        display: 'inline-block',
      }}>
        {props.children}
        <span style={{
          position: 'absolute',
          top: '-10px',
          right: '0',
          'font-size': '10px',
          color: '#d68a3a',
          padding: '1px 4px',
          background: 'white',
        }}>unused</span>
      </div>
    </Show>
  );
}
