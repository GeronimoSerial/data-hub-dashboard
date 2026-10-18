# actualizar-parte-correcciones

Objective: fix production issues in the infra report "actualizar" flow and map preview.
Branch: `fix/actualizar-parte-correcciones` (from origin/main). Workers: haiku (user request), one per task, isolated worktrees.
Decision: photos are uploaded once per parte and reused across all sections.

## Tasks
- [x] A1 Accepting suggested "Crítica" must not ask for justification (client + server validation use the scope-based suggestion).
- [x] A2 Dialogs/sheets in the flow must not close on outside click.
- [x] A3 Dismissed consistency banner stays dismissed unless the fields its rule depends on change. (after A1, same file)
- [x] A4 Photos loaded once per parte; picker not re-prompting on later steps.
- [x] A6 Map preview reflects partial operation (1800005-00 shows habitual).
- [x] A5 Mermaid map of the actualizar flow (read-only, docs) → UX proposal later.

## Checks
`npx vitest run <touched tests>`, `npx tsc --noEmit`, `npx eslint <touched files>`.

## Progress
- A1 935f3a50 (option b: server derives scope from sections), A2 ef351ad4, A3 ece8dcc6, A4 42675c3d + A4b 5d887cea (draft persists photos, controlled picker). Merged into branch; tsc 0; 60 files / 655 tests passed.
- A6 195421be merged after user confirmed rule change (map service no longer gated by establecimiento situations).
- Follow-ups: A3 dismissals reset across reporte-inicial-form steps; DBGT debug line at reporte-inicial-form.test.tsx:1459; UX proposal for flow (A5).
- After A6 merge: tsc 0; 66 files / 741 tests passed.
- A5: doc `docs/flujos/actualizar-parte.md` (see R8 in actualizar-flujo-riesgos.md). Structural check only.
