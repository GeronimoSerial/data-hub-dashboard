# Registro de ejecución — Batch E7b (replay y evaluación temporal, backend + dataset)

Batch E7b del plan de ejecución ENOS 2026/2027: replay de solo lectura sobre
las dos vistas temporales ("conocido en ese momento" / "vigencia
reconstruida"), export en CSV/JSON, evaluación reproducible de anticipación y
dataset desidentificado versionado para uso futuro de E10. Sin UI (la UI de
replay queda para después de E4). Principio rector: el único ingreso manual
sigue siendo el parte que carga la escuela; este batch es puramente analítico
de solo lectura, no agrega carga ni operación manual.

Rama `feat/enos-e7b`, worktree propio, base `8b78fb9` (incluye E0, E1/E1b, E2,
E3a, E3b, E7a y OPS1, y el fix de as-of por fecha de registro de
`fix/enos-followups`, verificado leyendo
`lib/infraestructura/episodios-derivados/regla.ts`).

Nota de proceso: este batch se retomó de un batch anterior interrumpido. Al
empezar ya existían, sin commitear, trabajo de una ola previa: los índices de
schema.ts/seed.ts (T1) y una primera versión de tipos.ts/fixtures.ts/consulta.ts
(T2/T3 parcial, con `nivelesPeligro`/`lluviaObservada`/`saludFuentes` devolviendo
arreglos vacíos). Ese trabajo se conservó íntegro; esta sesión completó T3 y
ejecutó T4-T10.

## 1. Baseline (heredado, antes de tocar código de esta sesión)

Registrado por el batch anterior en `odd/tasks/e7b.md`:

| Verificación | Comando | Resultado |
|---|---|---|
| Tests | `pnpm test` | 1400 passed / 4 failed / 1404 total, exit 0 (4 fallas preexistentes no relacionadas: `lib/auth.test.ts` por una condición de carrera de DATA_DIR entre tests, y 2 timeouts en `components/mapas/map-infraestructura-page.test.tsx`, archivo de E4, batch hermano — no se tocó) |
| Lint | `pnpm lint` | exit 0 |
| Types | `pnpm exec tsc --noEmit` | exit 0 |
| Build | `pnpm build` | exit 0 |

Hallazgo inesperado ya reportado: directorio no rastreado `.atl/` presente
desde antes de esta tarea. No creado por E7b, no tocado.

## 2. Decisiones locales (heredadas + de esta sesión)

Heredadas de la ola anterior (`odd/tasks/e7b.md`):

- Índices nuevos en bloque propio `// E7b:` al final de `schema.ts`/`seed.ts`:
  `infra_afectacion_creada_en_idx_e7b` (creadaEn), `infra_afectacion_rige_desde_idx_e7b`
  (rigeDesde), `infra_risk_run_publicado_en_idx_e7b` (publicadoEn) — mismas
  columnas ya existentes, ninguna agregada por una migración `ensure*`
  posterior.
- Dataset desidentificado: archivos CSV bajo `${DATA_DIR}/dataset-replay-e7b/`
  (`DATA_DIR` ya resuelto por `lib/data-dir.ts`).
- Flag de UI: no se crea flag nuevo (no hay UI en este batch); el futuro
  consumidor de UI reusará `RISK_ENGINE_ENABLED` por analogía con
  `/admin/riesgo`, decisión final del batch de UI post-E4.
- As-of "conocido" filtra por `creadaEn <= t` en `infra_afectacion` (nunca por
  `rigeDesde`); "vigencia reconstruida" usa `rigeDesde`/`retiradaEn`.
- Export sin manifiesto ni hashes (decisión de producto del plan, 2026-09-26).

De esta sesión:

- **Peligro/lluvia/salud sin dividir en dos vistas**: a diferencia de
  `infra_afectacion`, ninguna de estas tres fuentes tiene semántica de
  "corrección tardía" documentada (no hay un campo de "cuándo se corrigió" para
  el peligro o la lluvia observada), así que el replay les aplica UN SOLO
  as-of por fecha de emisión/ingesta, sin bifurcar por `vista`. Documentado en
  el encabezado de `lib/infraestructura/replay/consulta.ts`.
- **Nivel de peligro por celda anclado a horizonte 24 h**: la Capa 1 (E3a)
  produce niveles a 24/72/240 h; el replay ancla a 24 h (el más cercano a un
  estado puntual) para no bifurcar en múltiples horizontes en esta versión.
  Ampliar a multi-horizonte queda para el batch de UI post-E4.
- **`nivelesPeligro` NO reusa `obtenerNivelesPeligro`**: esa función (E3a)
  siempre usa la fila más reciente sin corte temporal — no sirve para "qué se
  sabía en t" de un instante pasado. El replay arma su propia consulta as-of
  por `corridaEn <= t`, reusando las funciones puras `nivelDesdeEnsemble` /
  `nivelDesdeDeterministico` para no bifurcar la regla de umbrales. Se
  exportaron de forma aditiva (sin cambiar valores ni firmas) los literales
  `VARIABLE_ENSEMBLE`, `VARIABLE_PRONOSTICO_PRECIPITACION`,
  `VARIABLE_CLIMATOLOGIA_PRECIPITACION`, `MUESTRA_CLIMATOLOGIA`,
  `PERCENTILES_CLIMATOLOGIA` (`lib/infraestructura/riesgo/peligro/nivel.ts`) y
  `VARIABLE_OBSERVADA` (`lib/infraestructura/riesgo/jobs/sync-imerg.ts`) para
  que el replay no duplique esos literales a mano.
- **Lluvia observada exige ingeridoEn Y validoHasta <= t**: evita mostrar un
  gránulo cuya ventana de validez todavía no había cerrado en t aunque ya se
  hubiera ingerido (caso borde de reproceso/backfill).
- **Salud de fuentes: limitación documentada, no historial real**.
  `hazard_source_health` guarda SÓLO el estado actual por proveedor (una fila,
  sin historial), así que el replay no puede reconstruir el estado exacto en
  un instante pasado. Se aplica la única aproximación que el esquema permite:
  si `actualizadaEn > t`, se excluye (no se puede afirmar que ese estado ya
  regía en t); si `actualizadaEn <= t`, se incluye tal cual. Es una
  aproximación, no un historial — documentado en el código
  (`consultarSaludFuentes`) y acá para que N1/una futura UI no lo lean como
  "estado exacto en t".
- **Export reusa `generarReplay` sin recalcular** (`app/api/infraestructura/replay/export/route.ts`):
  la ruta de export llama al MISMO motor que la ruta de replay y sólo proyecta
  el `ResultadoReplay` a conteos; así "export = replay en conteos" es una
  garantía de código (misma llamada), verificada además con un test dedicado.
- **Versión de reglas en el export**: `motor` = `MOTOR_VERSION`
  (`lib/infraestructura/riesgo/motor/config.ts`), `peligro` = `VERSION_REGLA_PELIGRO`
  (`lib/infraestructura/riesgo/peligro/nivel.ts`), `episodios` =
  `EPISODIOS_REGLA_VERSION` (`lib/infraestructura/episodios-derivados/regla.ts`).
- **Evaluación de anticipación, señales de peligro simplificadas**: el script
  `scripts/evaluar-replay.mjs` arma las "señales de peligro" SÓLO desde
  `hazard_ensemble_prob` (horizonte 24 h); no reconstruye el fallback
  determinístico (pronóstico + climatología) para series históricas completas
  — eso requeriría reparear cada fila de pronóstico con la climatología
  vigente en ese instante, fuera de alcance de E7b. Las "señales de riesgo"
  (`infra_risk_snapshot`) sí cubren el histórico completo, sin esa limitación.
- **Sal del dataset desidentificado, exigida explícita**: `resolverSalDataset()`
  lee `DATASET_SALT_E7B` del entorno y lanza si falta — nunca un valor por
  defecto hardcodeado (un dataset "desidentificado" con sal fija en el código
  no desidentifica nada frente a quien lee el repo). Documentado acá para que
  el despliegue configure `DATASET_SALT_E7B` antes de correr un export real.
- **Dataset usa SIEMPRE la vista "conocido"**: usar "reconstruido" para las
  features sería fuga de información hacia el futuro (el dataset tiene que
  reflejar lo que el sistema sabía en t, no la verdad corregida a posteriori).

## 3. Trabajo por tarea

| Tarea | Archivos | Qué se hizo | Verificación |
|---|---|---|---|
| T1 | `lib/db/schema.ts`, `lib/db/seed.ts` | Heredado de la ola anterior: 3 índices `// E7b:` (ver §2). Sin cambios en esta sesión. | Cubierto indirectamente por el suite completo (§5). |
| T2 | `lib/infraestructura/replay/tipos.ts`, `fixtures.ts` | Heredado (contratos Zod de las dos vistas, cuadro, vacíos; fixture de escenario con corrección tardía). Esta sesión EXTENDIÓ `fixtures.ts` con `FixtureEnsembleProb` y `FixtureObservacionLluvia` para poder testear peligro/lluvia. | `pnpm exec vitest run lib/infraestructura/replay/consulta.test.ts` |
| T3 | `lib/infraestructura/replay/consulta.ts`, `consulta.test.ts` | Heredado: afectaciones + snapshot de riesgo (dos vistas, as-of, MAX_CUADROS_POR_VENTANA). Esta sesión COMPLETÓ las tres fuentes que faltaban: `consultarNivelesPeligro`, `consultarLluviaObservada`, `consultarSaludFuentes` (ver decisiones §2), y agregó 3 casos de test (peligro/lluvia/salud as-of). | `pnpm exec vitest run lib/infraestructura/replay/consulta.test.ts` → 9 passed |
| T4 | `app/api/infraestructura/replay/route.ts` (+ `.test.ts`) | GET de replay: ACL `verificarAccesoLectura` primero (antes de `ensureSeeded`), zod sobre query params, `Cache-Control: private, no-store`, 404 si el episodio no existe, 400 en el resto de errores de `generarReplay`. | `pnpm exec vitest run app/api/infraestructura/replay/route.test.ts` → 7 passed |
| T5 | `app/api/infraestructura/replay/export/route.ts` (+ `.test.ts`) | GET de export: mismo filtro que T4, `formato=json\|csv`, conteos simples por cuadro, cobertura por fuente (a partir de `resultado.vacios`), zona horaria UTC + Argentina documentada, versión de reglas. Sin manifiesto ni hashes. | `pnpm exec vitest run app/api/infraestructura/replay/export/route.test.ts` → 5 passed (incluye el test "export = replay en conteos") |
| T6 | `lib/infraestructura/evaluacion/anticipacion.ts` (+ `.test.ts`) | Módulo puro: `calcularAnticipacionEpisodio` (anticipación por episodio, con censura/no evaluable), `calcularTasaAnticipacion` (denominador = sólo evaluables), `calcularEscuelasSinAlerta` (denominador = sólo escuelas con dato; "sin reporte" nunca negativo). | `pnpm exec vitest run lib/infraestructura/evaluacion/anticipacion.test.ts` → 11 passed |
| T7 | `lib/infraestructura/dataset/export-desidentificado.ts` (+ `.test.ts`) | Hash HMAC-SHA256 + sal local exigida, unión feature+target por escuela-instante (vista "conocido" únicamente), serialización CSV (`null` → celda vacía), escritura versionada por fecha bajo `DATA_DIR/dataset-replay-e7b/`. | `pnpm exec vitest run lib/infraestructura/dataset/export-desidentificado.test.ts` → 10 passed |
| T8 | `scripts/evaluar-replay.mjs` (+ `.test.ts`), `scripts/perf-replay-30d.mjs` | CLI reproducible que arma señales desde la DB y llama a T6; smoke test contra DB temporal con fixture propio. Script adicional de rendimiento (ver §4). | `pnpm exec vitest run scripts/evaluar-replay.test.ts` → 2 passed |
| T9 | — | Revisión: esta sesión implementó SIN delegación a un tercero (N1 indicó ignorar el protocolo N2/N3 de este brief; el N3 revisor separado no aplica). Se hizo una relectura manual de `consulta.ts`/rutas/evaluación/dataset buscando específicamente: fuga de vista (grep de `rigeDesde`/`creadaEn` por función), casos geográficos (departamento sin geo-perfil → arreglos vacíos, no excepción), outages (fuente caída → `sin_dato`/ausencia, nunca 0 inventado), dato vencido (peligro/lluvia con `corridaEn`/`ingeridoEn` futuro → excluido), idempotencia (dataset sobrescribe por fecha, no acumula). Sin hallazgos nuevos más allá de lo ya documentado en §2. |
| T10 | Este archivo, `scripts/perf-replay-30d.mjs` | Pruebas reales fechadas + verificaciones finales (ver §4 y §5). |

## 4. Pruebas reales fechadas

**Fecha/hora**: 2026-09-27 (ver timestamps `fecha` en las salidas de abajo).

### 4.1 As-of sin fuga contra `.data` real

Se inspeccionó `.data/hub.sqlite` (worktree `enos-e7b`, mismo `DATA_DIR` que
usa `pnpm dev`/producción local) con una consulta de sólo lectura:

```
departamentos con geo-perfil: 0 []
afectaciones (muestra): 0
risk runs (muestra): []
periodos (muestra): [ { id: 'periodo-enos-2026-2027', estado: 'vigente' } ]
```

**Resultado**: `.data` real todavía NO tiene geo-perfiles, afectaciones ni
corridas de riesgo cargadas (coherente con la decisión de N1 #4: "hoy casi no
hay historia real"). No hay volumen real contra el cual verificar as-of sin
fuga de forma dateada y significativa. La garantía de "as-of sin fuga por
fuente" queda demostrada por los 9 casos de
`lib/infraestructura/replay/consulta.test.ts` (uno por fuente: afectaciones
conocido/reconstruido, snapshot de riesgo, peligro, lluvia, salud) contra una
base libsql real (no mockeada), con fechas ISO fijas. Pendiente: repetir esta
prueba contra `.data` una vez que haya afectaciones/riesgo reales cargados
(queda anotado como pendiente en §6).

### 4.2 Rendimiento del replay: un departamento, 30 días

Dado que `.data` real no tiene volumen (§4.1), se midió con datos sintéticos a
escala real (300 escuelas por departamento, orden de magnitud de un
departamento real — ver docs E2 — y 60 corridas de riesgo cubriendo los 30
días a 12 h cada una), en una base libsql temporal.

Comando exacto (reproducible, script committeado):

```
node scripts/perf-replay-30d.mjs
```

Extracto de la salida (corrida 2026-09-27T04:32:18.905Z):

```json
{
  "fecha": "2026-09-27T04:32:18.905Z",
  "nEscuelas": 300,
  "ventanaDias": 30,
  "pasoHoras": 6,
  "cuadros": 120,
  "siguienteDesde": "2026-01-31T00:00:00.000Z",
  "elapsedMs": 602,
  "msPorCuadro": "5.02",
  "primerCuadroAfectaciones": 30
}
```

120 cuadros es exactamente `MAX_CUADROS_POR_VENTANA` (30 días a paso de 6 h =
120 pasos, justo en el límite de una página): ~602 ms totales, ~5 ms por
cuadro, para un departamento de 300 escuelas. Aceptable para un uso interno
staff (no es una ruta de alto tráfico). Repetido dos veces (636 ms y 602 ms),
variación esperable de entorno compartido, sin degradación notable.

## 5. Verificaciones finales

Corridas al cierre de esta sesión, worktree `enos-e7b`, 2026-09-27:

| Verificación | Comando | Resultado |
|---|---|---|
| Tests | `pnpm exec vitest run --maxWorkers=2` | **1448 passed (1448)**, 173 archivos, exit 0. Las 4 fallas preexistentes del baseline NO se reprodujeron en esta corrida (posible flakiness de entorno del baseline anterior; no se investigó más por no ser de este batch). |
| Lint | `pnpm lint` | exit 0, sin salida |
| Types | `pnpm exec tsc --noEmit` | exit 0, sin salida |
| Build | `pnpm build` | exit 0. Rutas nuevas confirmadas en la tabla de rutas: `ƒ /api/infraestructura/replay`, `ƒ /api/infraestructura/replay/export` |

Memoria de la máquina respetada durante toda la sesión: verificado `free -m`
antes de cada corrida pesada (siempre ≥ 4000 MB disponibles, sin necesidad de
esperar), `vitest` siempre con `--maxWorkers=2`, sin procesos en segundo plano.

## 6. UX y pendientes

- **Gate UX**: no aplica en este batch — no hay UI (decisión de N1: la UI de
  replay se construye después de E4). Queda para el batch de UI post-E4 el
  recorrido guiado con operadores reales sobre esa UI.
- **Pendiente**: repetir la prueba de as-of sin fuga (§4.1) contra `.data` real
  una vez que haya afectaciones/corridas de riesgo reales cargadas.
- **Pendiente / decisión de un batch futuro**: si se necesita nivel de peligro
  multi-horizonte en el replay (hoy sólo 24 h, ver §2), o el fallback
  determinístico en `scripts/evaluar-replay.mjs` (hoy sólo ensemble, ver §2).
- **Fuera de alcance, ya documentado como decisión de N1**: feature store,
  manifiesto/hashes en el export, flag de UI nuevo, cualquier UI de replay.

## Gate

_(sección reservada para N1; no completada por N2/N3)_

## Gate (N1)

**Decisión: aceptado con follow-ups (2026-09-27).**

- Verificaciones del implementador: `pnpm exec vitest run --maxWorkers=2` 173 archivos / 1448 tests OK; `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0.
- Revisión independiente: sin fuga temporal en ninguna fuente de la vista "conocido" (afectaciones por `creadaEn`, run vigente por `publicadoEn`, peligro por `corridaEn`, IMERG exige `ingeridoEn` y `validoHasta` ≤ t), vacíos explícitos sin interpolar, export = replay por construcción, ACL antes de tocar la base, `no-store`, sal obligatoria para el dataset desidentificado sin datos nominales ni coordenadas, SQL parametrizado, índices sobre columnas preexistentes, máximo de 120 cuadros con paginación.
- Follow-ups: paralelizar las consultas por cuadro y por celda si crece la escala; historial real de salud de fuentes; peligro multi-horizonte en el replay; respaldo determinístico en el script de evaluación; revalidar el as-of con historia real cuando exista.
