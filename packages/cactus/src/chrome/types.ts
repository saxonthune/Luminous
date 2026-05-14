export interface Action {
  id: string;
  label: string;
  icon?: string;
  hotkey?: string;
  tone?: 'default' | 'danger' | 'primary';
  enabled?: boolean;
  selected?: boolean;
  payload?: unknown;
}

export type MenuItem =
  | { type: 'action'; action: Action }
  | { type: 'submenu'; label: string; items: MenuItem[] }
  | { type: 'divider' };

export interface MenuSchema {
  id: string;
  items: MenuItem[];
}

export type ToolbarControl =
  | { type: 'button'; action: Action }
  | { type: 'toggle-group'; actions: Action[] }
  | { type: 'toggle-set'; actions: Action[] }
  | { type: 'separator' }
  | { type: 'spacer' };

export interface ToolbarSchema {
  id: string;
  controls: ToolbarControl[];
}

export type ChromeSlot = 'top' | 'left' | 'right' | 'bottom';

export interface ChromeSchema {
  top?: ToolbarSchema[];
  left?: ToolbarSchema[];
  right?: ToolbarSchema[];
  bottom?: ToolbarSchema[];
}
