# Veredicto diario — rebuild

## Objective
Rebuild the AI daily verdict (components/veredicto/, lib/infraestructura/veredicto/) so it reads as one
provincial headline plus one line per department ordered by severity, fed with every relevant input
(rain, forecast, rivers, SMN warnings, affected schools, access risk, risk radar).

## Problem / why
The current verdict looks cluttered, lists "vigilancia" departments before severe ones, and its text
only talks about Prefectura river data because the prompt only receives rain/river metrics.

## Decisions (user, final)
- Readers: school directors and provincial officials.
- AI sees: IMERG rain + forecast per department; Prefectura rivers + SMN warnings; affected schools
  (open situations, schools/students without classes, pedagogical assistance); access risk / isolated
  schools and risk radar per department. Level stays rule-decided (reglas.ts); AI never decides it.
- Structure: provincial headline, then one line per department, most to least severe (level, then
  impact: schools without classes, students without classes); quiet departments collapsed in one
  "Sin novedades: A, B, C" line. Ordering is deterministic code, also applied in the modal.
- Tone: describe only, no recommendations, plain Spanish, no ids or rule names.
- Technical details (metrics, sources, rules, traces, upstream, IMERG cutoff) removed from verdict UI;
  data stays in DTO/DB.
- Keep AI identity (Sparkles + "Generado con IA · puede contener errores"), per-word fade-in, reduced
  motion. Flat, clean design. Same for the public page. pdf.ts untouched unless trivially affected.
- Output schema adapted to the new structure with tight limits; old stored rows stay renderable.

## Scope
lib/infraestructura/veredicto/*, components/veredicto/*, veredicto rules in app/globals.css.

## Checklist
- [x] T1 Deterministic ordering module (orden.ts) + tests — route: inline. RED (missing module) -> GREEN.
- [x] T2 Per-department impact aggregates (impacto.ts: schools, access, radar) as citable metrics in entradas.ts, today only — route: inline after one read-only explorer mapped the sources. RED -> GREEN.
- [x] T3 New output schema {dias:[{fecha, titular, departamentos:[{ambito, texto, refs}]}]}, prompt v7, terminos (schools allowed, recommendations blocked, "24 h"/"m3/s" not traced), generar maps headline -> province row and line -> department row — route: inline. RED -> GREEN (refs-limit change was implemented together with its test, no separate RED).
- [x] T4 Modal + public page rebuilt (headline, ordered lines, "Sin novedades"), technical details removed, CSS flattened — route: inline. RED -> GREEN.
- [x] T5 Regenerated in dev with the provided provider (env vars on the command line only): 47 rows, 47 from AI, 0 template.

## Decisions taken during implementation
- Access risk alone does not make a quiet department "news" (it is high almost everywhere during a flood); it is still fed to the model for departments with news.
- Impact is a snapshot of now: it only enters today's items, never past or forecast days.
- The prompt version went v3 -> v7 during dev iterations (hash-driven regeneration needs a bump); none of v3-v6 shipped.
- Stored `salida_ia` for new rows: `{ formato: 'titular'|'linea', frases: [{texto, refs}] }`, so the DTO and old rows keep working.

## Checks
- npx vitest run components/veredicto lib/infraestructura/veredicto lib/infraestructura/briefing-ia: 34 files, 402 passed, 1 skipped
- npx tsc --noEmit -p .: exit 0
- npx eslint components/veredicto lib/infraestructura/veredicto: exit 0
- extra: npx vitest run app/api/infraestructura/veredictos app/api/veredicto: 42 passed

## Progress
- All tasks done. No commits (user instruction: do not change git state), so no commit evidence.
- Next: user review of the modal in the browser; decide whether to commit.
