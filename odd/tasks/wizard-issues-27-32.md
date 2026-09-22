# Feature: Resolve open issues #27–#32 (parte wizard)

## Objective
Fix the six open GitHub issues affecting the incident-report wizard
(`/problematicas/parte/nuevo` and `/problematicas/parte/actualizar`).

## Scope
- #27 Success screen is a dead end (no navigation actions)
- #28 "¿Cómo está el edificio?" is not required in step 3
- #29 Vigencia allows future dates
- #30 Vigencia allows unreasonably old dates
- #31 Browser back button destroys wizard state
- #32 No draft persistence across reload (F5)

## Constraints
- Stack: Next.js, Zod v4, `@base-ui/react` primitives (NOT Fluent UI), Tailwind.
- Checks: `pnpm test` (vitest), `pnpm lint`, `pnpm build`.
- TDD mode: not configured in this project. Ordinary functional checks apply:
  every task ships with vitest coverage and a green `pnpm test`.
- RDD: off (global). Ordinary repository policy governs delivery.
- Product decision (user, 2026-09-21): vigencia lower bound = rolling last 12 months.
- UI copy and code stay in the project's existing Spanish (es-AR) register.

## Routing
Three-level Orca orchestration, all levels in the current worktree.
- L1 root (coordinator): scope, polling, integration, tests, commits, report.
- L2 review leaders: one per write-disjoint domain; review only, no implementation.
- L3 workers: implement their bounded scope.

Domains are split by **write scope**, not by issue, because #27/#28/#31/#32 all
edit the same two form components.

| Domain | Owns (exclusive write scope) | Issues |
| --- | --- | --- |
| A — Vigencia bounds | `components/infraestructura/vigencia-field.tsx`, `lib/infraestructura/validacion-trayectoria.ts` (+ their tests) | #29, #30 |
| B — Wizard UX | `components/infraestructura/reporte-inicial-form.tsx`, `components/infraestructura/actualizacion-form.tsx` (+ their tests) | #27, #28, #31, #32 |

Domain A must land its bounds as defaults **inside** `VigenciaField` so it never
has to edit the form components. Zero file overlap between A and B.

## Tasks

- [ ] T1 (Domain A, delegated) — #29/#30: clamp vigencia to `[now - 12 months, now]`
      in `VigenciaField` (native `min`/`max` on the date input, clamp on change)
      and enforce the same range in `rigeDesdeSchema`.
      Accept: new vitest cases reject a future date and a date older than 12 months;
      `pnpm test` green.
- [ ] T2 (Domain B, delegated) — #28: make `estadoEstablecimiento` required in
      `faltanteDelPaso` step 3, with an inline validation message, in both forms.
      Accept: vitest asserts step 3 blocks advance with the field empty.
- [ ] T3 (Domain B, delegated) — #27: add primary/secondary actions to the success
      screen in both forms (back to panel, register another).
      Accept: vitest asserts both actions render after a successful save.
- [ ] T4 (Domain B, delegated) — #31/#32: persist wizard draft + current step
      (sessionStorage keyed by CUE) and sync the step with browser history so the
      native back button walks steps instead of leaving the flow.
      Accept: vitest asserts state restores from storage and that `popstate`
      moves back one step.
- [ ] T5 (root) — integration: full `pnpm test`, `pnpm lint`, `pnpm build`, commits.

## Delivery
Strategy: `ask-on-risk`. Forecast ~450–650 authored changed lines across 6 issues.
Chain strategy to be decided with the user if the running count crosses ~400.

## Progress
- Created 2026-09-21. Exploration done (file map). Orchestration not yet launched.

## Orchestration state (2026-09-21)
- Root run: `run_34211a6201a7`
- First attempt launched TWO parallel level-2 leaders (`ctx_b9053011d0fe`,
  `ctx_1613a5b40d70`). Both died at startup with `process_exited` and an empty
  transcript; nothing was written to the tree. Both abandoned. Suspected cause:
  a ~6-8 KB spec passed inline in argv.
- Corrected topology, per the user's instruction ("un solo sonnet"): a SINGLE
  level-2 leader, dispatch `ctx_37ae593a470c`, task `task_a742068beed6`,
  agent claude/sonnet, `--worktree current`.
- The detailed brief now lives in `odd/brief-wizard-issues.md` and the `--spec`
  argv only points at it. This also fixed the startup crash.
- The leader runs four work units strictly serially, each with its own level-3
  Orca worker, never two at once:
  WU1 #28 -> WU2 #27 -> WU3 #29+#30 -> WU4 #31+#32.
- Domain split by write scope is preserved inside the serial order: WU3 owns
  `vigencia-field.tsx` + `validacion-trayectoria.ts`; WU1/WU2/WU4 own the two
  form components.

## Progress
- 2026-09-21: exploration done (file map). Product decision captured (12-month
  rolling window). Parallel launch failed and was replaced by the single-leader
  serial topology. Leader `ctx_37ae593a470c` confirmed live and working.
- Engram mirror: PENDING (mem_save refused with "multiple active runtime sessions
  match the current project and directory"). Local file is authoritative until
  the mirror is resynchronized.

## BLOCKER (2026-09-21) — level 3 is refused by the Orca runtime
Verified empirically, not inferred. A level-2 leader was placed twice and its
level-3 dispatch was refused identically both times:

    error.code = nested_worker_depth_exceeded
    "Sub-worker dispatch is not permitted at depth 2 (max 1). Complete this task yourself."
    nextSteps: "To allow deeper nesting, open Settings -> Orchestration in the
                Orca desktop app and raise Nested worker depth."

Placements tested by the leader itself: `--worktree current` AND
`--worktree new-child --setup skip`. Both refused with the same code.
**Conclusion: the depth cap is a property of the dispatch lineage, not of the
workspace. Re-placing the leader in its own worktree does not create depth
budget.** This matches the orchestration guide: "nested workers obey the depth
limit, and a new Run does not reset the caller's depth."

Unblocking requires one manual change: Orca desktop app ->
Settings -> Orchestration -> "Nested worker depth" -> 2 or more.
There is no CLI surface for it (`orca-ide config` / `orca-ide settings` do not exist).

### Second, independent defect observed
The first single leader (`ctx_37ae593a470c`) escalated correctly, then ended its
turn and never consumed the coordinator's queued reply. `orchestration reply`,
`orchestration send` and `terminal send` all enqueued successfully
(`ok: true`), the terminal stayed `live`, but `projection.liveness.observedAt`
froze and `activity` stayed `done` for ~15 minutes. The leader had to be stopped.
A queued coordinator message does not reliably wake an idle level-2 Claude leader.

### Dispatch log
| Dispatch | Placement | Outcome |
| --- | --- | --- |
| `ctx_b9053011d0fe` (Domain A leader) | current | `process_exited` at startup, empty transcript. Abandoned. |
| `ctx_1613a5b40d70` (Domain B leader) | current | `process_exited` at startup, empty transcript. Abandoned. |
| `ctx_37ae593a470c` (single leader) | current | Escalated `nested_worker_depth_exceeded`, then wedged idle. Stopped. |
| `ctx_287da48a0b25` (single leader) | new-child worktree | Ran the probe, proved both placements refused, reported. Released. |

Nothing was written to any source file in any attempt. Working tree is clean
apart from the untracked `odd/` documents.

## Next step
Waiting on the user: raise the nested worker depth setting (then relaunch the
single leader and the four work units proceed as specified), or authorize a
two-level topology instead.
