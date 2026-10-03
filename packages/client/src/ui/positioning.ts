export interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PanelSize {
  width: number;
  height: number;
}

export interface AnchoredPositionOptions {
  side?: 'bottom' | 'right';
  alignRight?: boolean;
  gap?: number;
  padding?: number;
}

/** Place an anchored panel in the viewport, flipping or shifting it when needed. */
export function computeAnchoredPosition(
  anchor: AnchorRect,
  panel: PanelSize,
  viewport: PanelSize,
  options: AnchoredPositionOptions = {},
): { left: number; top: number } {
  const side = options.side ?? 'bottom';
  const gap = options.gap ?? 4;
  const padding = options.padding ?? 8;
  const maxLeft = Math.max(padding, viewport.width - panel.width - padding);
  const maxTop = Math.max(padding, viewport.height - panel.height - padding);
  let left: number;
  let top: number;

  if (side === 'right') {
    left = anchor.right + gap;
    if (left + panel.width > viewport.width - padding) left = anchor.left - panel.width - gap;
    top = anchor.top;
  } else {
    left = options.alignRight ? anchor.right - panel.width : anchor.left;
    top = anchor.bottom + gap;
    if (top + panel.height > viewport.height - padding
      && anchor.top - panel.height - gap >= padding) top = anchor.top - panel.height - gap;
  }

  return {
    left: Math.max(padding, Math.min(left, maxLeft)),
    top: Math.max(padding, Math.min(top, maxTop)),
  };
}
