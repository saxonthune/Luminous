import { splitProps, type JSX, type ParentProps } from 'solid-js';

export function ToolbarSurface(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement> & { variant?: 'app' | 'floating' | 'node' }>): JSX.Element {
  const [local, rest] = splitProps(props, ['children', 'variant', 'class']);
  return <div class={`lui-toolbar lui-toolbar--${local.variant ?? 'floating'}${local.class ? ` ${local.class}` : ''}`} {...rest}>
    {local.children}
  </div>;
}
