// Layout rules that inline styles cannot express: hover/focus states and the narrow-screen table reflow.
// Scoped to `.cdl-page`, the root of the cuadernillos workspace.
const CSS = `
.cdl-page { overflow-wrap: anywhere; }
.cdl-page > *, .cdl-page .cdl-min { min-width: 0; }
.cdl-page .cdl-row-button {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .25rem .75rem;
  width: 100%; min-height: 44px; text-align: left; padding: .85rem 1rem;
  border: 1px solid var(--line); border-radius: .6rem; background: var(--surface); color: var(--ink); cursor: pointer;
}
.cdl-page .cdl-row-button:hover { background: var(--fill); border-color: var(--ink-soft); }
.cdl-page .cdl-row-button:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }
.cdl-page .cdl-row-button .cdl-chevron { grid-row: 1 / span 3; grid-column: 2; color: var(--ink-soft); }
@media (max-width: 640px) {
  .cdl-page .cdl-stack-table, .cdl-page .cdl-stack-table tbody,
  .cdl-page .cdl-stack-table tr, .cdl-page .cdl-stack-table th, .cdl-page .cdl-stack-table td { display: block; width: 100%; }
  .cdl-page .cdl-stack-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .cdl-page .cdl-stack-table tr { padding: .6rem 0; border-bottom: 1px solid var(--line); }
  .cdl-page .cdl-stack-table td { border-bottom: 0; padding: .2rem .1rem; }
  .cdl-page .cdl-stack-table td::before { content: attr(data-label); display: block; color: var(--ink-soft); font-size: .85rem; }
}
`

export function ResponsiveStyles() {
  return <style>{CSS}</style>
}
