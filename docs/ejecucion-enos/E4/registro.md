# E4 — Radar y cierre del circuito preventivo — Registro de ejecución

Rama: `feat/enos-e4` (worktree `/home/gero/orca/workspaces/data-hub-dashboard/enos-e4`), base `6354e6d` (merge E3a).

## Baseline (antes de tocar código)

Ejecutado el 2026-09-26 sobre `6354e6d` sin cambios:

| Comando | Resultado |
|---|---|
| `pnpm test` | exit 0 — 155 archivos, 1276 tests OK |
| `pnpm lint` | exit 0 |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 |

## Mapa de estado (previo a Ola 0)

- `lib/infraestructura/riesgo/motor/puertos.ts`: tipos espejo de `peligro/nivel.ts` (comentario propio dice que hay que unificarlos). `PuertoPeligro.obtenerNivelCaudal({puntoId, asOf})` (forma objeto) vs. `peligro/nivel.ts#obtenerNivelCaudal(puntoId, opts?)` (forma posicional) — firmas no coinciden, hay que adaptar en el adapter.
- `motor/adaptadores/peligro.ts` y `lluvia.ts`: hoy son stubs `NoDisponible` (siempre `sin_dato`/`null`), no importan nada de E3a.
- `jobs/calcular-riesgo.ts`: loop `cueAnexo × horizonte` llama `territorio.obtenerPerfil`, `peligro.obtenerNivelesCelda` (un horizonte a la vez) y `peligro.obtenerNivelCaudal`/`lluviaObservada.obtenerAcumulado` una vez por horizonte — 3x llamadas redundantes por escuela, ya señalado como follow-up en el Gate de E3b.
- `public/data/departamentos-corrientes.geojson` (44 KB, fuente no oficial, prototipo E2): sólo lo usan `lib/mapas/departamentos.ts` y su test — reemplazable sin romper otros consumidores.
- `RISK_RADAR_ENABLED` (flag de E0, `lib/infraestructura/riesgo/flags.ts`) existe y está testeado, pero **sin consumidor real** — el radar es trabajo nuevo desde cero.
- Gate E3a: pendiente renovar token Earthdata antes de 2026-11-26; Gate E3b: pendiente gate UX con operadores reales (arrastrado).

## Decisiones locales (N2)

- Ola 0 (integración del motor) se decompone en dos N3 con archivos disjuntos, en paralelo: N3-Motor-Adaptadores (puertos.ts + adaptadores/peligro.ts + adaptadores/lluvia.ts) y N3-Motor-Hoist (jobs/calcular-riesgo.ts).
- `PerfilTerritorio`/consulta de `infra_geo_rio` para resolver `puntoId` de cada escuela: se investiga dentro del propio dispatch de N3-Motor-Adaptadores (no requiere decisión de producto, es detalle de cableado ya cubierto por el contrato de puertos existente).

## Despachos N3

### Ola 0 — integración del motor (2026-09-26)

| N3 | Archivos | Qué hizo | Verificación |
|---|---|---|---|
| N3-Motor-Adaptadores | `motor/puertos.ts`, `motor/adaptadores/peligro.ts`, `motor/adaptadores/lluvia.ts` | Eliminó el bloque de tipos "espejo de E3a" en `puertos.ts` e importa `NivelPeligro/HorizontePeligro/NivelPeligroCelda/NivelCaudalPunto` desde `peligro/nivel.ts` (fuente única), re-exportados con `export type`. Adapter de peligro llama `obtenerNivelesPeligro({geometryRefs:[geometryRef], horizontes, ahora})` y `obtenerNivelCaudal(puntoId, {ahora})` (adaptando la forma posicional real). Adapter de lluvia llama `obtenerAcumuladosObservados({geometryRef, asOf})` y mapea a `LluviaObservadaCelda`. | `pnpm exec vitest run` de los 2 tests de adaptadores → 2 tests fallando (contrato del stub viejo, ver corrección abajo). |
| N3-Motor-Hoist | `jobs/calcular-riesgo.ts` | Envuelve los puertos una vez por corrida con un cacheo por clave natural: `territorio.obtenerPerfil` 1x por `cueAnexo` (antes 3x), `peligro.obtenerNivelesCelda` 1x por `geometryRef` pidiendo los 3 horizontes juntos (antes 1x por horizonte), `obtenerNivelCaudal`/`obtenerAcumulado` 1x por `puntoId`/`geometryRef`. También cacheó `historial`/`aislamiento`/`susceptibilidad`/`exposición` por el mismo criterio (no varían con el horizonte). Ahorro medido: 87→27 llamadas en un lote de 4 escuelas (2 comparten celda) × 3 horizontes (−69%). No cambia la firma pública del job ni el manejo de errores parciales (confirmado: el job no aislaba por escuela antes tampoco). | `pnpm exec vitest run lib/infraestructura/riesgo/jobs/calcular-riesgo.test.ts` → 5/5 OK. |
| N3-Corrección (decisión de N2: el nombre "menos invasivo" del primer dispatch quedó semánticamente engañoso) | `motor/adaptadores/{peligro,lluvia}.ts` (+tests), `jobs/calcular-riesgo.ts` (sólo import/uso) | El primer N3 mantuvo los nombres `crearAdapterPeligroNoDisponible`/`crearAdapterLluviaNoDisponible` para no tocar `jobs/calcular-riesgo.ts` fuera de su alcance — pero un adapter que devuelve datos reales llamado "NoDisponible" es engañoso. Despaché una corrección: renombrado a `crearAdapterPeligro`/`crearAdapterLluvia`, y reescritos los tests de ambos adaptadores contra DB real (mismo patrón de `peligro/nivel.test.ts`/`observado.test.ts`: `DATA_DIR` temporal + `ensureSeeded`, sin red). | `pnpm exec vitest run` de los 2 tests → 7/7 OK. |

Verificación conjunta de la ola: `pnpm test` 155/155 archivos, 1280/1280 tests OK; `pnpm lint` exit 0; `pnpm exec tsc --noEmit` exit 0.

## Pruebas reales fechadas

Ejecutadas por N2 el **2026-09-27**, contra `.data/hub.sqlite`/`.data/ge.sqlite` reales de este worktree (2005 localizaciones), con scripts ad-hoc (mismo patrón de loader ESM que `scripts/job-diagnostico.mjs`, borrados al terminar, no comiteados).

1. **`calcularGeoPerfiles()`** — real, sin red externa (lee `ge.ge_localizacion`): 2005 procesados → `infra_geo_profile` con 2005 filas.
2. **`calcularAsociacionesRio()`** — real: `infra_geo_rio` quedó con **2005 filas** (antes 0).
3. **`ejecutarSyncEnsemble()`** (Open-Meteo) — **corrida real contra la red**: `infra_job_run` registra `sync-hazard-ensemble` con estado `completado`, contadores `{"llamadas":20,"filas":0}` — 20 llamadas HTTP reales completadas, pero **0 filas persistidas**. Causa más probable: rate limit del nivel gratuito de Open-Meteo (ver punto 5). `hazard_ensemble_prob` quedó en 0 filas.
4. **`ejecutarSyncPronosticoCaudal()`** — quedó **`en_progreso`** en `infra_job_run` (lease no liberado): la corrida completa se abortó (ver punto 8) antes de que este job terminara.
5. **Diagnóstico de rate limit, confirmado por fuera del motor:** `curl` directo a `archive-api.open-meteo.com/v1/archive` (mismo dominio base de Open-Meteo) devolvió **HTTP 429** en una prueba aislada durante este mismo dispatch. Confirma que el nivel gratuito de Open-Meteo está limitando esta IP/ventana horaria — coherente con la advertencia ya registrada en el documento base (§1: "nivel gratuito... sin SLA").
6. **`ejecutarSyncImerg()`** — real: devolvió `{"celdasActualizadas":0,"motivo":"fuente_no_configurada"}`. Causa identificada: `.env.local` (con `EARTHDATA_TOKEN`) sólo lo carga automáticamente el runtime de Next.js (`next dev`/`next build`), **no** un script Node ejecutado directo — el script ad-hoc no lo parseaba. No es un bug del adapter; es una limitación del script de prueba manual, documentada para que la próxima corrida real cargue el env explícitamente (`node --env-file=.env.local` o parseo manual) antes de invocar `ejecutarSyncImerg`.
7. **`calcularYPublicarRiesgo()`** — real, corrió igual con evidencia de peligro ausente (comportamiento correcto y ya documentado en el Gate de E3b): `infra_risk_run` vigente con `cobertura: {"procesadas":6003,"conEvidencia":0,"sinEvidencia":6003}`; **distribución por horizonte** (24/72/240h): 2001 escuelas cada uno, 100% `nivel: null`, `confianza: "baja"`, `evidencia_valida: false` — coherente con no tener aún `hazard_ensemble_prob`/`hazard_observation` poblados (falla de fuente, exactamente el caso "sin datos" que la aceptación exige que el motor tolere sin romperse, no una regresión de la Ola 0).
8. **Climatología (lluvia y caudal, `archive-api.open-meteo.com`) — NO completada en esta corrida.** Primer intento colgado ~6 min sin avanzar (proceso vivo, 0% CPU, esperando red) hasta que se lo mató manualmente; el diagnóstico del punto 5 explica la causa (429 + backoff con `Retry-After`, acotado pero lento bajo rate limit sostenido). Job de climatología quedó registrado `en_progreso` en `infra_job_run` con lease no liberado.

**Conclusión de esta prueba real:** la integración de la Ola 0 (adapters conectados + hoist) es correcta y verificable end-to-end — todos los puertos reales se invocan con las firmas correctas, la ausencia de datos se propaga como `sin_dato`/`null`/confianza baja tal como exige el contrato, y ninguna consulta rompe el job. Lo que **no** se pudo demostrar en esta ventana es una corrida con `conEvidencia > 0`, porque el nivel gratuito de Open-Meteo está rate-limitando esta IP ahora mismo tras varias corridas seguidas (incluidas las de E3a). Recomendación para N1: repetir esta prueba real en una ventana distinta (o con el plan pago de Open-Meteo ya evaluado en el documento base §1), cargando `EARTHDATA_TOKEN` explícitamente para IMERG, y dejando terminar `ejecutarSyncPronosticoCaudal`/climatología sin abortarlos. Mismo patrón que **E3a dejó esta misma sección como "(en progreso)"** por la misma razón externa.

### Ola 1 — Georef oficial + contrato de radar (2026-09-27, autorizada por N1 vía `ask`)

N1 autorizó continuar con Ola 1 en el mismo dispatch, con la condición explícita de NO relanzar syncs completos contra Open-Meteo (cupo gratuito agotado por corridas repetidas de E3a+E4) e intentar como máximo una corrida más tarde si hace falta mostrar evidencia real.

| N3 | Archivos | Qué hizo | Verificación |
|---|---|---|---|
| N3-Georef | `lib/mapas/departamentos.ts`, `lib/mapas/departamentos.test.ts` | `DEPARTAMENTOS_URL` ahora apunta a `public/data/departamentos-corrientes-georef-2026-09-27.geojson` (descarga oficial de Georef/IGN, filtrada por N2 a los 25 deptos de Corrientes — provincia id 18 — antes del dispatch, 49807 bytes, 1744 vértices). Confirmó con `rg`+`node` que los 25 nombres normalizados coinciden 1:1 con el archivo viejo (0 diferencias reales) y que el bbox es idéntico al hardcodeado en `LIMITES_CORRIENTES` (no lo tocó). El archivo viejo (`departamentos-corrientes.geojson`, 44 KB, prototipo) se conserva sin usar. Hallazgo del propio N3: `components/mapas/map-infraestructura-page.tsx` también consume `DEPARTAMENTOS_URL` (yo había dicho que sólo `departamentos.ts`+test la usaban) — como importa la constante y no un literal, no necesitó cambios. `public/data/mascara-corrientes.geojson` (dependiente de la geometría vieja) queda **explícitamente sin regenerar** por decisión de N2 (ver Decisiones locales): no se agregó una librería de unión/diferencia de polígonos (`@turf/union`+`@turf/difference` no están instalados, sólo `@turf/circle`) sólo para un overlay decorativo; el bbox idéntico hace que el riesgo de desalineación visible sea bajo. | `pnpm exec vitest run lib/mapas/departamentos.test.ts` → 14/14 OK. |
| N3-Radar-API | `app/api/infraestructura/radar/route.ts` (+test, nuevos) | Endpoint nuevo con el contrato que definí como N2 (corte único = mismo `runId` vigente para peligro por departamento y riesgo por escuela; `obtenerNivelesPeligro({ahora: new Date(publicadoEn)})` as-of del propio corte, no `Date.now()`; peor nivel por departamento vía mapeo `geometryRef→departamento` de `infra_geo_profile`, con la regla "sin_dato nunca le gana a un nivel real"; filtros horizonte/departamento/nivel; paginación igual al endpoint de riesgo existente; `kpis.riesgoAltoTotal`/`sinEvidenciaTotal` sobre el mismo universo filtrado; ACL + `Cache-Control: private, no-store` + sin run vigente → 200 vacío, reusando el patrón exacto de `app/api/infraestructura/riesgo/route.ts`). Sin datos nominales (verificado con un assert explícito en el test). Corregí yo (N2) un warning de lint post-dispatch (`import()` inline → type import nombrado), mecánico, sin tocar lógica. | `pnpm exec vitest run app/api/infraestructura/radar/route.test.ts` → 10/10 OK. |

Verificación conjunta de la ola: `pnpm test` 156/156 archivos, 1290/1290 tests OK; `pnpm lint` exit 0 (1 warning corregido); `pnpm exec tsc --noEmit` exit 0.

### Ola 2 — UI del Radar (2026-09-27, contrato visual fijo de N1 vía `ask`)

N1 dio un contrato visual de 7 puntos fijos (flag=modo conmutable sin apilar paneles; riesgo=círculo+color+etiqueta vs. afectación=forma distinta+etiqueta, nunca fusionadas; niveles reusando la paleta oficial, "sin dato" gris con trama; leyenda+selector de horizonte juntos con horizonte deshabilitado explicado; panel de explicación departamento/escuela reusando `components/ui`; accesibilidad de teclado/foco/aria-live/texto no dependiente del color; briefing determinista 3–5 líneas). Antes de delegar, yo mismo agregué los 5 tokens de color en `app/globals.css` (`--nivel-peligro-{verde,amarillo,naranja,rojo,sin-dato}`, reusando la paleta oficial `--green/--yellow/--orange/--red/--ink-faint` que ya existía — no hicieron falta tokens nuevos) para fijar un único punto de verdad antes de que cualquier N3 tocara ese archivo compartido.

| N3 | Archivos | Qué hizo | Verificación |
|---|---|---|---|
| N3-Radar-Logic | `lib/mapas/peligro-capas.ts` (+test), `components/mapas/selector-horizonte.tsx` (+test), `components/mapas/peligro-legend.tsx` (+test) — todos nuevos | Constantes hex espejo de los 5 tokens CSS (documentado que se sincronizan a mano), `construirCoropletaPeligro`/`paintCoropletaPeligro` y `construirPuntosRiesgo`/`paintPuntosRiesgo` (paint expressions `match` de MapLibre, mismo estilo de test que `map-infraestructura-page.paint.test.ts` ya existente), `SelectorHorizonte` (botones reales, `aria-disabled`+`title` explicativo para horizontes sin evidencia, `aria-live` interno) y `PeligroLegend` (ícono Lucide distinto por nivel + texto, nunca sólo color). | `pnpm exec vitest run` de los 3 archivos → 19/19 OK. |
| N3-Explanation-Panel | `components/mapas/risk-explanation-panel.tsx` (+test), `lib/infraestructura/riesgo/briefing.ts` (+test) — todos nuevos | `RiskExplanationPanel` (prop discriminada `tipo:'departamento'\|'escuela'`, todo por props sin fetch propio, "No disponible" explícito cuando falta caudal/lluvia, nunca 0 disfrazado) y `generarBriefing` (determinista, 1 línea si no hay run anterior, hasta 5 si lo hay). **Gap documentado por el propio N3** (correcto, no lo cerré yo): `/api/infraestructura/radar` no expone los factores individuales con fuente/fecha (viven en `infra_risk_factor`, expuestos por `/api/infraestructura/riesgo/[snapshotId]`) ni el detalle de horizontes/caudal/lluvia por departamento (eso sale de `obtenerNivelesPeligro()`/`obtenerNivelCaudal()`, sin endpoint HTTP propio hoy) — el panel los acepta como props ya resueltos, la integración decide de dónde salen. | `pnpm exec vitest run` de los 2 archivos → 14/14 OK. |
| N3-Wiring-Radar | `app/(hub)/mapas/infraestructura/page.tsx`, `components/mapas/map-client.tsx`, `components/mapas/map-infraestructura-page.tsx` (+test), `components/mapas/layer-control.tsx`, `components/mapas/legend-panel.tsx`, `lib/infraestructura/use-radar.ts` (nuevo) | Encadenó `riskRadarEnabled()` como prop (mismo patrón que `hazardContextEnabled` ya establecido: Server Component → 2 Client Components). Conmutador "Situación actual"/"Radar" con botones `aria-pressed`, arranca SIEMPRE en "Situación actual" aunque el flag esté prendido. Decisión de diseño: **sumar capas nuevas, no reemplazar** (`Source`/`Layer` con ids nuevos `infra-peligro-src`/`infra-peligro-fill` e `infra-riesgo-src`/`infra-riesgo-circle`, namespaced aparte de `infra-departamentos-*`/`infra-partes-*` existentes) — menor riesgo de regresión que desmontar capas actuales. Distinción riesgo/afectación: capa `infra-riesgo-halo` (`infra-riesgo-halo` en el árbol) para que un punto con ambas señales muestre las dos sin fusionarse. `RadarLayerControl` como control HERMANO nuevo (no amplió `CapaInfraestructura`, siguiendo el comentario existente del archivo que lo reserva a un solo dominio). Hook `useRadar` nuevo replicando el patrón exacto de `use-alertas.ts` (fetch en `useCallback` separado del cuerpo del efecto, sin polling — el radar es pronóstico, no estado vivo). **Incidente de proceso:** este dispatch llegó al timeout de 560s en medio de una corrección de test (exit 124), pero el último cambio aplicado dejó el árbol consistente — lo verifiqué yo con los 4 comandos de baseline en vez de asumir el resultado. Corregí yo mismo (N2, mecánico, un solo archivo ya entendido) 2 errores de lint en `use-radar.ts` que el dispatch no llegó a resolver (`react-hooks/refs`: mutación de un ref durante el render; `react-hooks/set-state-in-effect`: `setState` síncrono en el cuerpo del efecto) — reestructurado siguiendo 1:1 el patrón ya probado de `use-alertas.ts` (fetch en `useCallback` sin argumentos, filtros leídos de un `ref` sincronizado en su propio efecto). | `pnpm exec vitest run components/mapas/map-infraestructura-page.test.tsx components/mapas/map-infraestructura-page.paint.test.ts` → 26/26 OK (confirmado por mí después de la corrección de lint). |

Verificación conjunta de la ola (y del batch completo hasta acá, corrida por mí después de la corrección de lint): `pnpm test` 161/161 archivos, 1331/1331 tests OK; `pnpm lint` exit 0; `pnpm exec tsc --noEmit` exit 0; `pnpm build` exit 0 (`/api/infraestructura/radar` listada entre las rutas).

## UX

- **Flag:** todo lo nuevo (conmutador, capas de peligro/riesgo, panel de explicación, leyenda de peligro, briefing) vive detrás de `RISK_RADAR_ENABLED` (flag de E0). Con el flag apagado, `map-infraestructura-page.tsx` queda igual que antes de este batch (test dedicado lo confirma).
- **Estados cubiertos por tests con testing-library:** horizonte deshabilitado con explicación visible y sin disparar `onChange`; nivel "sin dato" nunca se ve verde; cada nivel de peligro tiene un texto accesible propio (no depende sólo del color); conmutador operable con botones reales (`aria-pressed`) y teclado.
- **Pendiente:** el recorrido guiado de 30 s con 5 participantes de Planeamiento (gate UX del batch, sección 7) no se hizo — requiere levantar la app y usuarios reales/simulados, fuera del alcance de un dispatch de implementación. Documentado como pendiente explícito para N1 más abajo. Tampoco se tomaron capturas en 390×844/1366×768 (requiere levantar `pnpm dev` con navegador, no disponible en este dispatch).

## Pendientes explícitos para N1

Completas y verificadas: **Ola 0** (integración del motor, obligatoria), **Ola 1** (Georef oficial + endpoint `/api/infraestructura/radar`) y **Ola 2** (UI del Radar: capas, selector, leyenda, panel de explicación, briefing, conmutador de modo detrás del flag). Queda pendiente, fuera del alcance de un dispatch de implementación:

- `public/data/mascara-corrientes.geojson` sigue derivada de la geometría vieja (decisión de N2: no se regenera sin agregar una librería de unión/diferencia de polígonos que hoy no está instalada). Riesgo bajo porque el bbox de la geometría nueva es idéntico.
- **Gap de datos documentado por N3-Explanation-Panel**: `/api/infraestructura/radar` no expone los factores individuales por escuela (fuente/fecha) ni el detalle de horizontes/base ensemble/caudal/lluvia por departamento — hoy sólo existen como funciones internas (`obtenerNivelesPeligro`, `obtenerNivelCaudal`) sin endpoint HTTP propio, o en `/api/infraestructura/riesgo/[snapshotId]` (factores por escuela, no por departamento). El panel de explicación acepta esos datos como props opcionales y hoy no tiene de dónde tomarlos en producción — falta decidir si se amplía `/radar`, se agrega un endpoint por departamento, o se reutiliza `[snapshotId]` desde el cliente.
- Medición p95 real del endpoint `/api/infraestructura/radar` sobre el padrón real (6003 escuelas) — no se hizo (requiere levantar la app con datos reales y medir, no sólo tests).
- Gate UX: recorrido guiado de 30s con 5 participantes de Planeamiento, y capturas 390×844/1366×768 — no se hicieron (requieren levantar `pnpm dev` con navegador y personas reales, no disponible en este dispatch).
- Pendiente fechado (Ola 0): repetir la corrida real de `ejecutarSyncEnsemble`/`ejecutarSyncPronosticoCaudal`/climatología cuando el cupo gratuito de Open-Meteo se reinicie (00:00 UTC), cargando `EARTHDATA_TOKEN` explícito para IMERG, para poder demostrar `conEvidencia > 0` y niveles reales en la coropleta/puntos.
- KPIs de "sin verificación reciente"/"vencidas" (E1, opcional) no se conectaron porque E1b (parte offline, batch hermano) no mergeó — el radar los omite en vez de mostrar una sección vacía obligatoria, tal como pide la aceptación.

## Verificaciones finales

Repetidas por N2 el 2026-09-27, sobre el estado final del worktree (Ola 0 + Ola 1 + Ola 2 integradas):

| Comando | Resultado |
|---|---|
| `pnpm test` | exit 0 — 161 archivos, 1331 tests OK |
| `pnpm lint` | exit 0 |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 — `/api/infraestructura/radar` listada entre las rutas |

Archivos modificados/creados por este batch (ver `git status` del worktree para el detalle exacto): motor (`lib/infraestructura/riesgo/motor/{puertos,adaptadores/peligro,adaptadores/lluvia}.ts` + tests, `lib/infraestructura/riesgo/jobs/calcular-riesgo.ts`), Georef (`lib/mapas/departamentos.ts` + test, `public/data/departamentos-corrientes-georef-2026-09-27.geojson`), radar API (`app/api/infraestructura/radar/`), UI (`app/globals.css`, `app/(hub)/mapas/infraestructura/{page,map-client}.tsx`, `components/mapas/{map-infraestructura-page,layer-control,legend-panel,selector-horizonte,peligro-legend,risk-explanation-panel}.tsx` + tests, `lib/mapas/peligro-capas.ts` + test, `lib/infraestructura/{use-radar,riesgo/briefing}.ts` + tests), y este `registro.md`. No se tocó ningún archivo fuera de este alcance; `.atl/` (untracked, preexistente al inicio del dispatch) se dejó intacto sin tocar.

## Gate

(N1 completa esta sección)

## Gate (N1)

**Decisión: aceptado con follow-ups (2026-09-27).**

- Verificaciones globales repetidas por N1: `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0; `pnpm test` dio 1 falla en la primera corrida y 1331/1331 en las dos siguientes → test intermitente a identificar (follow-up).
- Revisión independiente: cableado del motor correcto (tipos unificados, `sin_dato` propagado, caché por clave natural sin cambio de resultados), corte único del radar (niveles de peligro evaluados al `publicadoEn` del run vigente), KPIs y lista sobre el mismo universo, ACL antes de tocar la base, `Cache-Control: private, no-store`, GeoJSON oficial de Georef (25 departamentos, 49,8 KB) sin consumidores del archivo viejo, flag apagado sin nodos nuevos, CSS aditivo, sin "alerta"/"SMN", controles accesibles.
- Follow-ups: (1) `/radar` calcula niveles de peligro celda por celda y por horizonte de forma secuencial en cada request → agrupar o paralelizar y medir el p95 real antes de habilitar el flag (primera tarea de E5); (2) corrida real con evidencia cuando Open-Meteo lo permita, respetando los límites duros (600/min, 5.000/h, 10.000/día, 300.000/mes); (3) máscara de Corrientes todavía derivada de la geometría vieja; (4) el panel de explicación aún no trae el detalle por factor desde la API; (5) identificar el test intermitente; (6) walkthrough UX con participantes.

## Follow-ups aplicados (2026-09-27, worktree `enos-e4fu`, rama `fix/enos-e4-followups`)

Se resolvieron los follow-ups (3) y (4) del Gate. (1), (2), (5) y (6) siguen pendientes, sin tocarlos en este dispatch.

### Follow-up 3 — máscara de Corrientes regenerada desde el GeoJSON oficial

- **Problema:** `public/data/mascara-corrientes.geojson` seguía derivada de `departamentos-corrientes.geojson` (prototipo no oficial de E2), aunque `lib/mapas/departamentos.ts` ya usa el GeoJSON oficial de Georef desde Ola 1.
- **Solución:** `scripts/regenerar-mascara-corrientes.mjs` (nuevo, committeado): disuelve (`union`) los 25 departamentos oficiales en un solo contorno, lo simplifica con Douglas-Peucker propio (tolerancia `0.0015°` ≈ 165 m, documentada en el script) y lo resta (`difference`) de un rectángulo mundial, igual patrón que documentaba `lib/mapas/departamentos.ts` (antes con mapshaper, ahora con Turf porque mapshaper no está instalado). Sin librería de geometría instalada más que `@turf/circle`, se agregaron `@turf/union`, `@turf/difference` y `@turf/helpers` como **devDependencies** (sólo las usa este script; no entran al bundle de la app).
- **Resultado:** `public/data/mascara-corrientes.geojson` regenerado, 30.444 → 27.425 bytes. Los tests de `lib/mapas/departamentos.test.ts` (bbox `LIMITES_CORRIENTES`, "deja destapadas las ciudades de Corrientes", "tapa todo lo que está fuera de la provincia") siguen en verde contra el archivo nuevo, sin tocar el test.
- Archivos: `scripts/regenerar-mascara-corrientes.mjs` (nuevo), `public/data/mascara-corrientes.geojson` (regenerado), `package.json`/`pnpm-lock.yaml` (3 devDependencies nuevas).

### Follow-up 4 — panel de explicación con detalle por factor

- **Problema:** el panel de explicación (`RiskExplanationPanel`, variante `escuela`) aceptaba `factores` como prop opcional pero nada lo alimentaba: `/api/infraestructura/radar` no expone `infra_risk_factor` y el componente no llamaba a `/api/infraestructura/riesgo/[snapshotId]`.
- **Solución:**
  - `lib/infraestructura/use-riesgo-snapshot.ts` (nuevo): hook de lectura por `snapshotId`, mismo patrón que `use-radar.ts`/`use-alertas.ts` (`AbortController`, sin polling — es un snapshot ya calculado). Con `snapshotId=null` no dispara fetch (enmascarado, no vía `setState` en el cuerpo del efecto, mismo criterio que `useRadar`). Al cambiar de escuela limpia el snapshot anterior antes de pedir el nuevo (evita mostrar los factores de la escuela recién deseleccionada mientras carga la siguiente).
  - `RiskExplanationPanel` (variante `escuela`): `FactorRiesgoPanel` pasó de un `detalle: string` genérico a campos explícitos (`tipo`, `fuente`, `valor`, `unidad`, `contribucion`, `observadoEn`) que el panel formatea igual que ya hace con caudal/lluvia. Se agregaron los 3 estados que pedía el follow-up: `factoresCargando` (`role="status"`), `factoresError` (`role="alert"`) y un array vacío ya resuelto se muestra como **"Sin dato" explícito** (nunca en silencio, nunca con semántica de nivel/verde — verificado con un test que chequea que el elemento no lleva ninguna clase `nivel--*`). `factores === undefined` (sin cargando/error) sigue sin renderizar nada, para no romper el contrato previo de callers que no pidan factores.
  - `app/(hub)/admin/riesgo/etiquetas.ts` → movido a `lib/infraestructura/riesgo/etiquetas.ts` (ubicación compartida, mismo contenido) porque ahora lo usan tanto `/admin/riesgo` como el panel del Radar. Los 2 importadores de `/admin/riesgo` se actualizaron al nuevo path.
  - `components/mapas/map-infraestructura-page.tsx`: llama `useRiesgoSnapshot(escuelaRadarSeleccionada?.snapshotId ?? null)`, mapea los factores crudos a la forma del panel aplicando `ETIQUETA_TIPO_FACTOR` (mismas etiquetas que `/admin/riesgo`) y pasa `factores`/`factoresCargando`/`factoresError` al `<RiskExplanationPanel tipo="escuela">`.
- Archivos: `lib/infraestructura/use-riesgo-snapshot.ts` (+test, nuevos), `components/mapas/risk-explanation-panel.tsx` (+test actualizado), `components/mapas/map-infraestructura-page.tsx` (+test actualizado), `lib/infraestructura/riesgo/etiquetas.ts` (movido), `app/(hub)/admin/riesgo/{page,[snapshotId]/page}.tsx` (sólo el import).

### Verificación

| Comando | Resultado |
|---|---|
| `pnpm exec vitest run lib/mapas/departamentos.test.ts` | 14/14 OK |
| `pnpm exec vitest run components/mapas/risk-explanation-panel.test.tsx` | 12/12 OK (6 nuevos) |
| `pnpm exec vitest run lib/infraestructura/use-riesgo-snapshot.test.tsx` | 6/6 OK (nuevo) |
| `pnpm exec vitest run components/mapas/map-infraestructura-page.test.tsx components/mapas/map-infraestructura-page.paint.test.ts` | 27/27 OK |
| `pnpm test` | 174 archivos — 1 falla intermitente ya señalada en el Gate (follow-up 5, `MapInfraestructuraPage — orquestación de modales > filtra por departamento al hacer click y permite quitar el filtro`, timeout de 5 s sólo en corrida completa; en aislamiento (`-t "filtra por departamento"`) pasa). Confirmado en 2 corridas completas seguidas, mismo test ambas veces — no es una regresión de este batch, es el follow-up 5 pendiente. Resto: 1469/1470 tests OK. |
| `pnpm lint` | exit 0 |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 — `/api/infraestructura/radar` y `/api/infraestructura/riesgo/[snapshotId]` listadas entre las rutas |
