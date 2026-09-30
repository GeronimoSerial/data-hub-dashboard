# Textos del mapa de infraestructura para personas no técnicas

Locator: `odd/tasks/enos-textos-mapa.md` · Engram mirror: `odd/enos-textos-mapa/tasks` (pending if Engram is unavailable)
Branch: `feat/enos-textos-mapa` (base `34188b5`: accesos UI + exactitud geo v2). Dispatch: N2 task_084fc141b1b9, Run run_b715f4873746.
No push, no PR. N2 does not edit source: every code edit goes through N3 = `codex exec -m gpt-6-luna` (user mandate).

## Objective
Rewrite and unify the visible copy of `/mapas/infraestructura` (school ficha, layer controls, legends, cruce popup,
no-route / no-coverage states, Radar) so a first-time, non-technical reader understands what is shown, what each level,
value and colour means, how to reach a school's route, and what each water/isolation/crossing icon means.

## Copy rules (decided by N2 from the audit + coordinator brief)
- Everyday words first; OSM, physrisk, período de retorno, escenario histórico and dates/sources only in the secondary
  detail (`<details>`).
- Three concepts never mixed: computed static index/model (OSM roads, physrisk) vs. current situation (partes) vs.
  forecast (Radar). Say explicitly that the static layers do not tell whether the road is passable today.
- Missing data (`Sin dato`) is never level 0 and never "0 m"; `0 m` = the model estimates no water at that point.
- physrisk depth is modelled AT THE SCHOOL POINT: not the river, not the route; nothing is claimed about flooding along
  the route (route-level physrisk is not implemented).
- The three new v2 reasons get their own plain sentence: `coordenada_fuera_de_departamento`, `red_vial_no_conectada`,
  `sin_via_osm_cercana` (+ existing `sin_conexion_red`, `ruta_degenerada`, `sin_geometria_importada`, generic).
- Do not touch calculation, migrations, HAZARD_CONTEXT_ENABLED gate, ACL, flags, Replay exclusion.

## TDD
Mode: off (no project/session config, not chosen by the user). Functional checks per task.
Runner: focused `pnpm vitest run <files>` (N3), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` (N2, under
`flock ~/.cache/enos-n3/heavy.lock`).

## Delivery
Strategy `ask-on-risk`; forecast ~450 authored changed lines (copy + tests). Work-unit commits on the feature branch.

## Tasks
- [x] T1 Single source of truth: rewrite `TEXTOS_ACCESOS`, `DESCRIPCIONES_AISLAMIENTO`, `ETIQUETAS_INUNDACION`, add
      `DESCRIPCIONES_CRUCE` and shared `MOTIVOS_SIN_RUTA` in `lib/mapas/accesos-capas.ts` + its test. Route: delegated (N3).
- [x] T2 Consumers: `capas-accesos.tsx` legend, `ficha-acceso-territorial.tsx`, cruce popup in
      `map-infraestructura-page.tsx`, page-level notices; update their tests. Route: delegated (N3).
- [x] T3 Layer controls + Radar/Replay wording (`layer-control.tsx`, `risk-explanation-panel.tsx`,
      `replay-panel.tsx`), tests. Route: delegated (N3).
- [x] T4 Gates: vitest touched files, lint, tsc, build; demo v2 (isolated copy) browser QA desktop + narrow with a
      school with route, one without route, one flood point; first-use comprehension walk-through.
- [x] T5 Report to Run (changes, evidence, pendings).

## Progress / evidence
- T1 `9d3235b`, T2 `e9bfd66`, T3 `ec48bec`, fix hook test `75777e8`, T4 `34b25b5` (all N3 = codex gpt-6-luna; route: delegated).
- Gates: eslint (components, lib/mapas, lib/infraestructura) clean; `tsc --noEmit` clean; `pnpm build` OK; focused vitest
  (components/mapas, lib/mapas, ficha, hooks) 386 pass after the hook-test fix, T4 files 154 pass. Full-suite run of
  components/infraestructura hung on an unrelated test (99% CPU, killed) - not verified.
- Browser QA (demo :3208, isolated copy `~/orca/demo-data/enos-textos`, evidence in `qa-evidencia/`): desktop 1440x900 and
  390x844; 1800072 (route), 1800896 (red_vial_no_conectada + 2,10 m water), 1800203 (sin_via_osm_cercana),
  1800282 (fuera de departamento), 1800585.
- First-use comprehension: simulated reader (Codex, no repo access, only on-screen text), score 3/5 -> fixed jargon
  (cabecera, red principal), water-is-a-model wording, level numbers in legend, no-route heading in legend. NOT a human test.
- Pending: real human first-use test; narrow ficha covers the map (layout, not copy); route-level physrisk not implemented.
