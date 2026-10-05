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

- [ ] B1 — Tasks 1–4 (pestañas y panel por pestaña)
- [ ] B2 — Tasks 5–9 (datos enriquecidos y filtros)
- [ ] B3 — Tasks 10–15 (situación actual)
- [ ] B4 — Tasks 16–19 (radar y planificación)
- [ ] B5 — Tasks 20–22 (estadísticas)
- [ ] B6 — Tasks 23–26 (ruta de acceso, geo-static)
- [ ] T27 — vía principal en la UI
- [ ] Visual review per batch (N1)

## Progress / evidence

- 2026-10-04: spec 03bf161, plan 47d3b36 on `feat/staging`.

## Next step

Launch wave 1.
