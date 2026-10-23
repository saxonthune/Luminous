import { splitProps, type JSX, type ParentProps } from 'solid-js';

type IconButtonProps = ParentProps<JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  selected?: boolean;
}>;

export function IconButton(props: IconButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['children', 'class', 'danger', 'selected']);
  return <button type="button"
    class={`lui-icon-button${local.danger ? ' is-danger' : ''}${local.selected ? ' is-selected' : ''}${local.class ? ` ${local.class}` : ''}`}
    {...rest}>{local.children}</button>;
}

type ButtonProps = ParentProps<JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'quiet' | 'primary' | 'danger' | 'danger-primary';
}>;

export function Button(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['children', 'class', 'tone']);
  return <button type="button" class={`lui-button lui-button--${local.tone ?? 'quiet'}${local.class ? ` ${local.class}` : ''}`}
    {...rest}>{local.children}</button>;
}

export { ToolbarSurface } from '@luminous/cactus';
