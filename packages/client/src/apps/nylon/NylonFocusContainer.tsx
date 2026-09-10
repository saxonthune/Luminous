/** Standard View's labelled boundary; disclosure belongs to Continuous View. */
export function NylonFocusContainer(props: { name: string; selected: boolean }) {
  return <div data-nylon-focus-container aria-label={`${props.name} container`}
    style={{ height: '38px', padding: '0 12px', display: 'flex', 'align-items': 'center',
      gap: '12px', 'box-sizing': 'border-box', color: 'var(--fg)',
      background: 'var(--surface-alt)', 'border-radius': '8px 8px 0 0',
      border: `2px solid ${props.selected ? 'var(--accent)' : 'var(--color-token-ochre)'}` }}>
    <strong title={props.name} style={{ 'font-size': '18px', overflow: 'hidden',
      'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>{props.name}</strong>
    <span style={{ 'font-size': '12px', color: 'var(--fg-muted)', 'white-space': 'nowrap' }}>Children</span>
  </div>;
}
