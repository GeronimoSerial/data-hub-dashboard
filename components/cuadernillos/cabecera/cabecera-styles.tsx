/** Media-query rules for the cabecera screens; inline styles cannot express breakpoints. */
const CABECERA_CSS = `
.cab-section { display: grid; gap: 1.5rem; }
.cab-stack { display: grid; gap: 1rem; }

.cab-req-list { display: grid; gap: .5rem; }
.cab-req { display: grid; gap: .5rem; padding: .6rem .9rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--surface); }
.cab-req-main { display: grid; grid-template-columns: minmax(0, 2fr) 9rem 6.5rem 7.5rem auto auto; align-items: center; gap: .5rem .9rem; }
.cab-req-name { color: var(--ink); overflow-wrap: anywhere; }
.cab-req-meta { display: contents; color: var(--ink-soft); font-size: .85rem; }
.cab-req-detail { display: grid; gap: .4rem; padding-top: .5rem; border-top: 1px solid var(--line); color: var(--ink); font-size: .9rem; }
.cab-req-detail ul { margin: 0; padding-left: 1.1rem; }

.cab-qty-wrap { overflow-x: visible; }
.cab-qty { width: 100%; border-collapse: collapse; color: var(--ink); }
.cab-qty th, .cab-qty td { padding: .55rem .6rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
.cab-qty thead th { color: var(--ink-soft); font-size: .85rem; font-weight: 600; }
.cab-qty tbody th { font-weight: 600; overflow-wrap: anywhere; }
.cab-qty-input { width: 6rem; }
.cab-qty-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; padding-top: .75rem; }
.cab-qty-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; margin-left: auto; }

.cab-combo { position: relative; width: 100%; max-width: 28rem; min-width: 0; }
.cab-combo-value { min-width: 0; overflow-wrap: anywhere; text-align: left; }
.cab-combo-panel { position: absolute; top: calc(100% + .35rem); left: 0; z-index: 20; display: grid; gap: .5rem; width: min(28rem, calc(100vw - 2rem)); max-width: 100%; padding: .6rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--surface); box-sizing: border-box; }
.cab-combo-list { display: grid; gap: .15rem; max-height: 16rem; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.cab-combo-option { display: grid; gap: .1rem; padding: .45rem .55rem; border-radius: .5rem; cursor: pointer; min-width: 0; }
.cab-combo-option[data-active="true"] { background: var(--accent-tint); }
.cab-combo-option[aria-selected="true"] .cab-combo-name { font-weight: 700; }
.cab-combo-name { color: var(--ink); overflow-wrap: anywhere; }
.cab-combo-cue { color: var(--ink-soft); font-size: .8rem; }

.cab-search-row { display: flex; flex-wrap: nowrap; align-items: flex-end; gap: .5rem; min-width: 0; }
.cab-cue-field { display: grid; gap: .3rem; min-width: 0; flex: 0 1 12rem; color: var(--ink); font-weight: 600; }
.cab-cue-input { width: 100%; }

@media (max-width: 760px) {
  .cab-req-main { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name chip" "meta button"; }
  .cab-req-name { grid-area: name; }
  .cab-req-chip { grid-area: chip; }
  .cab-req-button { grid-area: button; }
  .cab-req-meta { display: flex; flex-wrap: wrap; grid-area: meta; gap: .15rem .75rem; }
}

@media (max-width: 480px) {
  .cab-qty thead { display: none; }
  .cab-qty, .cab-qty tbody, .cab-qty tfoot, .cab-qty tr, .cab-qty th, .cab-qty td { display: block; width: 100%; }
  .cab-qty tbody tr { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; padding: .75rem 0; border-bottom: 1px solid var(--line); }
  .cab-qty tbody th.cab-qty-product { grid-column: 1 / -1; padding: 0; border: 0; }
  .cab-qty td { padding: 0; border: 0; }
  .cab-qty td[data-label]::before { content: attr(data-label); display: block; color: var(--ink-soft); font-size: .75rem; }
  .cab-qty-input { width: 100%; }
  .cab-qty tfoot td { padding: 0; border: 0; }
  .cab-qty-foot { padding-top: .25rem; }
  .cab-qty-actions { width: 100%; margin-left: 0; }
  .cab-qty-actions > * { flex: 1 1 8rem; }
}
`

export function CabeceraStyles() {
  return <style>{CABECERA_CSS}</style>
}
