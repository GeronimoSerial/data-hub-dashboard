# Feature: parte-rediseno

**Objective:** Implement the full redesign of the parte "Iniciar reporte" / "Actualizar" flows.
**Plan (source of truth for tasks):** `docs/superpowers/plans/2026-10-04-parte-rediseno-plan.md`
**Spec:** `docs/superpowers/specs/2026-10-04-parte-wizard-redesign-design.md`
**Integration branch:** `feat/staging`

## Execution

- Route: delegated three-level (N1 root → one Orca N2 sonnet per batch → N3 `codex exec -m gpt-6-luna` effort high).
- One worktree per N2, branched from `feat/staging`; N1 merges each batch back into `feat/staging`.
- TDD: on (plan writes each test first); runner `pnpm exec vitest run <file>`; batch gate `pnpm test && pnpm lint && pnpm build`.
- RDD: off (global) → ordinary repository policy, `disabled/unmanaged`.
- Delivery strategy: ask-on-risk (no PRs opened without the user's decision).

## Checklist

- [x] B1 — Tasks 1–2 (estado de envío veraz) — commits 378bc07, c89f1c5; merged ff into feat/staging; worktree removed
- [ ] B2 — Tasks 3–10 (modelo de datos) — worktree `parte-b2`
- [ ] B3 — Tasks 11–19 (wizard iniciar reporte) — after B1, B2
- [ ] B4 — Tasks 20–26 (recorrido actualizar) — after B2, B3
- [ ] B5 — Tasks 27–28 (background sync) — running, worktree `parte-b5`, dispatch ctx_194b8e4e7070

## Progress / evidence

Run: run_479eb18644a4. B2 dispatch ctx_ec96e6ff1294.

- B1: N2 gate → lint 0 errors, build exit 0, pnpm test 1 failure in `app/api/infraestructura/radar-meteo/resumen/route.test.ts` — reproduced on feat/staging before B1 (pre-existing, out of scope; pending separate fix).
- B2: T3 235e597, T4 df3a397, T5 c8c2875, T6 7d64baa.
