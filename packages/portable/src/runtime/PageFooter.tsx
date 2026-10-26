export function PageFooter(props: { sourceHref: string; sourceView: boolean }) {
  return <footer class="portable-page-footer" aria-label="Page footer">
    <span>Made using Luminous Portable.</span>
    <a href="https://github.com/saxonthune/Luminous">GitHub</a>
    <a href={props.sourceHref}>{props.sourceView ? 'Back to document' : 'View Source'}</a>
  </footer>;
}
