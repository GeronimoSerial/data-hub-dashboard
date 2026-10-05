# Feature: mapa-infra-rediseno

**Objective:** Redesign `/mapas/infraestructura`: one tab row (Situación actual · Radar · Planificación · Estadísticas), shared chip filters, school report as the main alert, no technical copy, access route by best road to the nearest urban locality.
**Plan (source of truth for tasks):** `docs/superpowers/plans/2026-10-04-mapa-infraestructura-rediseno-plan.md`
**Spec:** `docs/superpowers/specs/2026-10-04-mapa-infraestructura-rediseno-design.md`
**Visual reference:** `docs/superpowers/specs/2026-10-04-mapa-infraestructura-prototipo.html`
**Integration branch:** `feat/staging`

## Execution

- Route: delegated three-level (N1 root → one Orca N2 sonnet per worktree → N3 `codex exec -m gpt-6-luna` effort high). Trigger: user request ("delega", "un n2 por worktree").
- One worktree per N2, branched from `feat/staging`; N1 commits each verified task in the N2 worktree and merges each batch back into `feat/staging`.
- N1 reviews every batch visually in a running app before accepting it (user requirement: the N3 may hallucinate or produce ugly UI).
- TDD: on (plan writes each test first); runners `pnpm exec vitest run <file>` and `uv run pytest <file>` (geo-static); batch gate `pnpm test && pnpm lint && pnpm build`.
- RDD: off (global) → ordinary repository policy, `disabled/unmanaged`.
- Delivery strategy: ask-on-risk (no PRs opened without the user's decision).

### Waves (adjusted from the plan after collision analysis)

The plan claimed batches 4 and 6 were independent of 2/3/5. Not fully true: Task 18 edits `leyenda-mapa.tsx` (created in Task 15), Tasks 16–17 edit `panel-lateral.tsx` and the 2.6k-line map page that batches 2–3 rewrite, and Task 27 edits `lib/infraestructura/mapa/acceso.ts` (created in Task 14).

| Wave | Worktrees (one N2 each) | Notes |
|---|---|---|
| 1 | `mapa-b1` (Tasks 1–4) ∥ `mapa-b6` (Tasks 23–26, geo-static only) | disjoint files |
| 2 | `mapa-b2` (Tasks 5–9) | after B1 merged |
| 3 | `mapa-b3` (Tasks 10–15) | after B2 merged |
| 4 | `mapa-b4` (Tasks 16–19) ∥ `mapa-b5` (Tasks 20–22) | after B3 merged; disjoint files |
| 5 | Task 27 | after B3 and B6 merged |

## Checklist

- [ ] B1 — Tasks 1–4 (pestañas y panel por pestaña) — T1 be0a61d, T2 b8386d3, T3 0717c4d, T4 1cabd6b; N2 done and released; N1 code review OK; pending: N1 build + full suite + visual review, then merge
- [ ] B2 — Tasks 5–9 (datos enriquecidos y filtros)
- [ ] B3 — Tasks 10–15 (situación actual)
- [ ] B4 — Tasks 16–19 (radar y planificación)
- [ ] B5 — Tasks 20–22 (estadísticas)
- [x] B6 — Tasks 23–26 (ruta de acceso, geo-static) — T23 e802c71, T24 23bef81, T25 7e3e832, T26 5d49e81; merged c2e4fb0; worktree removed
- [ ] T27 — vía principal en la UI
- [ ] Visual review per batch (N1)

## Progress / evidence

- 2026-10-04: spec 03bf161, plan 47d3b36 on `feat/staging`.
- Wave 1 launched: run run_a39bdf80d42b; B1 dispatch ctx_b5a273c7f5c5 (worktree mapa-b1), B6 dispatch ctx_d21c9931778b (worktree mapa-b6). N2 specs in ~/.cache/mapa-n2/<batch>/spec.md.
- Rule change (user): N2 commits each verified task; N1 reviews only the whole batch (diff + visual).
- B6 T23 data source (N1 decision, reversible): municipal population from Censo 2022 (Prov. Corrientes open data, CC BY 4.0) as proxy for the 2,000-inhabitant urban threshold; coordinates from Georef; 7 explicit name equivalences, 4 small municipios without a Georef locality excluded and listed in the README.
- B1: T1 be0a61d, T2 b8386d3. B6: T23 e802c71, T24 23bef81.
- Loop: cron a1b8266c every 10 min.
- B6 review (N1): full diff read (cost weighting, multi-source Dijkstra over the whole province, via_principal by metres, VERSION_JOB 3); `uv run pytest -q` 143 passed on the branch and after merge. No visual review needed (backend only). Pending outside B6: the full job was not run (remote/heavy, needs user authorization); when the v3 output exists, update GEOMETRIA_DEFAULT in calcular_exposicion_ruta.py.

## Next step

Wave 1: B6 merged; B1 running (T1–T4 committed, N2 on its gate). Full isolation job v3 authorized by the user and running locally as systemd unit `mapa-job-aislamiento` (log ~/.cache/mapa-n2/job-aislamiento.log, serialized by heavy.lock). Importing its output into staging is NOT yet authorized.
B2 launched early at the user's request, stacked on feat/mapa-b1 @ 1cabd6b (worktree mapa-b2, dispatch ctx_355231408d95); if B1 changes after review, the B2 N2 merges feat/mapa-b1 into its branch. B2 merges into feat/staging only after B1.
- B1 gate (N2): tsc clean, lint 0 errors, focused vitest 192 green; full suite timed out at 900 s under machine load (48 DB/PGlite files failing in beforeAll, unrelated to the diff) and build skipped because the isolation job held heavy.lock. N1 runs build + full suite before merging.
- Isolation job v3 (user-authorized, local): success in 1126 s; 1989/2001 schools with route (99.4%, was 1985); 51 destinations used; median 4.7 km, p90 36.6 km; crossings puente 943, sin_evidencia 765, vado 0. Output committed with GEOMETRIA_DEFAULT → v3 (86d2135). Not done: route-exposure recompute (exposicion_ruta v1 still computed on v2 routes) and import into staging (needs authorization).
- B1 visual review (N1, dev server :3210 from mapa-b1, demo DB copy): tab row OK; Estadísticas hides the map OK. FINDING: in Radar the placeholder `panel-radar` in the left stack renders as an empty white box behind `.radar-meteo-controls` → fix dispatched (ctx_070bc14bbf17). Notes for B3: access hint copy still says 'hasta la ciudad cabecera del departamento' (Task 14 must change it); demo DB has 0 partes, so seed demo partes before B3 visual review. On each worker_done: full-batch diff review, gate, visual review, merge, next wave.
