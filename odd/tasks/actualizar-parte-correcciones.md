# actualizar-parte-correcciones

Objective: fix production issues in the infra report "actualizar" flow and map preview.
Branch: `fix/actualizar-parte-correcciones` (from origin/main). Workers: haiku (user request), one per task, isolated worktrees.
Decision: photos are uploaded once per parte and reused across all sections.

## Tasks
- [ ] A1 Accepting suggested "Crítica" must not ask for justification (client + server validation use the scope-based suggestion).
- [ ] A2 Dialogs/sheets in the flow must not close on outside click.
- [ ] A3 Dismissed consistency banner stays dismissed unless the fields its rule depends on change. (after A1, same file)
- [ ] A4 Photos loaded once per parte; picker not re-prompting on later steps.
- [ ] A6 Map preview reflects partial operation (1800005-00 shows habitual).
- [ ] A5 Mermaid map of the actualizar flow (read-only, docs) → UX proposal later.

## Checks
`npx vitest run <touched tests>`, `npx tsc --noEmit`, `npx eslint <touched files>`.

## Progress
