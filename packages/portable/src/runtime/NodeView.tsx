import type { PortableNode } from '../graph.js';
import { stopWheelIfScrollable } from '@luminous/cactus/runtime';
import { Card } from './Card.js';
import { RestCard } from './RestCard.js';
import { UsageCard } from './UsageCard.js';
import { SchemaCard } from './SchemaCard.js';
import { TransitionNode } from './TransitionNode.js';

/** The same node surface is used for generation-time measurement and the canvas. */
export function NodeView(props: {
  node: PortableNode; zoom: number;
  palette?: { fill: string; stroke: string }; headerHeight?: number;
  onMore?: (id: string, opener: HTMLAnchorElement) => void;
  onField?: (name: string) => void; isOpen?: (name: string) => boolean; isFixed?: (name: string) => boolean;
  descendantCount?: number; collapsed?: boolean; onToggle?: () => void;
  onChildrenOnly?: () => void; onToolbarActiveChange?: (active: boolean) => void;
}) {
  return <div class={props.node.group ? 'portable-group' : props.node.card?.component === 'transition' ? 'portable-node portable-transition-node' : props.node.card ? 'portable-node portable-card-node' : 'portable-node'}
    style={{ background: props.palette?.fill, '--portable-card-color': props.palette?.fill ?? 'var(--cactus-surface-alt)', '--portable-border-color': props.palette?.stroke ?? 'var(--cactus-border)', '--portable-border-width': `${1 / props.zoom}px`, '--portable-group-header-height': props.headerHeight === undefined ? undefined : `${props.headerHeight}px` }}>
    {props.node.card ? props.node.card.component === 'schema-card' ? <SchemaCard content={props.node.card} zoom={props.zoom} onMore={props.onMore} onField={props.onField} isOpen={props.isOpen} isFixed={props.isFixed} />
      : props.node.card.component === 'usage-card' ? <UsageCard content={props.node.card} zoom={props.zoom} onMore={props.onMore} />
      : props.node.card.component === 'transition' ? <TransitionNode label={props.node.card.title} />
      : props.node.card.component === 'rest-card' ? <RestCard content={props.node.card} zoom={props.zoom} onMore={props.onMore} descendantCount={props.descendantCount} collapsed={props.collapsed} onToggle={props.onToggle} onChildrenOnly={props.onChildrenOnly} onToolbarActiveChange={props.onToolbarActiveChange} />
      : <Card content={props.node.card} zoom={props.zoom} onMore={props.onMore} />
      : <div class="portable-label" title={props.node.label} onWheel={stopWheelIfScrollable}>{props.node.label}</div>}
    {props.node.group && <div class="portable-container-body" data-box-select-surface />}
  </div>;
}
