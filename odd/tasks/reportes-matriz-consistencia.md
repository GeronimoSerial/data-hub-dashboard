# Feature: reportes-matriz-consistencia

## Objective
Make the report wizard (`components/infraestructura/reporte-inicial-form.tsx`) reject or warn about inconsistent answer combinations, reconcile new reports with the school's active state, and move/strengthen photo and suggestion UX.

## Problem
Answers are independent today: e.g. motive "Evacuación preventiva" + building "Sin daños" is accepted. The server overwrites `estadoEstablecimiento` without checking active afectaciones/suspensions. The wizard does not show active state. Photo is requested only at "Confirmar".

## Rules (agreed with user)
Single source of truth in `lib/infraestructura/consistencia-parte.ts`, used by client and server.

### Blocked (option disabled + explanation; server 400)
- evacuacion-preventiva + habitual
- evacuacion-preventiva + centro_evacuados
- inundacion + centro_evacuados
- inaccesibilidad-docentes + evacuado
- edificio evacuado + clases normal (already exists)
- motive "Otro" (either category) without description

### Warning (inline amber note, non-blocking)
- inundacion + habitual
- tormenta + centro_evacuados
- sin-energia + evacuado / centro_evacuados
- inaccesibilidad-docentes + parcial / centro_evacuados
- habitual + clases suspendido
- centro_evacuados + clases normal
- clases normal + asistencia pedagógica "sí"
- evacuacion-preventiva + severidad Baja
- motive with water/flood (inundacion) + clases normal while edificio parcial
- severidad Crítica with scope "algunas secciones" of a single section
- justificación `mas_personas` with a single section
- justificación `se_prolonga` with vigencia "ahora"
- evacuacion-preventiva with vigencia start older than 7 days
### Allowed explicitly
- evacuacion-preventiva + parcial; sin-energia + clase virtual.

### Severity suggestion
Severity stays manual in step 1. When step 2 scope becomes "toda", if motive-suggested severity +1 level > chosen severity, open a drawer: "Recomendamos subir la gravedad a X porque afecta a toda la escuela" [Cambiar a X] [Mantener Y]. No student-count percentages (tiny schools).

### Active state
- Wizard preloads current school state (building, service, active afectaciones) and shows it.
- Transition from evacuado/centro_evacuados to habitual while active afectaciones/suspensions exist: blocked until each is marked solucionada or kept consciously; server validates the same.

### UX
- Clarifying copy when classes suspended with "algunas secciones": "Se suspenden las clases solo en las secciones seleccionadas".
- Photo selector moves to step 1, after motive; strongly suggested when severity is Crítica (never required).
- Suggested option: tinted background + stronger border with severity color, not only a badge.

## Tasks
Route: delegated direct, one Haiku writer per task (user instruction, ≤100k tokens each); parent supervises and spot-checks.

- [x] T1 Rules module `lib/infraestructura/consistencia-parte.ts` + unit tests (blocked/warning/allowed tables, description required for Otro).
- [x] T2 Wire rules into wizard steps 1–3: disabled options with reason, inline warnings, mandatory description for Otro, scope copy.
- [x] T3 Server validation in `app/api/problematicas/parte/route.ts` using the same module (400 on blocked).
- [ ] T4 Severity drawer on scope "toda" + stronger visual for suggested option.
- [ ] T5 Move photo selector to step 1 + Crítica emphasis.
- [ ] T6 Active state: preload in wizard, contradiction resolution, server check.

## Checks
`npx vitest run <focused files>`, `npx tsc --noEmit`, `npx eslint <changed files>`.

## Progress / evidence
- T1: `lib/infraestructura/consistencia-parte.ts` + `lib/infraestructura/consistencia-parte.test.ts`. RED: module missing (suite failed to load). GREEN: `npx vitest run lib/infraestructura/consistencia-parte.test.ts` 36/36. `npx tsc --noEmit -p .` no errors. `npx eslint` on both files clean.
- T2: `campos-clases-edificio.tsx` (opciones bloqueadas con motivo, avisos, copy de alcance parcial), `afectacion-campos.tsx` (`AvisosConsistencia`, descripción obligatoria con "Otro"), `reporte-inicial-form.tsx` (`respuestasDeConsistencia`, bloqueos por paso en `faltanteDelPaso`). RED: 4 casos nuevos de `campos-clases-edificio.test.tsx` fallaban antes de implementar. Tests de formulario ("Otro" exige descripción) añadidos después de la implementación; pasan. GREEN: `npx vitest run components/infraestructura lib/infraestructura/consistencia-parte.test.ts` 43 archivos, 488 pasan, 18 omitidos. `npx tsc --noEmit -p .` sin errores. `npx eslint` sobre los 5 archivos limpio.

- T3: `lib/infraestructura/consistencia-parte-servidor.ts` (adaptador: arma `RespuestasConsistencia` por afectación nueva con la situación común; `primerBloqueoParte`) + `route.ts` POST, después del bucle de validación por afectación y antes de la transacción; responde 400 `{ error, codigo }` con el primer bloqueo. Pruebas: `lib/infraestructura/consistencia-parte-servidor.test.ts` (RED: módulo inexistente) y 3 casos nuevos en `route.test.ts` ("consistencia servidor (T3)": evacuación+habitual → 400, "Otro" sin descripción → 400, sólo advertencia → 201; RED: 2 de 3 respondían 201). GREEN: `npx vitest run app/api/problematicas/parte` 9 archivos, 76 pasan; `npx vitest run lib/infraestructura/consistencia-parte lib/infraestructura/consistencia-parte-servidor` 41 pasan; `npx tsc --noEmit -p .` sin errores; `npx eslint` sobre los 4 archivos limpio.

## Next step
T4 (severity drawer on scope "toda") and T6 (server check for active state) can start from `primerBloqueoParte` and `evaluarConsistenciaParte`.
