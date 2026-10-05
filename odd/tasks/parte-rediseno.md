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
- [x] B2 — Tasks 3–10 (modelo de datos) — T3 235e597 … T10 ec2c112; merged into feat/staging 41ee369; worktree removed
- [ ] B3 — Tasks 11–19 (wizard iniciar reporte) — running, worktree `parte-b3`
- [ ] B4 — Tasks 20–26 (recorrido actualizar) — after B2, B3
- [x] B5 — Tasks 27–28 (background sync) — T27 22f70b9, T28 e6ed196; merged 461e2e8; worktree removed

## Progress / evidence

Run: run_479eb18644a4. B2 dispatch ctx_ec96e6ff1294.

- B1: N2 gate → lint 0 errors, build exit 0, pnpm test 1 failure in `app/api/infraestructura/radar-meteo/resumen/route.test.ts` — reproduced on feat/staging before B1 (pre-existing, out of scope; pending separate fix).
- B2: T3 235e597, T4 df3a397, T5 c8c2875, T6 7d64baa.
- B2 T7: rejected N3 deviation (skipping dedup when causadaPorId present); fixed so dedup compares causadaPorId.
- B2 gate (run by N1 after Orca OOM killed the N2): vitest 2401 passed, 1 failed (pre-existing radar-meteo); lint 0 errors (14 warnings); build exit 0. Post-merge tsc clean, parte tests 176\/176.
- Orca crashed from memory pressure at ~20:49; rule now: heavy steps under flock, only with >=8000 MB available, keep >=5 GB free always.
- B3 so far: T11 69bbde1, T12 2cd7653, T13 e6fc1aa, T14 b0b0b46, T15 fc0a596, T16 395115a.
- B5 gate (N2): full vitest 1 pre-existing failure; lint 0 errors; build 0. An earlier B5 vitest run sat 28 min at 100% CPU holding heavy.lock; N1 killed it; rerun with --testTimeout=30000 completed. Rule: heavy steps wrapped in timeout.
- Integrated feat/staging 461e2e8 (B1+B2+B5): tsc clean; full vitest 2416 passed, 1 failed (pre-existing radar-meteo).
