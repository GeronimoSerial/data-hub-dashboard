# E6 — Revisión independiente (N2, solo lectura)

Rama `feat/enos-e6` (worktree `enos-e6`), cambios sin commitear. Método:
2 revisiones N3 (`opencode-go/deepseek-v4.1-flash`, en primer plano, sin red)
sobre el motor/job y sobre API+migraciones+KPI, más verificación propia de
cada hallazgo contra el código y una tanda de tests bajo `flock`.

## Veredicto: **REJECT**

Un bloqueante confirmado con evidencia propia (no solo del N3): el KPI de
matrícula condicionada por acceso cuenta cada escuela hasta 3 veces cuando la
UI consulta el radar sin `?horizonte=` — que es el estado por defecto de la
página. El resto del batch (separación del IRO, distinción null/"bajo", ACL,
migraciones aditivas, rótulos) está bien.

## 1. Separación IRO / riesgo de acceso — OK

`calcularRiesgoAcceso` (`lib/infraestructura/riesgo/motor/riesgo-acceso.ts`)
es un módulo puro separado; `calculo.ts` y `calcular-riesgo.ts` lo escriben
en su propio campo (`riesgoAcceso` / columnas `score_riesgo_acceso`,
`nivel_riesgo_acceso`, `confianza_acceso`) y **nunca** lo mezclan en
`scoreRiesgo`/`scoreVulnerabilidad`. `PESOS_VULNERABILIDAD` se redistribuyó
(0.7/0.3) precisamente porque el aislamiento OSM salió de esa dimensión
(`config.ts:29-39`). Confirmado por grep cruzado (`riesgoAcceso` sólo aparece
en motor/job/UI/KPI, nunca en el cálculo del IRO) y por los 26 tests de
`riesgo-acceso.test.ts` + `calculo.test.ts` + `calcular-riesgo.test.ts`
(verdes, corridos por mí bajo lock).

"Sin cobertura" vs "bajo": `riesgo-acceso.ts:85-94` devuelve `nivel: null,
confianza: 'baja'` explícitamente cuando `indice === null` o
`indice.nivel === 'sin_datos_red'`, nunca 0. Propagado sin alterar hasta la
UI (`ficha-territorial.tsx`/`risk-explanation-panel.tsx`: "Sin datos de
acceso", nunca "Bajo") y hasta el KPI (`kpi-acceso.ts:34`: `!== 'alto'`
descarta null sin tratarlo como bajo).

## 2. Distribución real (1099 bajo / 886 alto / 16 sin cobertura / 0 moderado) — no es bug

Verificado matemáticamente (`BASE_ACCESO_POR_NIVEL_AISLAMIENTO` 0/20/45/70,
`UMBRAL_MODERADO`=25, `UMBRAL_ALTO`=50): "moderado" es alcanzable en teoría
(p. ej. nivel 2 sin agravantes = 45). El N3 recalculó la distribución exacta
contra el CSV real de G1 (`services/geo-static/output/aislamiento_osm-v1-2026-09-26.csv`,
2001 filas): nivel 0→471, 1→628, 2→114, 3→772; las 114 filas de nivel 2
tienen TODAS `cruceDeRiesgo=true` (vado>0), así que 45+25=70→alto, nunca
quedan en el "near miss" moderado; nivel 0/1 no tienen agravantes en este
dataset (dev sin peligro E3a ni historial sembrados) y quedan en bajo. No es
un bug de mapeo ni de umbral — es un artefacto de la correlación real
nivel↔cruce en el dataset de G1 combinado con la ausencia de insumos E3a en
esta corrida de desarrollo. **Advertencia real, no cosmética:** en cuanto se
siembre peligro/historial de E3a, `nivel 1 + peligroAlto` (20+25=45) SÍ caerá
en "moderado" — el "0 moderado" no es una propiedad estable de la regla, es
un efecto de que esta corrida de dev no tiene los otros insumos. Corregir
la nota de `registro.md:121-123` ("concentra el aislamiento en niveles 1 y 3")
por la causa real (correlación nivel↔cruce + ausencia de E3a) — hallazgo
menor de documentación, no de código.

## 3. API `/api/infraestructura/accesos/[cueAnexo]` — OK

- ACL verificada con el código real de `staffGuard`/`getSessionUser`
  (`lib/session.ts:8-13`), no reimplementado: sin sesión → 401
  (`route.ts:25-29`, test `route.test.ts:128-136`), sesión no-staff → 403
  (test `route.test.ts:138-146`). Única vía de éxito es rol staff
  (`isStaff` en `lib/acl.ts`).
- `cueAnexo` validado con `z.string().min(1).max(50)` (`route.ts:14,34-37`,
  400 si falla); la búsqueda usa `eq()` parametrizado de Drizzle, no hay
  concatenación SQL — inyección no aplica, un cueAnexo con caracteres
  especiales simplemente no matchea (404, no error 500).
- 404 sólo cuando la escuela no existe en `infra_geo_profile`
  (`route.ts:41-44`); sin cobertura OSM es 200 `disponible:false`
  (`route.ts:46-55`), tal como exige el brief.
- Sin datos nominales: leí el JSON completo de ambas ramas (disponible/no
  disponible, `route.ts:57-75` y `:51-53`) — sólo `cueAnexo`, `indice`,
  conteos de cruces, `rutaAlternativaSinCruce` (nunca traducido a "seguro"),
  fecha/licencia OSM. Test de regresión explícito con regex
  `alumno|matr[ií]cula|nombre|...` (`route.test.ts:203-214`).
- **Menor (eficiencia):** cada request instancia un adapter nuevo
  (`crearAdapterAislamiento()` en `route.ts:46`), que dispara su propia
  query `SELECT *` a **toda** la tabla `infra_aislamiento_osm` para resolver
  UN solo `cueAnexo`. Es correcto (no hay N+1 dentro del job de batch, que
  reusa una sola instancia — ver §4), pero en este endpoint de detalle es un
  costo innecesario por request; no bloqueante con 2001 filas, pero conviene
  no perderlo de vista si la tabla crece o el endpoint recibe tráfico alto.

## 4. Migraciones (`seed.ts`) — OK

`ensureRiesgoAccesoColumns()` (`seed.ts:653-669`) usa `PRAGMA table_info`
antes de cada `ALTER TABLE ADD COLUMN`, mismo patrón que
`ensureMovimientoIdempotencyKeyColumn`; las 3 columnas son nullable, así que
corre seguro sobre una tabla con filas. Los únicos índices de
`infra_risk_snapshot` (`uidx`, `cue_anexo_idx`, `run_id_idx`, `seed.ts:401-403`)
no referencian ninguna de las 3 columnas nuevas — no hay orden roto entre
`CREATE INDEX` y un `ensure*` posterior.

## 5. UI — el toggle "Riesgo de acceso" es un no-op (bloqueante de producto, no de datos)

Confirmado por mí en el código: `capasRadarVisibles['riesgo-acceso']`
(`map-infraestructura-page.tsx:208`) sólo se lee para pintar el propio
checkbox del `RadarLayerControl` (`layer-control.tsx`); a diferencia de
`.peligro` y `.riesgo`, que sí gatean capas reales del mapa
(`map-infraestructura-page.tsx:946-947,1210,1224,1231`), **no hay ninguna
referencia a `capasRadarVisibles['riesgo-acceso']` fuera del estado y del
control** — ningún layer/círculo/polígono se activa o desactiva con el
toggle. Prender o apagar el control no cambia nada visible en el mapa. Esto
ya está documentado como TODO explícito en `registro.md`, pero un control
que no hace nada en la UI final no debería mergearse así.

Recomendación concreta (una de dos, a elección de N1/producto):
- **Implementarlo ahora**, mínimo viable: agregar una capa de puntos/círculos
  igual a `CAPA_RIESGO_CIRCLE_ID` pero coloreada por `riesgoAcceso.nivel`
  (mismo patrón que `capasRadarVisibles.riesgo`), reusando
  `riesgoAccesoPanel`/los datos ya cargados por escuela — no requiere nueva
  consulta, sólo el layer de Mapbox/maplibre y el `paint` condicional.
- **U ocultar el toggle** hasta que se implemente: sacar `'riesgo-acceso'`
  de `ORDEN_CAPAS_RADAR` (`layer-control.tsx:123`) y de
  `CAPAS_RADAR_VISIBLES_DEFECTO` hasta tener el dibujo real, dejando la
  sección "Acceso" de `ficha-territorial`/`risk-explanation-panel` (que sí
  funciona, es texto/no mapa) como única superficie de esta dimensión por
  ahora.

No mergear el toggle visible-pero-inerte tal cual sin una de las dos.

## 6. KPI de matrícula condicionada — **BLOQUEANTE: doble/triple conteo**

`calcularMatriculaCondicionadaPorAcceso` (`lib/infraestructura/riesgo/kpi-acceso.ts:33-38`)
sólo deduplica contra `cuesConAfectacionConfirmada`; **no deduplica dentro de
`snapshots` por `cueAnexo`**:

```ts
for (const snapshot of snapshots) {
  if (snapshot.nivelRiesgoAcceso !== 'alto') continue
  if (cuesConAfectacionConfirmada.has(snapshot.cueAnexo)) continue
  escuelas += 1
  matricula += snapshot.exposicionMatricula ?? 0
}
```

El job persiste **una fila por (cueAnexo, horizonte)** — 3 horizontes fijos,
24/72/240 (`calcular-riesgo.ts`, `HORIZONTES`). En `app/api/infraestructura/radar/route.ts:223-226`
el filtro por horizonte es **opcional** (`if (horizonte !== undefined)`), y
`snapshotsAcceso` (`route.ts:287-298`) se arma con ese mismo `where`. Verifiqué
en `components/mapas/map-infraestructura-page.tsx:568` que el estado inicial
de la UI es `horizonteSeleccionado = 'ahora'` (no numérico) — es decir, en la
carga por defecto de la página el hook `use-radar.ts` llama a la API **sin**
`?horizonte=`. Con eso, para una escuela con `nivelRiesgoAcceso === 'alto'`
en más de un horizonte (plausible: el aislamiento OSM es el mismo en los 3
horizontes, sólo cambia el componente de peligro), el KPI la suma 2 o 3 veces:

```
snapshots = [
  {cueAnexo:'X', nivelRiesgoAcceso:'alto', exposicionMatricula:100}, // h24
  {cueAnexo:'X', nivelRiesgoAcceso:'alto', exposicionMatricula:100}, // h72
  {cueAnexo:'X', nivelRiesgoAcceso:'alto', exposicionMatricula:100}, // h240
]
// resultado actual: { escuelas: 3, matricula: 300 }
// resultado correcto: { escuelas: 1, matricula: 100 }
```

Con `?horizonte=72` (o cualquier horizonte fijo) el resultado es correcto —
por eso el test suite pasa en verde: `radar/route.test.ts` sólo ejercita
`?horizonte=24` con fixtures de una fila por CUE, y `kpi-acceso.test.ts` no
cubre `cueAnexo` repetido. El bug es real y reachable desde la UI en su
estado por defecto, no un caso de laboratorio.

Fix sugerido (para N1/implementación, no aplicado por esta revisión de solo
lectura): deduplicar `snapshots` por `cueAnexo` antes de agregar (quedarse
con, por ejemplo, el peor nivel/mayor score entre horizontes), o forzar un
horizonte único en la query de `snapshotsAcceso` independientemente del
filtro que pidió el cliente para el resto del payload.

Menor asociado: `exposicionMatricula: null` se cuenta en `escuelas` pero
suma 0 a `matricula` (`kpi-acceso.ts:37`) — decisión documentada
(comentario `:19-21`), defendible, pero deja `escuelas` y `matricula`
inconsistentes entre sí cuando hay nulls; no bloqueante, dejar constancia.

## 7. Carga por lote — OK, sin N+1

`aislamiento.ts` y `susceptibilidad.ts` cachean una única promesa de
`SELECT * FROM <tabla>` por instancia de adapter (`aislamiento.ts:85-92`),
confirmado con test explícito de "una sola llamada para N cueAnexos". El job
(`calcular-riesgo.ts`) construye los puertos **una vez por corrida**, antes
del loop de escuelas×horizontes, y los reutiliza — no hay una query por
escuela. Tabla vacía → `Map` vacío → `null` (no lanza, cubierto por test).
Menor: si la tabla no existiera (no alcanzable en la práctica porque
`seedHub()` la crea con `CREATE TABLE IF NOT EXISTS` antes de que el job
corra) no hay `try/catch` y el `SELECT` lanzaría — el comentario "nunca
lanza" no contempla ese caso extremo; no bloqueante.

## 8. Rótulos — OK

Sin apariciones de "alerta"/"SMN" en ningún string nuevo de motor, job, API
o UI de este batch (grep sobre el diff completo). Las únicas coincidencias
en el repo son comentarios que justifican la exclusión y código preexistente
ajeno a E6.

## Bloqueantes

1. **`kpi-acceso.ts:33-38` + `radar/route.ts:223-226,287-298`** — el KPI
   `accesoCondicionado` cuenta cada escuela hasta 3 veces (una por
   horizonte) cuando el request no fija `?horizonte=`, que es el estado
   inicial real de la UI (`map-infraestructura-page.tsx:568`,
   `horizonteSeleccionado: 'ahora'`). Infla `escuelas` y `matricula` y
   contradice la propia docstring del módulo ("dedup por cueAnexo").
2. **`components/mapas/layer-control.tsx` + `map-infraestructura-page.tsx`**
   — el toggle "Riesgo de acceso" está en el mapa pero no dibuja ninguna
   capa (confirmado: ninguna referencia a
   `capasRadarVisibles['riesgo-acceso']` fuera del propio estado/checkbox).
   Un control visible sin efecto no debería mergearse: implementarlo o
   sacarlo del listado de capas hasta que lo esté (opciones en §5).

## Menores

- Rango de `indiceAislamiento` sin `CHECK` en columna `integer`
  (`schema.ts`); un valor fuera de 0-3 produciría `BASE_ACCESO_POR_NIVEL_AISLAMIENTO[n] === undefined`
  → `NaN` → `clasificar(NaN)` cae en `'alto'` por descarte (ambas
  comparaciones `false`). Improbable con el contrato actual del CSV de G1,
  pero sin guard defensivo.
- `"Nunca lanza"` en los adapters no cubre tabla inexistente (sin
  `try/catch`); no alcanzable en la práctica por el `CREATE TABLE IF NOT
  EXISTS` de `seedHub()`.
- Endpoint de detalle de accesos hace `SELECT *` a la tabla completa para
  resolver un solo `cueAnexo` (§3), correcto pero potencialmente costoso a
  escala/tráfico.
- `registro.md:121-123` atribuye el "0 moderado" a que el dataset
  "concentra el aislamiento en niveles 1 y 3"; la causa real verificada es
  la correlación nivel↔cruce (nivel 2 siempre con vado) + ausencia de
  peligro/historial de E3a en esta corrida de dev. Corregir la nota.
- Cobertura de test insuficiente para el bloqueante #1: ningún test ejercita
  el request sin `?horizonte=` con más de una fila por `cueAnexo`.
