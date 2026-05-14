import { Show } from 'solid-js';
import type { ViewerHandle } from '../PgCanvasView';

export type LayoutAlgorithm = 'grid' | 'elk';

export interface LayoutToolbarProps {
  handle: () => ViewerHandle | undefined;
  algorithm: () => LayoutAlgorithm;
  onAlgorithmChange: (algo: LayoutAlgorithm) => void;
}

export function LayoutToolbar(props: LayoutToolbarProps) {
  const call = (fn: keyof ViewerHandle) => () => {
    const h = props.handle();
    if (h) h[fn]();
  };

  const algoBtnStyle = (active: boolean) => ({
    padding: '2px 8px',
    'font-size': '11px',
    cursor: 'pointer',
    border: 'none',
    background: active ? '#e0e7ff' : 'transparent',
    'font-weight': active ? '600' : '400',
  });

  return (
    <div style={{
      position: 'absolute',
      top: '8px',
      right: '8px',
      background: 'white',
      border: '1px solid #d0d0d0',
      'border-radius': '6px',
      padding: '6px 10px',
      'z-index': '5',
      display: 'flex',
      gap: '12px',
      'align-items': 'center',
    }}>
      <div style={{ display: 'flex', gap: '4px', 'align-items': 'center' }}>
        <button style={iconBtnStyle} title="Zoom out" onClick={call('zoomOut')}>−</button>
        <button style={iconBtnStyle} title="Zoom in" onClick={call('zoomIn')}>+</button>
        <button style={{ ...iconBtnStyle, padding: '2px 8px' }} title="Fit view" onClick={call('fitView')}>Fit</button>
      </div>

      <div style={{ width: '1px', height: '18px', background: '#d0d0d0' }} />

      <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
        <span style={{ 'font-size': '12px', 'white-space': 'nowrap' }}>Layout</span>
        <div style={{
          display: 'flex',
          border: '1px solid #d0d0d0',
          'border-radius': '4px',
          overflow: 'hidden',
        }}>
          <button
            style={{ ...algoBtnStyle(props.algorithm() === 'grid'), 'border-right': '1px solid #d0d0d0' }}
            onClick={() => props.onAlgorithmChange('grid')}
          >
            grid
          </button>
          <button
            style={algoBtnStyle(props.algorithm() === 'elk')}
            onClick={() => props.onAlgorithmChange('elk')}
          >
            elk
          </button>
        </div>
      </div>

      <Show when={!props.handle()}>
        <span style={{ 'font-size': '11px', color: '#999' }}>loading…</span>
      </Show>
    </div>
  );
}

const iconBtnStyle = {
  padding: '2px 6px',
  'font-size': '14px',
  'line-height': '1',
  cursor: 'pointer',
  border: '1px solid #d0d0d0',
  'border-radius': '4px',
  background: 'white',
  'min-width': '24px',
};
