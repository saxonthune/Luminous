/** A draggable transition pill with a visible, overflow-safe label. */
export function TransitionNode(props: { label: string }) {
  return <div class="portable-transition" role="img" aria-label={props.label} tabIndex={0}>
    <span class="portable-transition-label">{props.label}</span>
  </div>;
}
