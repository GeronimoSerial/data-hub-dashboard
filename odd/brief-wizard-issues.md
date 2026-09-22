# Level-2 leader brief — issues #27–#32 (parte wizard)

## Role
You are the LEVEL-2 REVIEW LEADER in a three-level Orca orchestration.
You do NOT implement and you do NOT commit. You decompose the work, dispatch
LEVEL-3 Orca workers, review their actual diffs and actual test output, and
report evidence back to the root coordinator.

There is exactly ONE level-2 leader (you). Run your work units strictly one at
a time — never two level-3 workers at once.

## Repo
`/home/gero/orca/workspaces/data-hub-dashboard/fix-issues`, branch `feat/fix-issues`.
Next.js App Router + TypeScript + Zod v4 + `@base-ui/react` primitives + Tailwind
(`cn` helper in `lib/utils`). Tests: vitest + @testing-library/react + jsdom.

**The project is NOT Fluent UI** despite `package.json` being named
`fluent-starter`. The issue texts say "componentes de Fluent UI" — that is the
reporter's assumption and it is wrong. Use the project's own components
(`components/ui/button.tsx` etc., which wrap `@base-ui/react`).

Commands: `pnpm test` (vitest run), `pnpm lint` (eslint), `pnpm build` (next build).

## Verified file map (line numbers may have drifted — re-verify before editing)

- `app/problematicas/parte/nuevo/page.tsx` — server component, renders
  `<ReporteInicialForm cue turnos motivos />` around line 106.
- `components/infraestructura/reporte-inicial-form.tsx` — `'use client'`, owns ALL
  wizard state in local `useState`: `paso` (~80, `Paso = 1|2|3|4`), plus
  `afectacion`, `servicioEstado`, `servicioAlcanceTipo`, `servicioTurnos`,
  `servicioSecciones`, `estadoEstablecimiento`, `rigeDesde` (~81–91), and
  `enviando`/`error`/`guardado` (~92–94). `faltanteDelPaso(actual)` (~104–123)
  returns a validation message or null; `avanzar()` (~125–133) blocks on it;
  `retroceder()` (~135–138) decrements. Step titles in `PASOS` (~57).
  Success screen (~214–220) is a bare
  `<div className="reporte-inicial__confirmacion" role="status"><p>{MENSAJE_GUARDADO}</p></div>`.
  Step-3 building fieldset at ~366–385. `<VigenciaField .../>` at ~388.
- `components/infraestructura/actualizacion-form.tsx` — mirrors the same patterns;
  its own confirmation block ~333–338, its own validation fn, `<VigenciaField/>` ~543.
- `components/infraestructura/vigencia-field.tsx` — `VigenciaField`. Props ~6–24
  (`value`, `onChange`, `label` default `'¿Desde cuándo rige este cambio?'`, `id`,
  `disabled`). Native `<input type="date">` ~168 and `<input type="time">` ~183,
  **no `min`/`max`**. Comments ~57–58 explicitly say neither direction is clamped.
- `lib/infraestructura/validacion-trayectoria.ts` — `rigeDesdeSchema` ~22–25,
  ISO-8601 format check only, used at ~118.
- `components/infraestructura/estado-actual-textos.ts` — `ETIQUETA_ESTABLECIMIENTO`
  ~98–102: `habitual` / `evacuado` / `centro_evacuados`. Message constants like
  `MENSAJE_ALCANCE_FALTANTE` live around ~45–49 of the form file.
- `lib/infraestructura/trayectoria-tipos.ts:19` — `EstadoEstablecimiento` type.
- Neither wizard uses `useRouter`, `useSearchParams`, `sessionStorage`,
  `localStorage`, `popstate` or `beforeunload`. `components/infraestructura/acceso-form.tsx`
  DOES use `useRouter`, but it is the access-password gate — unrelated, do not touch it.
- Existing tests: `components/infraestructura/reporte-inicial-form.test.tsx`,
  `components/infraestructura/actualizacion-form.test.tsx`,
  `app/problematicas/parte/nuevo/page.test.tsx`.

## Work units — run STRICTLY in this order, one level-3 worker at a time

### WU1 — issue #28: "¿Cómo está el edificio?" must be required
Today step 3 lets the user advance to step 4 and submit with
`estadoEstablecimiento` empty, producing incomplete records.
Add the check to the step-3 branch of `faltanteDelPaso` (~113–121) with a new
message constant in the existing `MENSAJE_*` style, and render the inline error
next to the fieldset (~366–385) exactly the way the other step errors are rendered.
Apply the equivalent fix in `actualizacion-form.tsx` if it has the same gap —
verify it, do not assume.
Do NOT default the field to `habitual`; the issue offers that as an alternative
but an explicit choice is the correct behaviour for a report.

### WU2 — issue #27: success screen is a dead end
After a successful save the UI shows only the green message, with no way out.
Add a primary and a secondary action below the message in BOTH forms, using the
project's existing Button component and its existing navigation idiom:
- primary: back to the main panel / map
- secondary: register another incident (resets the wizard to step 1 with clean state)
Verify the real destination route in `app/` — do not invent one.
Do NOT add an automatic timed redirect.

### WU3 — issues #29 and #30: clamp the vigencia date range
Files: `components/infraestructura/vigencia-field.tsx` and
`lib/infraestructura/validacion-trayectoria.ts`.
**Business rule decided by the product owner: a ROLLING WINDOW OF THE LAST 12
MONTHS.** Valid range: `now - 12 months <= rigeDesde <= now`. Future dates are
rejected (#29); dates older than 12 months are rejected (#30).
- Client: set native `min`/`max` on the date input so out-of-range days are not
  selectable, AND clamp/reject in the change handler (typed input bypasses native
  min/max), AND surface an inline validation message in the file's existing es-AR
  register and class naming.
- Server: add a `.refine`/`.superRefine` range check to `rigeDesdeSchema` with a
  clear Spanish message.
- Use ONE shared exported helper for the bounds rather than duplicating the
  arithmetic on both sides.
- Make "now" injectable/freezable so tests can control it. Do not call
  `new Date()` inline in a way tests cannot override.
- Update the stale "neither direction is clamped" comments (~57–58) so the code
  and its documentation agree.
- Keep the `VigenciaField` public props backward compatible: the bounds are
  DEFAULTS baked into the component, so the two existing call sites keep working
  unchanged. Any new prop must be optional.

### WU4 — issues #31 and #32: stop losing wizard state
(a) #32 — reload/F5 resets to step 1 and wipes everything. Persist the wizard
draft AND the current step to `sessionStorage`, keyed per CUE
(e.g. `parte-nuevo:draft:<cue>`), restore on mount, and clear the key on
successful save and on "registrar otra incidencia".
(b) #31 — the browser back button leaves the flow entirely and drops all data.
Sync the step with browser history so back walks from step N to step N-1 while
preserving state, and only leaves the flow from step 1.
Guard every storage access in try/catch — `sessionStorage` can throw or return
nothing in private mode — and make the form render correctly when restore yields
nothing. Read storage in an effect, never during render, to avoid a hydration
mismatch.

## Constraints (hard)
- Do NOT commit, push, stash, or create branches. The ROOT coordinator owns all
  commits. Leave your work in the working tree.
- Do NOT touch `components/infraestructura/acceso-form.tsx`.
- No new dependencies.
- UI copy and validation messages in the project's existing neutral es-AR register.
  Code, identifiers and comments follow each file's surrounding convention.
- Preserve existing behaviour and keep every currently passing test green.
- WU1, WU2 and WU4 all edit the same two form files, so they MUST be serialized.
  Never run two level-3 workers concurrently.

## Topology (mandatory — do not collapse the hierarchy)
1. Create your own child Run:
   `orca-ide orchestration run-create --objective "..." --json`
2. For each work unit, start ONE level-3 worker:
   `orca-ide orchestration worker-start --spec "<self-contained spec>" --worktree current --agent claude --model sonnet --json`
   Always `--worktree current`. Never create a new worktree.
   Reuse the proven terminal for the next work unit via `--terminal <handle>`.
3. Keep each worker spec SHORT in argv. Point the worker at this brief file
   (`odd/brief-wizard-issues.md`) and name its work unit, rather than pasting
   thousands of characters into `--spec`.
4. You review; you do not implement. Read each worker's actual `git diff` and
   actual test output before accepting it. `worker_done --outcome succeeded` is a
   CLAIM, not evidence. Reject and re-dispatch anything unsupported.
5. Settle and release every child dispatch you started before you report.

## Anti-deadlock (this has bitten us before)
After starting a worker, consume its completion with an explicit bounded wait:
`orca-ide orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json`
and acknowledge each delivery with `--ack <delivery_id>`. Do NOT sit idle waiting
for a notification that will never arrive. If three consecutive waits come back
empty, run `orca-ide orchestration worker-list --run <your_run_id> --json` and
diagnose from `git status` / `git diff` / the transcript — never from the agent's
own prose.

## Observable acceptance (all of it, before you report success)
- `pnpm test` GREEN, including NEW vitest cases that each FAIL without the fix:
  - #28: step 3 blocks advance and shows the error when the building-status field is empty.
  - #27: both success actions render after a successful save, and "registrar otra"
    returns to step 1 with cleared state.
  - #29/#30: a date one day in the future is rejected; a date 13+ months old is
    rejected; a date inside the window is accepted — on BOTH the component and the schema.
  - #32: state and step restore from `sessionStorage` on remount.
  - #31: a `popstate` event moves back exactly one step and preserves entered data.
- `pnpm lint` clean for the files you touched.
- `git diff --stat` limited to the files named in this brief.
- Paste the REAL `pnpm test` summary line and the REAL `git diff --stat` in your report.

## Report
Send exactly one `worker_done` from your dispatched terminal, with
`--outcome succeeded` or `--outcome failed`, a three-sentence executive summary,
both lifecycle IDs, and `--files-modified`. Include per-work-unit review findings
(what you rejected or re-dispatched), the test evidence, and any unresolved
blocker. Never claim a check you did not actually run.
