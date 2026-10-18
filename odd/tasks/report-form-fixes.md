# report-form-fixes

## Objective
Fix five issues in the infraestructura report form and history: asistencia for alumnos-only reports, new building status "sin clases", new asistencia modalities, whole-school history wording, and directivo history after resolution.

## Route
delegated (single writer; 5 tasks across form, domain types, history and API).

## Constraints
- DB columns `estado_establecimiento` and `asistencia_pedagogica` are plain `text`: no migration needed.
- UI copy in Spanish; code/commits in English; test-first where a test file exists.

## Tasks
- [ ] T1 Ask asistencia pedagógica for "solo alumnos" reports (step 3 with only asistencia; draft summary + payload).
- [ ] T2 Building status `sin_clases` ("Sin clases"): types, zod, labels, relevance, forces clases suspendido, consistency rules.
- [ ] T3 Shared asistencia modalities ['Asistencia virtual','Cuadernillos digitales','Cuadernillos impresos','Otras propuestas'] + legacy normalize.
- [ ] T4 History: "Toda la escuela" instead of section count when the afectación covers the whole school.
- [ ] T5 Directivo "Ver historial" whenever a parte exists, including after resolution.

## Acceptance
Focused vitest per task green; typecheck, lint and vitest on components/infraestructura + lib/infraestructura at close.

## Progress / evidence
