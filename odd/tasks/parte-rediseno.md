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
- [x] B3 — Tasks 11–19 (wizard iniciar reporte) — T11 69bbde1 … T19 5690f13; merged a699cb7 (import conflict in reporte-inicial-form.test.tsx resolved by union); worktree removed
- [x] B4 — Tasks 20–26 (recorrido actualizar) — T20 b016c47 … T26 73516de, d97f31c, 9a22d2d, f895110; merged 523e136; worktree removed
- [x] Visual review of B1–B5 — done (report: 2 blockers, 9 important, 12 minor)
- [x] Polish H2–H23 + flaky test — merged 9a0f971 (12 commits)
- [x] Final blind re-review #1 — NOT APPROVED: H1 send hangs with no timeout, H2 movement title says "normal" for an Alta storm, plus 12 minor; the Actualizar walkthrough was not covered
- [x] Polish 2 (H1–H14 + full B4 visual coverage) — merged 297131a (11 commits). N1 rejected a "no auto-retry after timeout" change (it broke the auto-resend guarantee); fixed in 866abe3
- [x] Final blind re-review #2 — full coverage (m+d); NOT APPROVED: 5 important (cause list unfiltered, Retry disabled during hang, Actualizar CTA under the history, admin table clipped, Cambió cascade stacked) + 13 minor
- [x] Polish 3 (#1–#18) — merged f21c40a (14 commits); 15-day cause window and auto-retry kept
- [x] Final blind re-review #3 — NOT APPROVED: 6 important, all new and finer-grained (I1 hidden date error, I2 assistance options, I3 order of the new-situation flow, I4 401 copy uses voseo, I5 history events indistinguishable, I6 Actualizar draft restored incompletely) + 17 minor
- [x] Polish 4 (I1–I6 + M1) — 8 commits on feat/parte-pulido4 (up to a8e8a53), closed early at the user's request
- [x] Designer N2 — 18 commits (mobile first: sticky bars in one row, thumb-reach actions, unified terminology, notices scrolled into view, shared Button ghost fix); merged 8208242
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
- Integrated feat/staging a699cb7 (B1+B2+B3+B5): tsc clean; full vitest 2465 passed, 1 failed (pre-existing radar-meteo); lint 0 errors; build 0.
- From B4 on (user decision 2026-10-04): N2 reviews and commits each task; N1 reviews only the finished batch; N1 polls every 10 min (cron job 64121470).
- Second Orca OOM restart (~23:58) killed the B4 and first visual-review N2s; B4 resumed (RETOMA) and finished. Now one N2 at a time.
- B4 decision (N1): keep the verification link and pedagogical assistance in the new walkthrough (no loss of existing functionality).
- Integrated feat/staging 523e136 (B1–B5; it also contains the map redesign commits from the other session): tsc clean; vitest 2493 passed, 2 failed (pre-existing radar-meteo + a flaky envio test that passes 3\/3 in isolation); lint 0 errors; build 0.
- HOTFIX (found by the visual review): the parte send never reached the server in real browsers. `opciones.fetchImpl(...)` called fetch with this=opciones, which throws Illegal invocation, and the error was treated as offline. Present since 8353c19 (2026-09-27) and in origin/main. Fix 7d37476 with a this-checking regression test (RED, then GREEN); merged cba6e1b; tsc clean, parte+components vitest 436 passed, lint 0 errors. A hotfix to main is pending the user.
- Visual review B1–B5 done (Playwright headless + Read of every screenshot, because Claude in Chrome and chrome-devtools MCP fail when the Chrome window is covered). 2 blockers (fetch, already fixed; internal section ids in the history), 9 important, 12 minor. The user's known findings (student list, chips) were reported as H5/H6, but the reviewer had read the private file, so the blind test is inconclusive. Criteria reinforced (lists/options/chips) and sent to the other session's terminal as agreed.
- Polish N2 (H2–H23 + flaky test) running: dispatch ctx_f4cac2624413, worktree parte-pulido. Then a final blind re-review.
- Polish merged 9a0f971: N1 checked the after-screenshots (grouped section list with custom controls; chips in a regular 3-up grid; date and time stacked). Gate on the integration: tsc clean; vitest 2572 passed, 1 failed (pre-existing radar-meteo; the flaky test is fixed); lint 0 errors; build 0.
- Integrated feat/staging 297131a: tsc clean; vitest 2645 passed, 1 failed (pre-existing radar-meteo); lint 0 errors; build 0.
- Integrated feat/staging f21c40a: tsc clean; vitest 2731 passed, 1 failed (pre-existing radar-meteo); lint 0 errors; build 0.
- User decision 2026-10-05: the N3 polish looked bad. A fresh designer N2 polishes screen by screen, editing directly, with the Claude in Chrome MCP (mobile through a 390×844 iframe).
- Integrated feat/staging 8208242: tsc clean; vitest 2749 passed, 1 failed (pre-existing radar-meteo); lint 0 errors; build 0.
- Pending product decisions: split wizard step 3 (4 decisions on one screen); "No" preselected for pedagogical assistance in Actualizar; unify validation (wizard shows the error vs Situación nueva disables the button).
- Pending minors: admin side menu on mobile; outdated-draft notice and the category/Crítica sheets not re-captured; minor findings in ~/.cache/parte-n2/visual4/report.md.
