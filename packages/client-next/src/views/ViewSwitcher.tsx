import type { JSX } from 'solid-js';
import type { View } from '@luminous/canvas-core';

export interface ViewSwitcherProps {
  views: readonly View[];
  activeViewId: string;
  onChange: (viewId: string) => void;
}

export function ViewSwitcher(props: ViewSwitcherProps): JSX.Element {
  return (
    <select
      style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        'z-index': '5',
        background: 'white',
        padding: '4px 8px',
        'border-radius': '6px',
        border: '1px solid #d0d0d0',
      }}
      value={props.activeViewId}
      onChange={(e) => props.onChange(e.currentTarget.value)}
    >
      {props.views.map((view) => (
        <option value={view.id}>{view.name}</option>
      ))}
    </select>
  );
}
