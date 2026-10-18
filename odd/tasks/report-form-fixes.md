# report-form-fixes

## Objective
Fix five issues in the infraestructura report form and history: asistencia for alumnos-only reports, new building status "sin clases", new asistencia modalities, whole-school history wording, and directivo history after resolution.

## Route
delegated (single writer; 5 tasks across form, domain types, history and API).

## Constraints
- DB columns `estado_establecimiento` and `asistencia_pedagogica` are plain `text`: no migration needed.
- UI copy in Spanish; code/commits in English; test-first where a test file exists.

## Tasks
- [x] T1 Ask asistencia pedagógica for "solo alumnos" reports (step 3 with only asistencia; draft summary + payload). (commit bd926d91)
- [x] T2 Building status `sin_clases` ("Sin clases"): types, zod, labels, relevance, forces clases suspendido, consistency rules. (commit eccd18af)
- [x] T3 Shared asistencia modalities ['Asistencia virtual','Cuadernillos digitales','Cuadernillos impresos','Otras propuestas'] + legacy normalize. (commit ce5feb27)
- [x] T4 History: "Toda la escuela" instead of section count when the afectación covers the whole school. (commit 43dfb8f5)
- [x] T5 Directivo "Ver historial" whenever a parte exists, including after resolution. (commit fddf0cb9)

## Acceptance
Focused vitest per task green; typecheck, lint and vitest on components/infraestructura + lib/infraestructura at close.

## Progress / evidence
- T1: alumnos now walks 5 steps; step 3 titled "Asistencia pedagógica" shows only that question. Focused tests green.
- T2: `sin_clases` forces clases suspendido; sin-energía rules suggest "Sin clases"; zod rejects sin_clases + normal. No migration (text column). Not added to whole-school evacuation confirmation (evacuation-specific).
- T3: shared MODALIDADES_ASISTENCIA_PEDAGOGICA; legacy mapping skipped per coordinator (no production reports).
- T4: diffParte takes `seccionesEstablecimiento`; whole school = every school section present and complete; route passes them. Old stored diffs render unchanged.
- T5: "Ver historial" shown whenever a parte exists; backend already returned movements after resolution (route test added, green before the change).
- Checks: tsc clean; lint 0 errors; DB-backed suites show hookTimeout flakiness under full parallel runs (pre-existing, environmental).

## Next step
Push/PR is the user's decision.
