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
- [x] T4 Severity drawer on scope "toda" + stronger visual for suggested option.
- [x] T5 Move photo selector to step 1 + Crítica emphasis.
- [x] T6 Active state: pure rule + server 409 check (b10c34f). Wizard preload dropped: new-report wizard redirects to /actualizar when afectaciones are active (user decision 2026-10-17).
- [x] T7 Apply consistency to the /actualizar flow (revisar-situacion): T1 blocks/warnings + "Solucionada / Sigue activa" sheet when moving to habitual.

- [x] T8 Update flow fixes from E2E (2026-10-17, CUE 1800831-00): (a) afectaciones being closed (solucionada/retirada) must not feed consistency rules (client + server); (b) closing the last active afectación while building is evacuado/centro_evacuados or service suspended must offer restoring building to habitual and classes to normal (no dead end).
- [ ] T9 Mobile: user cannot go back between wizard steps on mobile (new report wizard and update flow).

## Checks
`npx vitest run <focused files>`, `npx tsc --noEmit`, `npx eslint <changed files>`.

## Progress / evidence
- T1: `lib/infraestructura/consistencia-parte.ts` + `lib/infraestructura/consistencia-parte.test.ts`. RED: module missing (suite failed to load). GREEN: `npx vitest run lib/infraestructura/consistencia-parte.test.ts` 36/36. `npx tsc --noEmit -p .` no errors. `npx eslint` on both files clean.
- T2: `campos-clases-edificio.tsx` (opciones bloqueadas con motivo, avisos, copy de alcance parcial), `afectacion-campos.tsx` (`AvisosConsistencia`, descripción obligatoria con "Otro"), `reporte-inicial-form.tsx` (`respuestasDeConsistencia`, bloqueos por paso en `faltanteDelPaso`). RED: 4 casos nuevos de `campos-clases-edificio.test.tsx` fallaban antes de implementar. Tests de formulario ("Otro" exige descripción) añadidos después de la implementación; pasan. GREEN: `npx vitest run components/infraestructura lib/infraestructura/consistencia-parte.test.ts` 43 archivos, 488 pasan, 18 omitidos. `npx tsc --noEmit -p .` sin errores. `npx eslint` sobre los 5 archivos limpio.

- T3: `lib/infraestructura/consistencia-parte-servidor.ts` (adaptador: arma `RespuestasConsistencia` por afectación nueva con la situación común; `primerBloqueoParte`) + `route.ts` POST, después del bucle de validación por afectación y antes de la transacción; responde 400 `{ error, codigo }` con el primer bloqueo. Pruebas: `lib/infraestructura/consistencia-parte-servidor.test.ts` (RED: módulo inexistente) y 3 casos nuevos en `route.test.ts` ("consistencia servidor (T3)": evacuación+habitual → 400, "Otro" sin descripción → 400, sólo advertencia → 201; RED: 2 de 3 respondían 201). GREEN: `npx vitest run app/api/problematicas/parte` 9 archivos, 76 pasan; `npx vitest run lib/infraestructura/consistencia-parte lib/infraestructura/consistencia-parte-servidor` 41 pasan; `npx tsc --noEmit -p .` sin errores; `npx eslint` sobre los 4 archivos limpio.

- T4 (parcial, T4a completo; T4b pendiente de CSS): `afectacion-campos.tsx` (`CamposAQuienAfecta` recomienda al pasar a "toda" si la sugerida por alcance supera la elegida; "Cambiar a X" aplica, Crítica exige justificación en el mismo sheet; "Mantener Y" conserva; `motivos` nuevo prop) y `reporte-inicial-form.tsx` (pasa `motivos`). `campo-gravedad.tsx` añade `opcion--sugerido` a la sugerida. RED: 4 casos de drawer + 1 de clase fallaban antes de implementar. GREEN: `npx vitest run components/infraestructura` 42 archivos, 459 pasan, 18 omitidos (un caso de `reporte-inicial-form.test.tsx` ajustado: descarta el aviso con "Mantener Alta" antes de continuar). `npx tsc --noEmit -p .` sin errores. `npx eslint` sobre los 6 archivos limpio. PENDIENTE: estilo visual de `.opcion--sugerido` en `app/globals.css` (fuera de las superficies permitidas); T4 sigue sin marcar hasta aplicarlo.

- T5: `reporte-inicial-form.tsx` monta `SelectorFotosFormulario` siempre, oculto (`hidden`) fuera del paso 1, justo después de `CamposQuePaso`; nota Crítica (`aviso-badge`, "Recomendamos adjuntar una foto: ayuda a evaluar situaciones críticas.") encima del selector cuando `severidad === 'Crítica'`; paso 5 muestra "Fotos adjuntas: N" vía `armarResumen` (`reporte-inicial-resumen.ts`, prop `fotosAdjuntas` alimentada por `onCountChange`). Fotos siguen opcionales; borrador/cola offline sin cambios (las fotos se vinculan tras el envío, como antes). RED: 4 casos nuevos fallaban (selector en paso 1, Confirmar con conteo, Crítica, resumen). GREEN: `npx vitest run components/infraestructura` 42 archivos, 464 pasan, 18 omitidos; `npx tsc --noEmit -p .` sin errores; `npx eslint` sobre los 4 archivos limpio.

- T6 (parcial, sólo regla pura + servidor; T6 sigue sin marcar): commit `b10c34f` `feat(infra): reconcile new report with active school state`. `lib/infraestructura/consistencia-estado-activo.ts` (`evaluarCambioAHabitual`: evacuado|centro_evacuados → habitual exige que cada afectación activa esté en `afectacionesSolucionadas`/`afectacionesRetiradas` o en `afectacionesConfirmadas` ("sigue activa", con advertencia), y que el servicio vuelva a normal en el envío; bloqueos `habitual-con-afectaciones-activas` y `habitual-con-servicio-suspendido`). RED: `consistencia-estado-activo.test.ts` no cargaba; `route.test.ts` ("estado activo ... T6") devolvía 201 donde debía 409. GREEN: `npx vitest run app/api/problematicas/parte lib/infraestructura/consistencia-estado-activo.test.ts` 10 archivos, 87 pasan; `npx tsc --noEmit -p .` sin errores; `npx eslint` sobre los 4 archivos limpio. El servidor evalúa dentro de la transacción (`route.ts`, tras releer `parteFilaActual` y las afectaciones vigentes) y responde 409 `{ error, codigo }` (`ErrorCierreBorrador` ahora lleva `codigo`).
- T6 PENDIENTE (asistente): (a) prop opcional `estadoActual` en `ReporteInicialForm` y tarjeta "Situación actual" en paso 1 (`situacion-actual-resumen.tsx`); (b) hoja de decisiones en paso 3 al elegir "habitual" bajo la condición (ConfirmSheet, "Solucionada" / "Sigue activa" por afectación) que bloquea Continuar y envía `afectacionesSolucionadas`/`afectacionesConfirmadas`; (c) test de componente de la hoja. HALLAZGO: el asistente lo monta sólo `app/problematicas/parte/nuevo/page.tsx`, que redirige a `/actualizar` cuando hay afectaciones vigentes; la precarga desde `cargar/page.tsx` (fuera de su lugar, esa página no monta el asistente) no llega al formulario. Hace falta añadir `app/problematicas/parte/nuevo/page.tsx` y `components/infraestructura/nuevo-parte-contenido.tsx` a las superficies permitidas para cablear la precarga.

- T7: `actualizar/consistencia-actualizacion.ts` (helpers puros: `respuestasDeSituacion`, `mensajesDeBloqueo`, `alcanceDe`), `actualizar/revisar-situacion.tsx` (RespuestasConsistencia desde el estado editado; opciones bloqueadas con motivo; bloqueos y advertencias del cambio a habitual), `campos-clases-edificio.tsx` (hoja "¿Qué pasó con las afectaciones activas?" con "Solucionada" / "Sigue activa" por afectación, Confirmar bloqueado hasta elegir en todas; advertencia de `evaluarCambioAHabitual` dentro de la hoja), `actualizar/recorrido-actualizacion.tsx` (decisiones guardadas como respuestas de cada afectación, así `construirEnvio` arma `afectacionesSolucionadas`/`afectacionesConfirmadas`; bloqueos listados en el resumen y "Guardar actualización" deshabilitado mientras existan). El error 400/409 `{ error }` ya se mostraba en el resumen (`motivoEnvio`); queda cubierto por test. RED: 4 casos de hoja/bloqueo en `campos-clases-edificio.test.tsx`, 2 en `revisar-situacion.test.tsx`, 3 de flujo en `recorrido-actualizacion.test.tsx` fallaban antes de implementar (el caso sin afectaciones activas ya pasaba). GREEN: `npx vitest run components/infraestructura` 42 archivos, 474 pasan, 18 omitidos; `npx tsc --noEmit -p .` sin errores; `npx eslint` sobre los 7 archivos tocados sin errores (1 aviso `react-hooks/exhaustive-deps` en `revisar-situacion.tsx` ya existente, efecto de foco sin cambios).
- T7 límites conocidos: el bloqueo corta el envío (resumen), no cada "Continuar" de paso; sólo se evalúan situaciones tocadas por la actualización; si después de confirmar la hoja se vuelve a cambiar clases/edificio en la misma tarjeta, su respuesta de hoja se reemplaza y el envío queda bloqueado hasta volver a decidirla.

- T8 (parcial, T8 sigue sin marcar; falta el acceso a /actualizar):
  - (a) Cliente: `campos-clases-edificio.tsx` ya no bloquea "Sin daños" por la evacuación que la misma hoja cierra; si la evacuación sigue activa, la hoja muestra el bloqueo (`bloqueosHabitualPorAfectacion`, calculado en `recorrido-actualizacion.tsx`) y no deja confirmar. `revisar-situacion.tsx`: un cambio de clases/edificio en una tarjeta ya cerrada no reemplaza su cierre (antes se perdía la decisión de la hoja, el límite T7).
  - (a) Servidor: `route.ts` sólo evalúa `afectacionesNuevas`; `evaluarCambioAHabitual` descuenta solucionadas y retiradas. Sin cambios de código; cubierto por tests de regresión.
  - (b) Restablecer: en la etapa "nuevo", si todas las afectaciones quedan solucionadas y edificio o servicio están fuera de lo normal, aparece "Restablecer el funcionamiento" con la propuesta preseleccionada (habitual + clases normales). Se envía aunque no se toque y el resumen lo lista.
  - RED: 6 casos nuevos fallaban (2 en `campos-clases-edificio.test.tsx`, 2 en `recorrido-actualizacion.test.tsx`, 2 en `route.test.ts`; los de servidor fallaban por la siembra del CUE, no por la regla). GREEN: `npx vitest run components/infraestructura app/api/problematicas/parte lib/infraestructura/consistencia-parte-servidor.test.ts lib/infraestructura/consistencia-estado-activo.test.ts --maxWorkers=2` 53 archivos, 572 pasan (con paralelismo por defecto hubo timeouts de hook y de test por carga; los archivos afectados pasan aislados). `npx tsc --noEmit -p .` sin errores. `npx eslint` sin errores (1 aviso previo en `revisar-situacion.tsx`).
  - (b) Acceso a /actualizar (desbloqueado): `destinoParaParte` (`lib/infraestructura/destino-carga.ts`) devuelve `actualizar` sin afectaciones vigentes cuando el edificio no está en `habitual` o el servicio general no es `normal` (mismo criterio que el panel "Restablecer"); `nuevo` sólo si todo está en la normalidad. Ambas páginas (`actualizar/page.tsx`, `nuevo/page.tsx`) usan el mismo helper; sin cambios de firma (ya reciben el `ParteActual` completo). RED: 5 casos nuevos en `destino-carga.test.ts` fallaban (edificio evacuado/centro_evacuados/parcial, servicio suspendido por establecimiento y por turno). GREEN: `npx vitest run lib/infraestructura/destino-carga.test.ts components/infraestructura/actualizar --maxWorkers=2` 7 archivos, 90 pasan; `app/problematicas/parte/actualizar app/problematicas/parte/nuevo` 15 pasan; `npx tsc --noEmit -p .` sin errores; `npx eslint` sobre los 3 archivos limpio. El caso "sin afectaciones con edificio evacuado muestra Restablecer" en `recorrido-actualizacion.test.tsx` ya pasaba con el componente (cobertura nueva, no RED). Decisión: "parcial" del edificio también rutea a actualizar, porque el panel lo ofrece restablecer.

## Next step
T9 (mobile: navegación entre pasos del asistente).
