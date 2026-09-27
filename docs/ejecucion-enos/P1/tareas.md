# ENOS P1 — Umbrales provisorios de peligro mientras se calcula la climatología

## Objetivo
El Radar pinta gris ("Sin dato") toda celda sin climatología ERA5 (P90/P95/P99), que tarda
~7 días en calcularse. Puente aprobado por el usuario: umbrales fijos en mm/24h, rotulados
"provisorio", que se reemplazan solos por el método de percentiles en cuanto exista la
climatología de cada celda.

## Decisiones fijas de N1 (no tocar sin `ask`)
1. Sin climatología para (celda, período): umbrales fijos sobre precipitación acumulada:
   - 24h: amarillo > 50 mm, naranja > 80 mm, rojo > 120 mm
   - 72h: amarillo > 80 mm, naranja > 120 mm, rojo > 180 mm
   - 240h (7-10 días, sólo tendencia): umbrales de 72h × 1.5 → amarillo > 120, naranja > 180, rojo > 270
   - Constante versionada, un solo lugar, documentada como decisión razonable de arranque, NO umbral oficial.
2. Con climatología → SIEMPRE percentiles. Nunca mezcla dentro de la misma celda/horizonte.
   `sin_dato` sigue igual cuando falta el pronóstico.
3. `NivelPeligroCelda.metodo: 'percentiles' | 'umbral_provisorio' | 'sin_dato'` (retrocompatible).
   Versionar regla `peligro-v0.2`. Motor de riesgo trata provisorio como menor confianza.
4. UI: leyenda y panel muestran "Nivel provisorio (umbrales fijos de lluvia) mientras se
   calcula la climatología de la zona" con marca visual adicional (nunca sólo color). Nunca
   "alerta" ni "SMN".
5. Tests: bordes de umbral por horizonte, celda con climatología ignora umbral provisorio,
   sin pronóstico → sin_dato, campo `metodo` en la API, rótulo visible en leyenda/panel,
   motor baja confianza.

## Decisiones locales de N2 (esta ejecución, dentro del alcance de N1)
- **Ensemble**: `sync-ensemble.ts`/`obtenerProbabilidadesEnsemble` ya NO persiste filas de
  `hazardEnsembleProb` para una celda sin climatología (marca `'sin_climatologia'` y omite).
  Por lo tanto, en `calcularNivelCeldaSync` la rama ensemble nunca dispara para una celda sin
  climatología — el candidato provisorio entra únicamente por la rama determinística
  (pronóstico `precipitacion` acumulado vs. umbral fijo). Esto NO toca el job de ingesta ni
  hace llamadas a Open-Meteo. Frase "si con ensemble hay miembros, se puede usar la
  probabilidad..." queda cubierta como no-aplicable en este batch (documentar en registro).
- **Confianza del motor**: cuando el factor `peligro-celda` viene de `metodo ===
  'umbral_provisorio'`, tratarlo como evidencia parcial: sumar 1 a `cantidadFaltantes` en
  `calcularRiesgoEscuela` (mismo contador que ya baja confianza por ausencia), aunque el
  factor se agregue igual al score. Documentar la razón en un comentario corto.
- **API radar** (`app/api/infraestructura/radar/route.ts`): agregar campo top-level
  `hayNivelProvisorio: boolean` (= alguna celda del corte con `metodo === 'umbral_provisorio'`),
  aditivo, no rompe el shape existente. `app/api/infraestructura/peligro/route.ts` no necesita
  cambios: ya serializa `NivelPeligroCelda[]` completo, así que `metodo` viaja solo.
- **Replay** (`lib/infraestructura/replay/consulta.ts`): hoy omite la celda del arreglo si no
  hay climatología aunque haya pronóstico (`continue`). Pasa a usar el mismo umbral provisorio
  en ese caso (mismo criterio que producción) en vez de omitir la celda; agrega `metodo`
  opcional a `NivelPeligroReplay` (retrocompatible). Sin pronóstico sigue omitiendo la celda
  (no inventa sin_dato ahí, es el comportamiento ya documentado del archivo).
- **UI**: el detalle por horizonte agregado por departamento (`nivelesDepartamentoRadar` en
  `map-infraestructura-page.tsx`) YA tiene un gap documentado ("la API entrega el peor nivel...
  pero NO el detalle... esos campos van a null"): `metodo` se agrega al tipo
  `NivelHorizontePanel` (retrocompatible) y al render del panel, pero en ese wiring puntual
  queda `undefined` igual que `base: 'sin_dato'` ya queda hoy — no se expande ese gap. La
  señal real y visible de "hay provisorio en este corte" la lleva la LEYENDA, alimentada por
  `hayNivelProvisorio` de `/api/infraestructura/radar`.

## Tareas
- [x] T1 — Dominio: `umbrales-provisorios.ts` (nuevo), `nivel.ts` (`metodo`, `peligro-v0.2`,
      fallback provisorio determinístico), tests de bordes/mezcla/sin_dato en `nivel.test.ts`.
      Ruta: delegada (writer N3-1). Un test existente de fixture ajustado por N2 tras el
      cambio de comportamiento esperado (`nivel.test.ts`, caso `lote-clima-parcial` 72h).
- [x] T2 — Motor de riesgo: `calculo.ts` baja confianza con `metodo` provisorio + test en
      `calculo.test.ts`; verificado `motor/puertos.ts` y `motor/adaptadores/peligro.ts` sólo
      pasan el tipo (sin romper). Ruta: delegada (writer N3-1, mismo lote que T1).
- [x] T3 — Replay: `lib/infraestructura/replay/consulta.ts` usa umbral provisorio en vez de
      omitir la celda; `metodo` opcional en `NivelPeligroReplay`; test en `consulta.test.ts`.
      Ruta: delegada (writer N3-1, mismo lote que T1/T2 — mismo dominio).
- [x] T4 — API: `app/api/infraestructura/radar/route.ts` expone `hayNivelProvisorio`; test en
      `route.test.ts`; verificado `app/api/infraestructura/peligro/route.test.ts` sigue en
      verde con el campo `metodo` pasante. Ruta: delegada (writer N3-2).
- [x] T5 — UI: `peligro-legend.tsx` (+ test) delegado a N3-3; `legend-panel.tsx` (prop
      pasante), `risk-explanation-panel.tsx` (`metodo` en `NivelHorizontePanel` + badge, +
      test) y `map-infraestructura-page.tsx`/`use-radar.ts` (wiring `hayNivelProvisorio`)
      implementados directo por N2 tras 3 timeouts consecutivos de N3 en esa pieza (ruta:
      inline, archivo ya comprendido por N2 desde la exploración inicial).
- [x] T6 — Revisión breve por N3 distinto de los implementadores (T1-T5), sólo lectura:
      confirmó los 8 puntos de control, sin bloqueantes (ver registro.md §4 por el único gap
      real encontrado, ya documentado como decisión de alcance de N2).
- [x] T7 — Verificación N2 (bajo `flock ~/.cache/enos-n3/heavy.lock` por convivencia con
      otros N2): `pnpm exec vitest run --maxWorkers=2` (191 archivos/1616 tests, verde),
      `pnpm lint` (limpio), `pnpm exec tsc --noEmit` (limpio), `pnpm build` (build de
      producción exitoso).
- [x] T8 — Registro en `docs/ejecucion-enos/P1/registro.md` (decisiones, umbrales,
      verificación, pendientes; sección Gate para N1).
- [ ] T8 — Registro en `docs/ejecucion-enos/P1/registro.md` (decisiones, umbrales,
      verificación, pendientes; sección Gate para N1).

## TDD
Modo: tests junto con la implementación en cada tarea (proyecto usa vitest, sin gate TDD
explícito detectado en este batch); cada N3 corre su propio `pnpm exec vitest run` acotado a
sus archivos antes de reportar. N2 corre la suite completa al final (T7).

## Aceptación
`vitest run --maxWorkers=2`, `lint`, `tsc --noEmit`, `build` en verde. Revisión breve de un
N3 distinto. Sin commits/push/merge (los hace N1). Sin llamadas reales a Open-Meteo.
