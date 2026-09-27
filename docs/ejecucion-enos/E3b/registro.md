# E3b — Motor de riesgo v0 reproducible en sombra

Registro único del batch (decisión de producto 2026-09-26, ver plan-ejecución §7/§9). N2 = este agente
(sonnet, worktree `enos-e3b`). N3 = `opencode run --auto -m opencode-go/deepseek-v4.1-flash`, siempre,
con `OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json` y máximo 2 N3 simultáneos por instrucción
de N1 durante la ejecución (mensaje recibido a mitad de batch, aplicado desde la segunda ola en adelante).

## 0. Baseline (antes de tocar código)

Commit de partida: `2446fea` (merge `feat/enos-e2`), rama `feat/enos-e3b`. Baseline capturado
inmediatamente después de escribir el contrato congelado (`motor/puertos.ts`, `config.ts`, `tipos.ts`,
`__fixtures__/puertos-fake.ts`) — son archivos nuevos sin ningún import todavía, adición pura sin efecto
de comportamiento; se decidió así para no perder el orden natural "congelar contrato → baseline → despachar
N3" del batch. Confirmado con `tsc`/`lint`/`build` en verde antes de cualquier N3.

| Comando | Exit code | Resumen |
|---|---|---|
| `pnpm test` | 0 | 134 test files, 1083 tests, todos pasando |
| `pnpm lint` | 0 | sin hallazgos |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build completo, todas las rutas listadas |

Sin fallas preexistentes que documentar.

Untracked no creado por esta tarea, no tocado: `.atl/` (reportado, se deja intacto).

## 1. Decisiones locales (N2, dentro del alcance fijado por N1)

1. **`infra_risk_run` como entidad de dominio separada de `infra_job_run`.** `infra_job_run` (E0) es el
   lease genérico de ejecución; `infra_risk_run` es el "puntero" de negocio que se publica atómicamente.
   Índice único parcial `infra_risk_run_vigente_unico` (mismo patrón que `infra_periodo_vigente_unico`)
   impone a nivel DB que exista a lo sumo un run `vigente`.
2. **Publicación atómica sin transacción gigante.** Los snapshots/factores se insertan en bulk por lotes
   de 200 escuelas mientras el run está en estado `preparando` (invisible para cualquier lector que filtre
   por `vigente`); la transacción final sólo hace 2 UPDATEs (marcar el viejo `vencido`, marcar el nuevo
   `vigente`). Esto satisface "publicar puntero en transacción corta" sin bloquear la DB con miles de
   inserts dentro de una única transacción.
3. **`puntoRioId` asociado en el adapter de Territorio, sin tocar `infra_geo_profile`.** Follow-up del Gate
   de E2 (#1: "la ficha no puede mostrar caudal"). Resuelto por proximidad euclidiana simple en grados
   contra `PUNTOS_RIO` (E2), con un umbral de 0.75° (~80km) más allá del cual no se asocia ningún punto.
   Es una aproximación sin polígono de cuenca real — documentado como decisión local en
   `motor/adaptadores/territorio.ts`. No modifica la tabla `infra_geo_profile` de E2.
4. **`hazard_observation` sigue sin usarse en E3b.** IMERG (lluvia observada) es responsabilidad de E3a;
   el puerto `PuertoLluviaObservada` está definido y el motor lo consume, pero el adapter real que
   escribiría/leería esa tabla no es de este batch (E2 ya había decidido omitir la tabla; sigue sin
   instanciarse hasta que E3a la necesite).
5. **`urgenciaVerificacion` queda sin implementar en v0** (factor placeholder, peso 0, valor null). El
   contrato fijo de N1 no incluye un `PuertoVerificacion`; agregar uno sería ampliar el contrato sin ask a
   N1, así que se documentó como "fuera de alcance de v0" en el propio resultado del motor en vez de
   inventar un puerto nuevo.
6. **Motivo de acceso interrumpido identificado por nombre exacto `'Acceso interrumpido'`** (columna
   `infra_afectacion.motivo` guarda el nombre, no un id — confirmado contra `lib/infraestructura/motivos.ts`).
7. **Flag que gobierna la UI:** `RISK_ENGINE_ENABLED` (de E0), no `HAZARD_CONTEXT_ENABLED` (de E2). Es el
   flag correcto porque esta UI es específicamente el ranking del motor de riesgo, no contexto territorial.
   Las 2 APIs nuevas (`/riesgo`, `/riesgo/:snapshotId`) NO están gateadas por este flag — existen siempre,
   protegidas por ACL, mismo criterio que E2 aplicó a sus 3 endpoints.
8. **Detalle por `snapshotId` sólo expone snapshots del run vigente** (corrección de gate interno, ver §2
   Revisión H4): un corte interrumpido no debe ser recuperable por id directo aunque ya esté físicamente en
   la tabla.

## 2. Despachos N3

Todos verificados por N2 con `git status`/`git diff` y el test focalizado indicado, nunca sólo por el exit
code del propio N3.

### Ola A — Contrato (congelado por N2, no delegado) + núcleo puro y esquema (en paralelo, archivos disjuntos)

Escrito directamente por N2 (contrato congelado, decisión de fórmula/fixtures — rol explícito de N2 en
este batch, no una tarea mecánica delegable): `lib/infraestructura/riesgo/motor/puertos.ts`, `config.ts`,
`tipos.ts`, `__fixtures__/puertos-fake.ts`.

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Reglas | `motor/calculo.ts` (+test) | `calcularRiesgoEscuela()`: amenaza = peligro-celda + caudal + lluvia antecedente (pesos redistribuidos ante ausencia); vulnerabilidad = historial + aislamiento + susceptibilidad (historial siempre presente); IRO = amenaza×vulnerabilidad/100; confianza degrada con faltantes, nunca "bajo" por defecto; horizonte sin evidencia de amenaza no publica score. | `pnpm vitest run lib/infraestructura/riesgo/motor/calculo.test.ts` → 9/9 pasan (T1-T9, incluye límites 0/100, reconstrucción de factores, as-of, faltantes). Revisado línea por línea por N2 contra el algoritmo especificado — correcto. |
| N3-Schema | `lib/db/schema.ts`, `lib/db/seed.ts` (bloque `// E3b:` al final de ambos) | `infra_risk_run` (con índice único parcial "vigente"), `infra_risk_snapshot`, `infra_risk_factor`. Ninguna tabla existente modificada. | `pnpm vitest run lib/db/seed.test.ts` → 18/18 pasan (cubre instalación vacía + upgrade + idempotencia genéricamente). Revisado el diff por N2: nombres/columnas/índices coinciden exactamente con lo especificado. |

### Ola B — Adaptadores (en paralelo, archivos disjuntos)

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Adaptadores-reales | `motor/adaptadores/{territorio,historial,exposicion}.ts` (+tests) | Territorio: lee `infra_geo_profile`, asocia punto de río más cercano (≤0.75°). Historial: as-of estricto sobre `infra_afectacion`/`infra_parte`, duración cortada en `asOf` si sigue vigente. Exposición: matrícula/secciones del corte vigente vía `ge_seccion`/`ge_alumno_seccion`. | `pnpm vitest run` sobre los 3 test files → pasa (patrón de sqlite temporal real, igual que `geo-perfil.test.ts`). |
| N3-Adaptadores-stub | `motor/adaptadores/{peligro,lluvia,aislamiento,susceptibilidad}.ts` (+tests) | Devuelven siempre `sin_dato`/`null` explícito (nunca 0 disfrazado), documentando qué batch hermano (E3a/G1) conecta el adapter real al integrar. | `pnpm vitest run` sobre los 4 test files → pasa. |

Verificación conjunta de la ola: `pnpm vitest run lib/infraestructura/riesgo/motor/adaptadores/` → 7 test files, 16 tests, todos pasan.

### Ola C — Job y API (en paralelo, archivos disjuntos)

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Job | `jobs/calcular-riesgo.ts` (+test) | Lease por bloque de 6h UTC (mismo criterio que `sync-pronostico-caudal.ts`), lease de 15 min renovado cada lote de 200 escuelas. Publicación atómica: snapshots/factores insertados con el run en `preparando`, transacción corta final flip-only. | `pnpm vitest run jobs/calcular-riesgo.test.ts` → 4/4 pasan (corrida normal, idempotencia por bloque, publicación atómica sin 2 vigentes, fallo sin período). |
| N3-API | `app/api/infraestructura/riesgo/route.ts`, `.../[snapshotId]/route.ts` (+tests) | Listado paginado con filtros horizonte/periodoId/departamento, ordenado por `scoreRiesgo DESC` (SQLite deja los `null` al final). Detalle con factores. ACL reutilizada, `Cache-Control: private, no-store`. Sin run vigente → 200 con lista vacía (no error). | `pnpm vitest run` sobre los 2 test files → 19/19 pasan. |

### Ola D — UI

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-UI | `app/(hub)/admin/riesgo/page.tsx`, `.../[snapshotId]/page.tsx` | Ranking interno bajo `adminPageGate` + `riskEngineEnabled()`; consulta DB directo (mismo patrón que `admin/operacion/page.tsx`). Selector de horizonte por querystring. Nivel/motivo/confianza/fecha en la lista; factores completos en el detalle. Nunca porcentaje ni "daño confirmado". | Sin test dedicado (mismo criterio que `admin/operacion/page.tsx`, que tampoco lo tiene — página Server Component de panel interno). Confirmado con `pnpm build` (rutas `/admin/riesgo` y `/admin/riesgo/[snapshotId]` listadas) y revisión manual del código por N2. |

### Revisión (N3 distinto de los implementadores, sólo reporte, sin tocar archivos)

Reprodujo el cálculo a mano sobre los fixtures existentes (T1/T3/T4/T8/T9 de `calculo.test.ts`), auditó
as-of estricto, confianza ante faltantes, publicación atómica, ACL/paginación y geografía. Confirmó `git
status` limpio tras su pasada. Hallazgos, de más a menos severo, y acción de N2:

| # | Severidad | Hallazgo | Acción de N2 |
|---|---|---|---|
| H1 | **Bloqueante** | `duracionTotalHoras` se tomaba del agregado sin filtrar del puerto de historial; un antecedente con `rigeDesde` posterior a `asOf` no contaba en `cantidadConfirmadas` pero sí inflaba la duración usada en el score — as-of no se sostenía de punta a punta en el núcleo. Demostrado con el propio fixture T7. | **Corregido por N3 de corrección** (dispatch dedicado): la duración se deriva ahora de la lista de antecedentes ya filtrados por `asOf`, igual criterio que el adapter real. Test de regresión agregado reproduciendo el caso exacto del hallazgo. |
| H2 | Mayor | Comparación de fechas `rigeDesde <= asOf` en `contarAntecedentesVigentes` era lexicográfica (string), no numérica: dos timestamps del mismo instante con offset `+03:00` vs `Z` podían compararse mal. | **Corregido**: todas las comparaciones temporales del núcleo usan `Date.parse` numérico. Test agregado con dos formatos equivalentes del mismo instante. |
| H3 | Mayor | Un catálogo de indicadores de susceptibilidad vacío (`{}`) se trataba como componente presente con valor 0, habilitando confianza "alta" con un dato efectivamente ausente (camino no alcanzable hoy con el stub, pero sí cuando G1 conecte el adapter real). | **Corregido**: catálogo vacío ahora cuenta como ausente (mismo camino que `null`), incrementa `cantidadFaltantes`. |
| H4 | Menor | El detalle por `snapshotId` no filtraba por estado del run: un corte interrumpido dejaba filas recuperables por id directo aunque el run nunca llegó a `vigente`. | **Corregido**: la consulta (API y UI) exige `infraRiskRun.estado = 'vigente'` vía join; id de un run no vigente devuelve el mismo 404 que "no existe" (no se filtra el estado interno de otros runs). |
| H5 | Menor | Ante una excepción, `infra_job_run` quedaba `fallido` pero la fila de `infra_risk_run` del intento quedaba `preparando` para siempre (huérfana, sin limpieza). | **Corregido**: el `catch` marca también `infraRiskRun` como `fallido` cuando ya existe (guardado con un chequeo de que el insert haya ocurrido). |
| H6 | Menor | Las 2 rutas de API llamaban `ensureSeeded()` antes del chequeo de ACL, permitiendo trabajo de DB sin sesión. | **Corregido**: orden invertido, ACL primero. |
| H7 | Menor (latente) | El insert bulk de factores (sin trocear dentro del lote) podía superar el límite de variables de SQLite con más fuentes reales conectadas (~8 factores/snapshot con E3a+G1 activos). No se manifiesta hoy (3 factores/snapshot con los stubs). | **Corregido preventivamente**: helper de inserción en chunks reutilizado para snapshots y factores. |
| H8 | Cosmético | La UI mostraba los enums crudos (`muy_alto`, `baja`) sin traducir. | **Corregido**: mapeo de presentación a texto legible, sin tocar el valor interno/de API. |

Verificación tras las correcciones: `pnpm vitest run` sobre los archivos tocados por ambos dispatches de
corrección → 17/17 (núcleo+job) y 20/20 (API) pasan; ver §4 para las 4 verificaciones globales repetidas.

## 3. Pruebas reales fechadas

Ejecutadas por N2 el **2026-09-27**, contra la base de desarrollo real de este worktree (`.data/hub.sqlite`
+ `.data/ge.sqlite`, 2005 registros de `public/data/localizaciones.json`, la misma base que usó E2). No es
una prueba de red (los adapters de fuentes externas de este batch son stubs "no disponible"); es la medida
de **duración/cobertura/contención SQLite sobre el padrón real** que exige la aceptación del batch.

**Comando (script ad-hoc, mismo patrón de loader ESM que `scripts/job-diagnostico.mjs` para resolver
imports TS vía `@/`), corrido dos veces (una antes y otra después de las correcciones de la revisión, esta
última forzando un bloque de 6h distinto con `ahora: +7h` para evitar la idempotencia por lease):**

```
node medir-riesgo.mjs   # primera corrida: calcularGeoPerfiles() + calcularYPublicarRiesgo()
```

Extracto de la respuesta (primera corrida, con `calcularGeoPerfiles()` real incluido):
```json
{
  "geoPerfiles": { "procesados": 2005, "conPerfilValido": 2001, "excluidos": 4, "duracionMs": 292 },
  "riesgo": { "ejecutado": true, "escuelasProcesadas": 6003, "conEvidencia": 0, "sinEvidencia": 6003, "duracionMs": 3454 }
}
```

Segunda corrida (post-correcciones, bloque de 6h nuevo):
```json
{ "resultado": { "ejecutado": true, "escuelasProcesadas": 6003, "conEvidencia": 0, "sinEvidencia": 6003 }, "duracionMs": 4628 }
```

Verificado directamente en la DB tras la segunda corrida:
```
vigentes: [{"id":"772b6f80-...","estado":"vigente"}]
vencidos: [{"id":"34560d5b-...","estado":"vencido"}]
```
Exactamente un run vigente en todo momento; el run de la primera corrida quedó `vencido` al publicarse el
segundo, confirmando la garantía de publicación atómica también fuera de los tests unitarios.

**Interpretación de `conEvidencia: 0`:** es el comportamiento CORRECTO esperado en este estado del
repositorio, no un bug — los 4 adapters de fuentes dinámicas (peligro, lluvia, aislamiento, susceptibilidad)
son stubs "no disponible todavía" hasta que E3a/G1 mergeen sus adapters reales; el motor calcula igual
`scoreVulnerabilidad` (historial/exposición ya son reales) pero `evidenciaValida` queda `false` para las
6003 combinaciones escuela×horizonte porque no hay amenaza disponible, y por lo tanto ninguna aparece
publicada como "bajo" (se confirmó explícitamente que 0 de 6003 tiene `nivelRiesgo` asignado).

**Prueba real adicional — API en la app real:** se levantó `pnpm dev` momentáneamente y se confirmó con
`curl` que `GET /api/infraestructura/riesgo` sin sesión devuelve `401 {"error":"No autenticado"}` (ACL viva,
no sólo en tests). Servidor detenido inmediatamente después, sin proceso residual (`ps`/`lsof :3000`
confirmados vacíos).

## 4. UX

**Estados visibles (nivel, motivo breve, confianza, fecha):** cubiertos en la tabla de
`app/(hub)/admin/riesgo/page.tsx`. Un horizonte sin evidencia muestra el motivo textual "Sin evidencia de
amenaza para este horizonte", nunca un score inventado. El detalle (`[snapshotId]/page.tsx`) muestra los
factores completos con su explicación determinista.

**Flag que gobierna la UI nueva:** `RISK_ENGINE_ENABLED` (E0), no `HAZARD_CONTEXT_ENABLED` (E2) — es
específicamente el ranking del motor de riesgo. Confirmado en el código: la página evalúa el flag antes de
cualquier consulta a `infra_risk_*` (revisado explícitamente por la revisión independiente, sin hallazgo).

**Nunca porcentaje ni "daño confirmado":** confirmado por la revisión independiente — sólo aparece nivel
textual (bajo/moderado/alto/muy_alto) y confianza textual (baja/media/alta), nunca un `%` ni esa frase.

**Gate UX (walkthrough con 1-2 operadores reales, estándar permanente §7): no hubo operadores disponibles
durante esta ejecución.** Mismo estado que E2 y E0. **Pendiente explícito** — recorrido guiado reproducible
para cuando haya disponibilidad:
1. Con `RISK_ENGINE_ENABLED=true` y sesión de staff (admin/editor), abrir `/admin/riesgo`.
2. Confirmar que el ranking lista escuelas ordenadas por índice de riesgo (o, en el estado actual del
   repo, el mensaje "Todavía no hay un corte publicado" si nadie corrió el job — o bien la tabla completa
   con nivel "Sin evidencia" en todas las filas, que es el estado real tras la prueba de la sección 3).
3. Cambiar el horizonte (24/72/240) por los links del selector y confirmar que la tabla se actualiza.
4. Hacer clic en una escuela → confirmar el detalle con todos los factores, su fuente, valor, contribución
   y explicación en texto plano.
5. Confirmar que una sesión de director (contraseña compartida, sin `SessionUser`) no puede abrir
   `/admin/riesgo` ni las 2 APIs nuevas (401/403).
6. Con `RISK_ENGINE_ENABLED=false`, confirmar que la UI muestra el mensaje de deshabilitado sin consultar
   la DB de riesgo.

No se afirma gate operativo aprobado — sólo piloto interno, según el estándar de la sección 7 cuando no
hay operadores disponibles.

## 5. Verificaciones finales

Repetidas al cierre, sobre el estado íntegro (todas las olas + correcciones de la revisión):

| Comando | Exit code | Resumen |
|---|---|---|
| `pnpm test` | 0 | 145 test files, 1136 tests, todos pasando (baseline: 134/1083 → +11 archivos, +53 tests) |
| `pnpm lint` | 0 | sin hallazgos |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build completo; nuevas rutas listadas: `/api/infraestructura/riesgo`, `/api/infraestructura/riesgo/[snapshotId]`, `/admin/riesgo`, `/admin/riesgo/[snapshotId]` |

## 6. Pendientes explícitos para N1

1. **Adapters reales de Peligro/Lluvia/Aislamiento/Susceptibilidad**: quedan como stubs "no disponible"
   hasta que N1 conecte los reales de E3a (`peligro/nivel.ts`, IMERG) y G1 (`infra_aislamiento_osm`,
   `infra_susceptibilidad_estatica`) al integrar. Los puertos (`motor/puertos.ts`) están diseñados para que
   ese reemplazo sea un cambio de una línea en `jobs/calcular-riesgo.ts` (`construirPuertosReales()`), sin
   tocar el núcleo ni el job.
2. **`peligro/nivel.ts` de E3a duplicado localmente en `motor/puertos.ts`** (comentario "espejo de
   peligro/nivel.ts de E3a; N1 unifica al integrar"), por decisión fija de N1 en el brief. Verificar que
   ambos tipos coincidan exactamente al mergear; si E3a cambió algo, unificar en `motor/puertos.ts` (no
   duplicar el tipo en dos lugares tras el merge).
3. **`puntoRioId` resuelto por proximidad euclidiana sin polígono de cuenca** (decisión local §1.3): sigue
   siendo una aproximación. Si G1 o un batch futuro trae hidrografía real (polígonos de cuenca), reemplazar
   `motor/adaptadores/territorio.ts` sin cambiar el contrato del puerto.
4. **Gate UX con operadores reales**: pendiente por falta de disponibilidad (walkthrough reproducible en §4).
5. **H7 (SQLite bind limit)**: mitigado preventivamente con chunking, pero no medido bajo carga real con
   fuentes reales conectadas (hoy sólo hay 3 factores/snapshot con los stubs). Revalidar cuando E3a/G1 estén
   integrados y el volumen de factores por snapshot suba.
6. **`infra_risk_run` en estado `preparando` sin limpieza automática de runs `fallido`/`preparando`
   antiguos**: no hay job de purga; para v0 no se consideró necesario (volumen bajo, sin impacto funcional),
   pero si el job corre con frecuencia y falla seguido, la tabla acumula filas. Sin bloquear el gate técnico.
7. **Ensemble API / Ensemble como base de Capa 1**: decisión de producto ya registrada en el plan como
   responsabilidad de E3a, no se tocó en este batch.

## 7. Gate

(N1 completa esta sección — N2 no la completa)

## Gate (N1)

**Decisión: aceptado con follow-ups (2026-09-26).**

- Verificaciones globales repetidas por N1: `pnpm test` 1136/1136 OK; `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0.
- Revisión independiente: núcleo puro y determinista, reconstrucción de scores por factores, límites 0/100, regla de faltantes (0 de 6003 snapshots con nivel mientras las amenazas son stubs), as-of estricto, publicación atómica con índice único parcial, DDL aditivo, ACL y flag correctos. Los tipos espejo de `motor/puertos.ts` coinciden campo por campo con el contrato de E3a.
- Corregido por N1 en el gate: las etiquetas legibles de nivel, confianza y tipo de factor faltaban en la página de detalle; se extrajeron a `app/(hub)/admin/riesgo/etiquetas.ts` y se usan en lista y detalle.
- Follow-ups para la integración con E3a/G1:
  1. Sacar las consultas de territorio y exposición del loop por horizonte en `jobs/calcular-riesgo.ts` (hoy se repiten 3 veces por escuela) antes de conectar los adaptadores reales.
  2. Conectar los adaptadores reales de peligro, lluvia observada (E3a), aislamiento y susceptibilidad (G1) y unificar los tipos espejo con `peligro/nivel.ts`.
- Pendiente que se arrastra: gate UX con operadores reales.
