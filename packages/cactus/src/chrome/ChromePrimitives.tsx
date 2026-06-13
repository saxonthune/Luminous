import { For, Match, Show, Switch, type JSX } from 'solid-js';
import { ToggleGroup } from '@kobalte/core/toggle-group';
import { ToggleButton } from '@kobalte/core/toggle-button';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import type { Action, MenuItem, MenuSchema, ToolbarControl, ToolbarSchema } from './types.js';

interface OnActionProp {
  onAction?: (id: string, payload?: unknown) => void;
}

// --- Toolbar controls ---

function ButtonControl(props: { action: Action } & OnActionProp): JSX.Element {
  return (
    <button
      class="cactus-chrome-btn"
      disabled={props.action.enabled === false}
      data-tone={props.action.tone}
      title={props.action.hotkey ? `${props.action.label} (${props.action.hotkey})` : props.action.label}
      onClick={() => props.onAction?.(props.action.id, props.action.payload)}
    >
      {props.action.label}
    </button>
  );
}

function ToggleGroupControl(props: { actions: Action[] } & OnActionProp): JSX.Element {
  const selectedIndex = () => {
    const idx = props.actions.findIndex((a) => a.selected);
    return idx >= 0 ? String(idx) : '';
  };

  return (
    <ToggleGroup
      class="cactus-chrome-toggle-group"
      value={selectedIndex()}
      onChange={(value: string | null) => {
        if (!value) return;
        const idx = parseInt(value, 10);
        const action = props.actions[idx];
        if (action) props.onAction?.(action.id, action.payload);
      }}
    >
      <For each={props.actions}>
        {(action, idx) => (
          <ToggleGroup.Item
            class="cactus-chrome-toggle-item"
            value={String(idx())}
            disabled={action.enabled === false}
            title={action.hotkey ? `${action.label} (${action.hotkey})` : action.label}
          >
            {action.label}
          </ToggleGroup.Item>
        )}
      </For>
    </ToggleGroup>
  );
}

function ToggleSetControl(props: { actions: Action[] } & OnActionProp): JSX.Element {
  return (
    <div class="cactus-chrome-toggle-set">
      <For each={props.actions}>
        {(action) => (
          <ToggleButton
            class="cactus-chrome-toggle-item"
            pressed={action.selected ?? false}
            onChange={() => props.onAction?.(action.id, action.payload)}
            disabled={action.enabled === false}
            title={action.hotkey ? `${action.label} (${action.hotkey})` : action.label}
          >
            {action.label}
          </ToggleButton>
        )}
      </For>
    </div>
  );
}

export function ToolbarControlRenderer(
  props: { control: ToolbarControl } & OnActionProp,
): JSX.Element {
  return (
    <Switch>
      <Match when={props.control.type === 'separator'}>
        <div class="cactus-chrome-sep" role="separator" aria-hidden />
      </Match>
      <Match when={props.control.type === 'spacer'}>
        <div class="cactus-chrome-spacer" />
      </Match>
      <Match when={props.control.type === 'button' && props.control}>
        {(ctrl) => <ButtonControl action={(ctrl() as Extract<ToolbarControl, { type: 'button' }>).action} onAction={props.onAction} />}
      </Match>
      <Match when={props.control.type === 'toggle-group' && props.control}>
        {(ctrl) => <ToggleGroupControl actions={(ctrl() as Extract<ToolbarControl, { type: 'toggle-group' }>).actions} onAction={props.onAction} />}
      </Match>
      <Match when={props.control.type === 'toggle-set' && props.control}>
        {(ctrl) => <ToggleSetControl actions={(ctrl() as Extract<ToolbarControl, { type: 'toggle-set' }>).actions} onAction={props.onAction} />}
      </Match>
    </Switch>
  );
}

export function Toolbar(props: { schema: ToolbarSchema } & OnActionProp): JSX.Element {
  return (
    <div class="cactus-chrome-toolbar" data-toolbar-id={props.schema.id} role="toolbar">
      <For each={props.schema.controls}>
        {(control) => <ToolbarControlRenderer control={control} onAction={props.onAction} />}
      </For>
    </div>
  );
}

// --- Menu items ---

function MenuItemRenderer(props: { item: MenuItem } & OnActionProp): JSX.Element {
  return (
    <Switch>
      <Match when={props.item.type === 'divider'}>
        <DropdownMenu.Separator class="cactus-chrome-menu-sep" />
      </Match>
      <Match when={props.item.type === 'submenu' && props.item}>
        {(item) => {
          const sub = () => item() as Extract<MenuItem, { type: 'submenu' }>;
          return (
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger class="cactus-chrome-menu-item">
                {sub().label}
                <span aria-hidden>›</span>
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent class="cactus-chrome-menu-content">
                <For each={sub().items}>
                  {(child) => <MenuItemRenderer item={child} onAction={props.onAction} />}
                </For>
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          );
        }}
      </Match>
      <Match when={props.item.type === 'action' && props.item}>
        {(item) => {
          const action = () => (item() as Extract<MenuItem, { type: 'action' }>).action;
          return (
            <DropdownMenu.Item
              class="cactus-chrome-menu-item"
              disabled={action().enabled === false}
              data-tone={action().tone}
              onSelect={() => props.onAction?.(action().id, action().payload)}
            >
              <span>{action().label}</span>
              <Show when={action().hotkey}>
                <span class="cactus-chrome-menu-hotkey">{action().hotkey}</span>
              </Show>
            </DropdownMenu.Item>
          );
        }}
      </Match>
    </Switch>
  );
}

export function MenuRoot(props: {
  schema: MenuSchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorX: number;
  anchorY: number;
} & OnActionProp): JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        left: `${props.anchorX}px`,
        top: `${props.anchorY}px`,
        width: '0',
        height: '0',
      }}
    >
      <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
        <DropdownMenu.Trigger
          style={{
            position: 'absolute',
            opacity: '0',
            width: '1px',
            height: '1px',
            'pointer-events': 'none',
          }}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="cactus-chrome-menu-content" style={{ 'z-index': '1000' }}>
            <For each={props.schema.items}>
              {(item) => <MenuItemRenderer item={item} onAction={props.onAction} />}
            </For>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  );
}
