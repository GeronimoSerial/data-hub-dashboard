# QA de UX del mapa de accesos (ficha, capas, leyenda, ruta, textos)

Locator: `odd/tasks/mapa-accesos-qa-ux.md` · Engram mirror: `odd/mapa-accesos-qa-ux/tasks`
Branch: `feat/enos-mapa-accesos` (worktree `~/orca/workspaces/data-hub-dashboard/enos-mapa-accesos`).
Dispatch: N2 task_4c54cf5b1b94 (Run run_b715f4873746). No push, no PR. Follows `odd/tasks/mapa-accesos-territoriales.md`.

## Objective
Resolve the user's and N1's QA findings on `/mapas/infraestructura` for the territorial access layers, keeping the
three concepts apart (forecast access risk, static historical susceptibility, current situation).

## Findings reproduced on the demo (production build, :3206, before any change)
Evidence in `~/orca/demo-data/enos-accesos/qa-evidencia/` (`00-*` = baseline).
- F1 Desktop: the school panel (`.map-ficha-panel`, right, z 4) covers the layers control (`.map-controls-stack`,
  right, z 3): the layers cannot be toggled while a school is open.
- F2 No direct action to see the route/crossings from the ficha; the map flies to zoom 14 on the school, so the route
  is a single vertical segment, not framed.
- F3 The route legend sits at the bottom of the left column, below "Indicadores consolidados" (hidden below the fold).
- F4 Titles "Aislamiento OSM", "Susceptibilidad physrisk", "escala 0-3" are not understandable; no plain-language
  explanation of what is measured, what levels/"sin datos" mean, or what is NOT represented.
- F5 Mobile (390x844): after selecting from search the left drawer (`position: fixed`, z 20) stays open on top of the
  ficha (z 4), so the selection looks like it closed itself. A school without coordinates is silently ignored.
- F6 Ficha says "Sin datos del padrón para esta escuela." for a school that search just found in the padrón: the
  sentence refers to the Gestión Escolar cut (sections/enrolment), not to the school registry.
- F7 Closing the ficha clears the selection (route and highlight disappear) and there is no way to reopen it.

## Ground truth for the copy (verified against `services/geo-static/src/geo_static/osm_aislamiento.py`)
- Index input: length of the shortest OSM road route from the road node nearest the school to the departmental head
  town; number of unpaved segments on it; water crossings on it (with a bridge tag vs without: "sin puente registrado",
  which also counts fords); whether a route avoiding the crossings without bridge exists.
- 3: route longer than 20 km, or at least one crossing without registered bridge and no route that avoids them.
- 2: at least one crossing without registered bridge but a route avoiding them exists.
- 1: no crossing without registered bridge, but the trip is not the simplest (route over 3 km, bridged crossings, or
  several unpaved segments).
- 0: route up to 3 km, no water crossings, at most 1 unpaved segment.
- "No calculable" (`sin_datos_red`): school more than 5 km from the nearest road in OSM, or no road connection to the
  head town. "Sin dato": the school is not in the imported file (no coverage); never treated as 0.
- physrisk: WRI Aqueduct v2 modelled river flood depth under historical (1980 baseline) climate for a 100-year return
  period; NOT observed events, NOT a forecast, NOT the river course. 0 m = the model estimates no water at that point.

## Constraints
- Keep separation: access index (static OSM), historical flood depth (static physrisk), current situation (partes),
  forecast access risk (Radar). Never invent coverage; missing data stays "sin dato".
- `HAZARD_CONTEXT_ENABLED` gate and Replay exclusion unchanged; no new flag.
- Desktop and narrow (390px) must both work. Dark mode tokens, lucide icons (no rings).
- N2 does not edit source; every code edit goes through N3 (`opencode run`). No push, no PR, main checkout untouched.

## TDD
Mode: off (no project/session config, not chosen by user). Functional checks per task. Runner: `pnpm vitest run <files>`
(focused, N3), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` (N2, under `flock ~/.cache/enos-n3/heavy.lock`).

## Delivery
Strategy `ask-on-risk`, forecast ~500 authored changed lines (copy/tests already partly in the worktree). Work-unit
commits on the feature branch; no push.

## Tasks
- [x] Q0 Copy: plain-language levels from `calcular_indice_aislamiento`, WRI wording, collapsed help; tests updated. Delegated (N3 big-pickle). Commit `130bb1d`.
- [x] Q1 Page/layout: `fichaCerradaCue`, reopen/clear group, drawers close on search select, legend under search, CSS. Delegated (N3). Commit `6179218`.
- [x] Q2 Short ficha (3 lines + "Ver recorrido", detail secondary), no-route explanation, padrón wording. Delegated (N3 + repair). Commit `f65c653`.
- [x] Q3 Route framing (search, click, button), no-location notice, territorial icon clicks not captured by the department, crossing popup. Delegated (N3 + repair). Commit `6179218`.
- [x] Q4 Legend opaque card, route block first, collapsed help. Delegated (N3 + Codex gpt-6-luna). Commit `130bb1d`.
- [x] Q5 Browser verification and gates. Route: N2 (Playwright/Chromium headless, script outside the repo).
- [x] Q6 Follow-up fixes found in the browser (Codex gpt-6-luna): collapse layers into "Capas" while the ficha is open, territorial section first in the ficha, mobile toggles above the sheet, 721-1080 px range, z-index of the opened panel. Commits `78cf985`, `2a21b46` (and part of `6179218`).
- [x] Q7 Docs: `docs/ejecucion-enos/ACCESOS/registro.md` section "QA de UX del mapa". Commit `628a3b4`.

## Progress / evidence
- Baseline (before) reproduced 2026-09-29 in real browser; screenshots `00-*`, `01-*`, `02-*` in `~/orca/demo-data/enos-accesos/qa-evidencia/` (also `.qa-evidencia/` in the worktree, locally git-excluded, never committed).
- After: `despues3-*` (desktop 1440x900 and mobile 390x844), `final-*`, `tablet900b-*` and `*-resultados.json` in the same folder. Key measured facts (desktop, `1800072-00`): the ficha shows exactly three lines + "Ver recorrido"; detail closed; the layers panel opened from "Capas" does not overlap the ficha; the route (25 crossings: 8 puente, 17 sin puente registrado) is framed whole; closing the ficha keeps the route and shows "Ver ficha"/"Quitar selección"; `1800585-00` (sin recorrido) shows "Sin recorrido para mostrar: …" and no button; clicking the isolation icon opens that school's ficha and does not select the department; no page errors.
- N3 infrastructure: opencode-go "usage limit exceeded" on this account; coordinator approved `opencode/big-pickle`, later the user required Codex `gpt-6-luna` (`codex exec -m gpt-6-luna -C <worktree> -s workspace-write --skip-git-repo-check`) for every further edit. big-pickle left corrupted identifiers (e.g. `ETIQUETAS_AISLAMINGO`), a merged line in the page test and a stray `zz-diag9.test.ts` (deleted, it was a scratch file of this task); all caught by tsc/vitest and repaired.
- Gates: `pnpm lint` 0, `pnpm exec tsc --noEmit` 0, `pnpm build` 0, `pnpm vitest run components lib app` 224 files / 2147 passed (3 skipped). A first wide run under load 64 timed out 10 DB test files; they pass alone and in the limited-worker run.
- Delivery: 6 commits on the feature branch, ~2100 authored lines (tests are about half); no push, no PR. Slice suggestion for the cleanup N2: (1) copy/legend, (2) ficha, (3) page/layout + CSS, (4) docs.

## Pending / limitations
- Radar mode with the ficha open was not exercised in the browser; the 721-1080 px bottom sheet covers the lower part of the left column until the ficha is closed; icon selection was not tested on a school that sits inside a cluster.
- Engram mirror saved through the CLI (`engram save … --topic odd/mapa-accesos-qa-ux/tasks`, observation #4868) because the MCP `mem_save` failed with "multiple active runtime sessions".

## Next step
Cleanup N2 / N1: reduce the diff into review slices, then integrate. Demo `enos-accesos-3206` serves the final build.
