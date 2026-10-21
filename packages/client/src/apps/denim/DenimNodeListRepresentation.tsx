import type { JSX } from 'solid-js';
import type { DenimNode, DenimNodeType } from '@luminous/core/denim';

export interface DenimNodeListRepresentationProps {
  node: Pick<DenimNode, 'type' | 'text'>;
  nodeTypes: () => DenimNodeType[];
  class?: string;
  meta?: JSX.Element;
  typeContent?: JSX.Element;
  textContent?: JSX.Element;
  trailing?: JSX.Element;
}

/** A consistent type-colored list rendering of a Node's type and text. */
export function DenimNodeListRepresentation(props: DenimNodeListRepresentationProps) {
  const slot = () => props.nodeTypes().find((type) => type.name === props.node.type)?.themeSlot ?? 1;
  return <div class={`denim-node-list-representation${props.class ? ` ${props.class}` : ''}`}
    style={{ background: `var(--theme-bg-${slot()})` }}>
    <div class="denim-node-list-representation__content">
      {props.typeContent ?? <span class="denim-node-list-representation__type">{props.node.type}</span>}
      {props.textContent ?? <span class="denim-node-list-representation__text">{props.node.text || '(untitled)'}</span>}
      {props.meta}
    </div>
    {props.trailing}
  </div>;
}
