/**
 * Layout of the Planeamiento screens: home (task, summary, stock, envíos) and the envío builder.
 * Shared pieces stay in the kit; these rules only arrange them for this role.
 */
const CSS = `
.pl-home { display: grid; gap: 1.75rem; }
.pl-home .k-head { align-items: center; }
.pl-summary{margin:0;color:var(--muted,#5b5a58);font-size:.9rem}
.pl-lead { display: grid; gap: 0; }

/* Task band: the one action of the screen, with the action on the right. */
.pl-home .k-task { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .15rem 1.5rem; padding: 1rem 1.25rem; background: var(--fill); border-left: 4px solid var(--marker); }
.pl-home .k-task h3, .pl-home .k-task p { grid-column: 1; }
.pl-home .k-task p { text-wrap: pretty; }
.pl-home .k-task > .ui-button { grid-column: 2; grid-row: 1 / span 2; min-height: 44px; padding-inline: 1.5rem; }

.pl-home .k-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0; margin: 0; padding: 0; border-top: 1px solid var(--line); border-left: 1px solid var(--line); border-bottom: 0; }
.pl-home .k-kpi { flex-direction: column; gap: .1rem; padding: 1rem 1.25rem .95rem; box-shadow: inset -1px -1px 0 var(--line); }
.pl-home .k-kpi dd { order: 0; font-size: 2rem; font-weight: 600; letter-spacing: -.01em; }
.pl-home .k-kpi dt { order: 1; color: var(--ink); font-weight: 600; font-size: .9rem; }
.pl-home .k-kpi-hint { order: 2; }
.pl-home .k-kpi[data-zero] dd { color: var(--ink-faint); }
.pl-home .k-kpi[data-tone="ok"] dd { color: var(--ok); }

.pl-home .k-panel { gap: .6rem; }
.pl-home .k-panel-head h3 { font-size: 1.2rem; }

/* Stock: the meter under each grade doubles as its rule, so levels compare at a glance. */
.pl-stock { display: grid; gap: .35rem; margin: 0; padding: 0; list-style: none; }
.pl-stock-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: baseline; gap: .4rem .6rem; width: 100%; box-sizing: border-box; padding: .55rem .3rem 0; border: 0; border-radius: 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background-color 120ms ease-out; }
.pl-stock-item:hover:not(:disabled) { background: var(--fill); }
.pl-stock-item:focus-visible, .pl-pick button:focus-visible, .pl-mremove:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }
.pl-stock-item:disabled { cursor: default; }
.pl-stock-item:disabled .pl-stock-add { visibility: hidden; }
.pl-stock-name { font-weight: 600; }
.pl-stock-num { font-family: var(--font-display); font-size: 1.25rem; line-height: 1.5rem; font-variant-numeric: tabular-nums; }
.pl-stock-add { align-self: center; color: var(--ink-faint); transition: color 120ms ease-out; }
.pl-stock-item:hover:not(:disabled) .pl-stock-add { color: var(--ink); }
.pl-stock-bar { grid-column: 1 / -1; height: 3px; margin-inline: -.3rem; background: var(--line); }
.pl-stock-bar > span { display: block; height: 100%; background: var(--ink); }
.pl-stock-item[data-state] .pl-stock-num { color: var(--warn); }
.pl-stock-item[data-state="unset"] .pl-stock-num { font-family: inherit; font-size: .85rem; font-weight: 600; }

/* Board: the envíos table takes the width, stock and cabeceras stay beside it. */
.pl-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(17rem, 21rem); gap: 2rem 2.5rem; align-items: start; }
.pl-aside { display: grid; gap: 1.75rem; padding-left: 2.5rem; border-left: 1px solid var(--line); }
.pl-stock-sent { grid-column: 1 / -1; grid-row: 2; margin-top: -.3rem; color: var(--ink-soft); font-size: .8rem; font-variant-numeric: tabular-nums; }
.pl-facts { display: grid; margin: 0; border-top: 1px solid var(--line); }
.pl-facts > div { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: .45rem 0; border-bottom: 1px solid var(--line); }
.pl-facts dt { color: var(--ink-soft); font-size: .9rem; }
.pl-facts dd { margin: 0; color: var(--ink); font-family: var(--font-display); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.pl-unconfirmed { margin-top: .25rem; color: var(--ink-soft); font-size: .85rem; }
.pl-unconfirmed summary { display: flex; align-items: center; justify-content: space-between; gap: .5rem; min-height: 2.25rem; color: var(--ink); font-weight: 600; cursor: pointer; list-style: none; }
.pl-unconfirmed summary::-webkit-details-marker { display: none; }
.pl-unconfirmed summary::after { content: ""; width: .5rem; height: .5rem; border-right: 2px solid var(--ink-faint); border-bottom: 2px solid var(--ink-faint); transform: rotate(45deg); transition: transform 160ms ease-out; }
.pl-unconfirmed[open] summary::after { transform: rotate(-135deg); }
.pl-unconfirmed summary:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }
.pl-unconfirmed p { margin: 0 0 .5rem; }
.pl-unconfirmed ul { display: grid; max-height: 14rem; margin: 0; padding: 0; overflow-y: auto; list-style: none; border-top: 1px solid var(--line); }
.pl-unconfirmed li { display: grid; gap: .05rem; padding: .5rem 0; border-bottom: 1px solid var(--line-soft); }
.pl-unconfirmed li strong { color: var(--ink); font-size: .85rem; font-weight: 600; line-height: 1.3; }
.pl-unconfirmed li span { color: var(--ink-faint); font-size: .78rem; text-transform: none; }

/* Envíos: one row per envío, read left to right — who, when, what, and where it stands. */
.pl-filters { display: flex; flex-wrap: wrap; gap: .25rem 1.25rem; }
.pl-filters button { padding: .3rem 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ink-soft); font: inherit; font-size: .9rem; font-weight: 500; cursor: pointer; transition: color 120ms ease-out, border-color 120ms ease-out; }
.pl-filters button:hover { color: var(--ink); }
.pl-filters button[aria-pressed="true"] { border-bottom-color: var(--ink); color: var(--ink); font-weight: 600; }
.pl-filters button span { color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.pl-filters button:focus-visible, .pl-envio-row:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }
.pl-envios { border-top: 1px solid var(--line); }
.pl-envios ul { margin: 0; padding: 0; list-style: none; }
.pl-envio-cols { display: grid; grid-template-columns: minmax(0, 1.5fr) 5.5rem minmax(0, 9.5rem) minmax(0, 1.6fr) 1rem; gap: .25rem 1.5rem; align-items: start; padding-inline: .5rem; }
.pl-envios-head { padding-block: .45rem; border-bottom: 1px solid var(--line); color: var(--ink-soft); font-size: .8rem; font-weight: 500; }
.pl-envio { border-bottom: 1px solid var(--line); }
.pl-envio-row { width: 100%; box-sizing: border-box; padding-block: .75rem; border: 0; border-radius: 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background-color 120ms ease-out; }
.pl-envio-row:hover, .pl-envio[data-open] .pl-envio-row { background: var(--fill); }
.pl-envio-row > span { display: grid; gap: .05rem; min-width: 0; }
.pl-envio-row > span > strong { font-weight: 600; }
.pl-envio-row > span > span { color: var(--ink-soft); font-size: .85rem; }
.pl-envio-when, .pl-envio-what { font-variant-numeric: tabular-nums; }
.pl-envio-when > strong, .pl-envio-what > strong { font-weight: 500; }
.pl-envio-status > strong { display: flex; align-items: center; gap: .45rem; }
.pl-envio-status > strong::before { content: ""; flex: none; width: .55rem; height: .55rem; border-radius: 50%; background: var(--ink-faint); }
.pl-envio-status[data-tone="waiting"] > strong::before, .pl-envio-status[data-tone="short"] > strong::before { background: var(--warn); }
.pl-envio-status[data-tone="waiting"] > strong { color: var(--warn); }
.pl-envio-status[data-tone="delivering"] > strong::before { background: var(--info); }
.pl-envio-status[data-tone="done"] > strong::before { background: var(--ok); }
.pl-envio-row .pl-envio-bar { display: block; height: 3px; max-width: 16rem; margin-top: .35rem; background: var(--line); }
.pl-envio-bar > span { display: block; height: 100%; background: var(--ok); }
.pl-envio-status[data-tone="short"] .pl-envio-bar > span { background: var(--warn); }
.pl-envio-chevron { align-self: center; color: var(--ink-faint); transition: transform 160ms ease-out; }
.pl-envio-row[aria-expanded="true"] .pl-envio-chevron { transform: rotate(90deg); color: var(--ink); }

.pl-envio-detail { display: grid; gap: 1.5rem; padding: 1.1rem .5rem 1.5rem; }
.pl-envio-detail .k-journey { padding-bottom: 1.1rem; border-bottom: 1px solid var(--line); }
.pl-lines { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 24rem), 1fr)); gap: 1.4rem 3rem; align-items: start; }
.pl-line { display: grid; gap: .35rem; align-content: start; min-width: 0; }
.pl-line-head { display: grid; gap: .05rem; }
.pl-line-head strong { color: var(--ink); font-weight: 600; }
.pl-line-head span, .pl-line-note { margin: 0; color: var(--ink-soft); font-size: .85rem; }
.pl-table { width: 100%; border-collapse: collapse; font-size: .9rem; font-variant-numeric: tabular-nums; }
.pl-table th, .pl-table td { padding: .3rem 0 .3rem .75rem; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--ink); font-weight: 400; text-align: right; text-transform: none; letter-spacing: 0; vertical-align: top; }
.pl-table th:first-child { padding-left: 0; text-align: left; }
.pl-table thead th { color: var(--ink-soft); font-size: .8rem; font-weight: 500; }
.pl-table td { width: 22%; }
.pl-table td[data-state="pending"] { color: var(--ink-faint); white-space: nowrap; }
.pl-table td[data-state="short"] { color: var(--warn); font-weight: 600; }
.pl-short { display: block; font-size: .76rem; font-weight: 500; }
.pl-more { justify-self: start; }
.pl-envios-empty { display: grid; gap: 1.25rem; padding: 1.25rem 1.5rem; border-radius: var(--r-md); background: var(--fill); }

.pl-skeleton { display: grid; gap: 1rem; }
.pl-skeleton > span[aria-hidden] { display: block; background: var(--fill); animation: pl-pulse 1.4s ease-in-out infinite; }
@keyframes pl-pulse { 50% { opacity: .45; } }

/* Stock dialog */
.pl-stock-form { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.pl-stock-form .k-step input { width: 6.5rem; min-height: 40px; font-size: 1.05rem; }
.pl-stock-form .k-step button { width: 40px; min-height: 40px; }
.pl-stock-result { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin: 0; padding-top: .75rem; border-top: 1px solid var(--line); color: var(--ink-soft); }
.pl-stock-result strong { color: var(--ink); font-family: var(--font-display); font-size: 1.6rem; line-height: 1; font-variant-numeric: tabular-nums; }

/* Builder: progress stays put while the step content scrolls. */
.pl-steps-bar { display: grid; gap: .6rem; padding: .85rem 1.5rem; border-bottom: 1px solid var(--line); }
.pl-steps { display: flex; margin: 0; padding: 0; list-style: none; counter-reset: pl-step; }
.pl-steps li { counter-increment: pl-step; display: flex; flex: 1 1 0; align-items: center; gap: .55rem; min-width: 0; color: var(--ink-soft); font-size: .9rem; font-weight: 500; }
.pl-steps li:last-child { flex: 0 1 auto; }
.pl-steps li::before { content: counter(pl-step); display: grid; place-items: center; flex: none; width: 1.5rem; height: 1.5rem; box-sizing: border-box; border: 1.5px solid var(--line); border-radius: 50%; color: var(--ink-soft); font-size: .78rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.pl-steps li::after { content: ""; flex: 1 1 1rem; min-width: 1rem; height: 1.5px; margin: 0 .9rem 0 .35rem; background: var(--line); }
.pl-steps li:last-child::after { display: none; }
.pl-steps li[data-state="done"] { color: var(--ink); }
.pl-steps li[data-state="done"]::before { content: "✓"; border-color: var(--ink); background: var(--ink); color: var(--card); }
.pl-steps li[data-state="done"]::after { background: var(--ink); }
.pl-steps li[aria-current="step"] { color: var(--ink); font-weight: 700; }
.pl-steps li[aria-current="step"]::before { border-color: var(--ink); color: var(--ink); }
.pl-dest { margin: 0; color: var(--ink-soft); font-size: .9rem; }
.pl-dest strong { color: var(--ink); font-weight: 600; }

.pl-pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 0 2rem; margin: .25rem 0 0; padding: 0; list-style: none; }
.pl-pick button { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .05rem .7rem; align-items: start; align-content: start; width: 100%; height: 100%; box-sizing: border-box; padding: .6rem .5rem; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background-color 120ms ease-out; }
.pl-pick button:hover, .pl-pick button[aria-pressed="true"] { background: var(--fill); }
.pl-radio { grid-row: span 2; width: 1rem; height: 1rem; box-sizing: border-box; margin-top: .2rem; border: 1.5px solid var(--ink-faint); border-radius: 50%; background: var(--card); transition: border-width 120ms ease-out; }
.pl-pick button[aria-pressed="true"] .pl-radio { border: 5px solid var(--ink); }
.pl-pick-name { font-weight: 600; }
.pl-pick-meta { grid-column: 2; color: var(--ink-soft); font-size: .85rem; }

.pl-matrix-wrap { display: grid; gap: .6rem; min-width: 0; }
.pl-matrix-hint, .pl-matrix-empty { margin: 0; color: var(--ink-soft); font-size: .9rem; }
.pl-matrix-empty { padding: 1rem 1.25rem; border: 1px dashed var(--line); }
.pl-matrix { display: grid; min-width: 0; font-variant-numeric: tabular-nums; }
.pl-mrow { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .35rem .75rem; padding: .7rem 0; border-bottom: 1px solid var(--line); }
.pl-mhead { display: none; }
.pl-mname { display: grid; gap: .05rem; min-width: 0; }
.pl-mname strong { color: var(--ink); font-weight: 600; }
.pl-mname span { color: var(--ink-soft); font-size: .82rem; }
.pl-cell { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.pl-cell-label { color: var(--ink-soft); font-size: .9rem; }
.pl-mtotal { grid-column: 1 / -1; justify-self: end; color: var(--ink); font-weight: 600; }
.pl-mtotal::before { content: "Total "; color: var(--ink-soft); font-weight: 400; }
.pl-mtotal:empty::before { content: none; }
.pl-mremove { grid-column: 2; grid-row: 1; display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--ink-faint); cursor: pointer; transition: background-color 120ms ease-out, color 120ms ease-out; }
.pl-mremove:hover { background: var(--fill); color: var(--danger-ink); }
.pl-mfoot { border-bottom: 0; padding-bottom: .2rem; }
.pl-mfoot:first-of-type, .pl-mrow + .pl-mfoot { border-top: 1px solid var(--ink); }
.pl-mfoot + .pl-mfoot { border-top: 0; padding-top: .2rem; }
.pl-msum { font-weight: 600; }
.pl-mleft, .pl-mleft .pl-mname strong { color: var(--ink-soft); font-weight: 500; }
.pl-mleft .pl-msum { font-weight: 500; }
.pl-cell[data-state="over"] .pl-msum { color: var(--danger-ink); font-weight: 700; }

.pl-review { display: grid; justify-items: center; gap: 1rem; padding: 1.5rem 1rem; background: var(--fill); }
.pl-review .k-receipt { width: min(100%, 27rem); box-sizing: border-box; padding: 1.25rem 1.5rem 1.4rem; border: 1px solid var(--line); background: var(--card); }
.pl-review .k-note { width: min(100%, 27rem); box-sizing: border-box; }
.pl-foot-sum { flex: 1 1 auto; margin: 0 auto 0 0; color: var(--ink-soft); font-size: .9rem; font-variant-numeric: tabular-nums; }
.pl-foot-sum strong { color: var(--ink); font-weight: 600; }

/* From tablet up the quantities become a grid: schools down, grades across. */
@media (min-width: 48rem) {
  /* Search on the left, its results on the right: the quantities stay above the fold. */
  .pl-search > div { grid-template-columns: minmax(0, 23rem) minmax(0, 1fr); column-gap: 2.5rem; align-items: start; }
  .pl-search .k-list { max-height: 9.5rem; overflow-y: auto; }
  .pl-matrix { overflow-x: auto; }
  .pl-mrow { grid-template-columns: minmax(13rem, 2.2fr) repeat(var(--pl-cols), minmax(3.25rem, 1fr)) 3.5rem 2rem; gap: 0 .6rem; padding: .4rem 0; }
  .pl-mhead { display: grid; padding: 0 0 .35rem; color: var(--ink-soft); font-size: .8rem; font-weight: 500; }
  .pl-mhead span:not(:first-child) { text-align: center; }
  .pl-cell, .pl-mtotal, .pl-mremove { grid-column: auto; grid-row: auto; }
  .pl-cell { justify-content: center; }
  .pl-cell-label { display: none; }
  .pl-cell .k-step { width: 100%; }
  .pl-cell .k-step button { display: none; }
  .pl-cell .k-step input { width: 100%; min-height: 32px; border: 0; border-radius: inherit; }
  .pl-mtotal { justify-self: center; }
  .pl-mtotal::before { content: none; }
  .pl-mfoot { padding: .45rem 0 .1rem; }
}

/* Below a laptop the side column drops under the table and its panels sit side by side. */
@media (max-width: 68rem) {
  .pl-grid { grid-template-columns: minmax(0, 1fr); }
  .pl-aside { grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1.75rem 2.5rem; padding-left: 0; border-left: 0; }
}

@media (max-width: 640px) {
  .pl-home { gap: 1.5rem; }
  .pl-home .k-task { grid-template-columns: minmax(0, 1fr); }
  .pl-home .k-task > .ui-button { grid-column: 1; grid-row: auto; width: 100%; margin-top: .6rem; }
  .pl-home .k-kpis { grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); }
  .pl-home .k-kpi { padding: .75rem 1rem; }
  .pl-home .k-kpi dd { font-size: 1.6rem; }
  .pl-envios-head { display: none; }
  .pl-envio-cols { grid-template-columns: minmax(0, 1fr) auto 1rem; gap: .5rem .75rem; padding-inline: .25rem; }
  .pl-envio-who { grid-column: 1 / 3; }
  .pl-envio-row > .pl-envio-when { grid-column: 1; grid-row: 2; display: flex; gap: .4rem; align-items: baseline; }
  .pl-envio-what { grid-column: 2; grid-row: 2; text-align: right; }
  .pl-envio-what > span { display: none; }
  .pl-envio-status { grid-column: 1 / 3; grid-row: 3; }
  .pl-envio-chevron { grid-column: 3; grid-row: 1 / span 3; }
  .pl-envio-detail { padding-inline: .25rem; }
  .pl-table { font-size: .85rem; }
  .pl-table th, .pl-table td { padding-left: .4rem; }
  .pl-steps-bar { padding: .75rem 1rem; }
  .pl-steps li:not([aria-current="step"]) > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .pl-steps li:not([aria-current="step"]) { flex: 0 1 auto; }
  .pl-steps li:not([aria-current="step"])::after { flex: 0 0 1.25rem; margin-inline: .35rem; }
  .pl-review { padding: 1rem .5rem; }
  .pl-foot-sum { flex-basis: 100%; }
}

@media (pointer: coarse) {
  .pl-stock-item { min-height: 48px; }
  .pl-pick button { min-height: 48px; }
  .pl-cell .k-step input { min-height: 40px; }
  .pl-mremove { width: 2.75rem; height: 2.75rem; }
}

@media (prefers-reduced-motion: reduce) {
  .pl-skeleton > span[aria-hidden] { animation: none; }
  .pl-envio-chevron, .pl-radio, .pl-unconfirmed summary::after { transition: none; }
}
`

export function PlanningStyles() {
  return <style>{CSS}</style>
}
