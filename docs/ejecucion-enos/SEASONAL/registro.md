# Seasonal (E5+) — Perspectiva ENOS 30–90 días — Registro de ejecución

Rama: `feat/enos-seasonal` (worktree `/home/gero/orca/workspaces/data-hub-dashboard/enos-seasonal`), base `204463f` (merge E4, mismo tip que `main`).

Capa **opcional** (plan-implementacion §9.3 / plan-ejecucion §E5): tendencia
ENOS a 30–90 días vía Open-Meteo Seasonal (ECMWF SEAS5 + EC46), consultada
**sólo por los 25 centroides de departamento**, nunca por escuela, detrás del
flag de UI `SEASONAL_ENABLED` (default off). El job de sync corre siempre que
`ENOS_JOBS_ENABLED` lo permita — el flag sólo oculta la tarjeta en el mapa,
mismo criterio que `HAZARD_CONTEXT_ENABLED`.

## Fuentes verificadas (2026-09-27)

- **Endpoint y modelos**: <https://open-meteo.com/en/docs/seasonal-forecast-api>
  — base `https://seasonal-api.open-meteo.com/v1/seasonal`. `models=` acepta
  `ecmwf_seasonal_seamless` (blend EC46+SEAS5, 51 miembros — el usado acá),
  `ecmwf_seas5` y `ecmwf_ec46` (cada uno también 51 miembros), más sus
  variantes `_ensemble_mean`. Resolución ~36 km (grilla O320), cobertura
  global. EC46 actualiza a diario (20:30Z); SEAS5 el día 5 de cada mes; el
  blend hereda la cadencia más frecuente de EC46, de ahí la corrida diaria del
  job (no cada 6h como el resto de OPS1).
- **Pricing/cupo**: <https://open-meteo.com/en/pricing> — confirma los límites
  duros del usuario (600/min, 5.000/hora, 10.000/día, 300.000/mes) y que una
  request "de intervalos largos" ya cuenta como más de 1 llamada ponderada
  (ejemplo citado por Open-Meteo: "this API call is equivalent to 1.3 calls").
  **No hay una fórmula exacta publicada para el peso de Seasonal en
  particular** — el costo de este job se documenta como aproximación (ver
  abajo), no como cifra verificada con una segunda request real.
- **Verificación con UNA request real** (única permitida en este batch, cupo
  ya acotado por el usuario — ver Decisiones): `daily=precipitation_sum` con
  `models=ecmwf_seasonal_seamless` sobre el centroide de Capital devolvió 52
  columnas diarias (`precipitation_sum` = miembro de control +
  `precipitation_sum_memberNN` para NN=01..50) y un horizonte de ~183 días
  corridos desde la fecha de la request, aun pidiendo `forecast_days=95`
  (**Open-Meteo no truncó el horizonte con ese parámetro** — ver Decisiones,
  punto sobre `FORECAST_DAYS_SOLICITADOS`). Fixture real fechado, recortado a
  100 días para no versionar el payload completo:
  `lib/infraestructura/riesgo/__fixtures__/hazard/seasonal-2026-09-27.json`
  (32 KB).

## Decisiones

- **Simplificación v0 de "por encima de lo normal"**: la API Seasonal no trae
  una climatología independiente de 30-90 días (`hazard_climatology` es
  diaria, p95/p99, otra escala temporal — cruzarla exigiría una climatología
  estacional propia que no existe hoy). En vez de inventar una referencia sin
  respaldo, `probabilidadSobreNormal` se define como la fracción de los 50
  miembros **perturbados** cuyo acumulado de la ventana pedida supera al del
  **miembro de control** (la corrida no perturbada, que ECMWF trata como el
  escenario más probable). Es una simplificación explícita, no un percentil
  climatológico — el nombre de la columna y el copy de UI lo dejan claro.
- **Tabla propia** `hazard_seasonal_trend` (no reutiliza `hazard_forecast` ni
  `hazard_ensemble_prob`, que son por celda de grilla, no por departamento).
  Único índice: `hazard_seasonal_trend_uidx` (departamento, variable,
  emisionEn, horizonteDesdeDias, horizonteHastaDias) — evita duplicar en un
  reintento del mismo día. Se agregó al final de `lib/db/schema.ts` en un
  bloque `// Seasonal:` propio y al HUB_DDL de `lib/db/seed.ts`, **sin índice
  en las columnas que agregan las `ensure*` migraciones posteriores** (mismo
  criterio que el resto de tablas del hub).
- **Provider con un único punto de entrada de fetch**: `obtenerTendenciaEstacional()`
  (`lib/infraestructura/riesgo/providers/seasonal.ts`) es la única función
  pública del módulo que dispara red — internamente delega en
  `ejecutarConReintentos()` (`./cliente-http`, ya compartido con
  `ensemble.ts`/`imerg.ts`/etc.) una vez por lote de
  `TAMANO_LOTE_DEPARTAMENTOS_SEASONAL` (5) centroides. Esto es deliberado
  para que el futuro guard de cupo de Open-Meteo (rama `feat/open-meteo-cupo`,
  no mergeada) pueda envolver `ejecutarConReintentos` (o esta función) en un
  solo lugar sin tener que instrumentar cada job por separado.
- **`FORECAST_DAYS_SOLICITADOS = 95`**: se pide para acotar el payload a lo
  necesario para una ventana de 30-90 días. La única request real mostró que
  Open-Meteo **no truncó** el horizonte devuelto (~183 días igual). El parseo
  es correcto de todos modos porque filtra por fecha (`daily.time`), no por
  índice — si el parámetro es ignorado sólo se pierde el ahorro de
  payload/costo, no la corrección. **No se reverificó con una segunda request
  real** (cupo agotado) — pendiente para cuando el guard de cupo o una ventana
  distinta lo permita.
- **Lotes de 5 departamentos por request** (`TAMANO_LOTE_DEPARTAMENTOS_SEASONAL`,
  mismo criterio que `ensemble.ts`): acota el payload por llamada y aísla el
  radio de un fallo de red a 1/5 de los departamentos en vez de a los 25
  juntos. Con 25 departamentos esto da **5 llamadas HTTP por corrida diaria**.
- **Idempotencia en dos capas** (mismo patrón que `sync-ensemble.ts`):
  `infra_job_run` con claveIdempotente = día UTC (una corrida diaria compite
  por el mismo run), y el `uidx` de `hazard_seasonal_trend` hace que un
  reintento el mismo día actualice en vez de duplicar. Lease renovado entre
  tandas (5 tandas de 1 lote cada una); si el lease se pierde a mitad de
  camino, el job corta limpio y reporta `lease_perdido_durante_ejecucion` sin
  dejar `infra_job_run` colgado en progreso.
- **Salud de fuente**: `hazard_source_health` se marca `degradado` si
  cualquier departamento quedó en `erroresPorDepartamento` (un lote fallido no
  tumba el job entero — sigue con los demás), `ok` si no hay errores.
- **API `/api/infraestructura/tendencia-estacional`**: ACL **staff**
  (admin/editor vía `staffGuard`), no el ACL genérico de lectura del mapa —
  mismo criterio que `/api/infraestructura/operacion/salud`, porque esto es un
  dato operativo interno, no la ficha territorial pública. Siempre
  `Cache-Control: private, no-store`. Devuelve **una fila por departamento**
  (la emisión más reciente), nunca el historial completo. La API existe
  siempre (protegida por ACL); el flag `SEASONAL_ENABLED` sólo oculta el
  frontend, igual criterio que `hazardContextEnabled`.
- **UI**: tarjeta "Perspectiva 30–90 días (pronóstico probabilístico
  regional)" dentro de `RiskExplanationPanel` (variante `tipo: 'departamento'`),
  prop opcional `tendenciaEstacional` — `undefined` = capa apagada/no
  consultada (no se muestra la tarjeta, ni vacía ni cargando), `null` =
  consultada sin datos aún. Etiquetado explícito y no dependiente sólo de
  color: el título dice "regional" y el texto dice literalmente "Tendencia
  REGIONAL estimada, no es un valor por escuela"; la probabilidad se muestra
  siempre como texto (`"NN%"` o `"sin dato"`) nunca como color solo. Gateado
  en `map-infraestructura-page.tsx`: sólo se consulta (`useTendenciaEstacional`)
  y se pasa la prop cuando `seasonalEnabled && radarActivo && departamento
  seleccionado !== null`; con el flag apagado no hay fetch ni tarjeta.
- **Job registrado en OPS1**: `sync-seasonal` agregado a `scripts/jobs.mjs`
  (`NOMBRES_VALIDOS` + dispatch), timer systemd
  `deploy/systemd/ops1/enos-ops1-sync-seasonal.timer` (diario, `09:00 UTC`,
  reusa la unidad plantilla `enos-ops1@.service` como el resto de jobs),
  runbook (`docs/ejecucion-enos/OPS1/runbook-scheduler.md`) actualizado con el
  `systemctl enable --now` y la fila en la tabla de cadencias, aclarando que
  habilitar el timer es opcional y el job corre igual con el flag de UI
  apagado.

## Costo estimado por corrida (peso ponderado)

- **5 llamadas HTTP por corrida diaria** (25 departamentos ÷ 5 por lote).
- Open-Meteo no publica una fórmula exacta de peso para Seasonal; la única
  referencia verificada es el ejemplo de pricing citado arriba ("una request
  de intervalos largos puede equivaler a >1 llamada ponderada", ejemplo dado:
  1.3x). Cada request de este job pide **1 variable diaria** (`precipitation_sum`)
  con horizonte largo (~95-183 días) para **5 ubicaciones** simultáneas — los
  51 "miembros" son columnas de la misma variable/ubicación en la respuesta de
  Seasonal, no variables ni ubicaciones adicionales a efectos del cupo (mismo
  criterio de conteo que `ensemble.ts`, que ya asume esto para
  `hourlyEnsembleSchema`).
- **Estimación conservadora** (no verificada con una segunda request real,
  cupo agotado el día de esta implementación): tomando el peso 1.3x citado
  como cota superior razonable para "intervalo largo", **5 llamadas × ~1.3 ≈
  6,5 llamadas ponderadas por corrida diaria**. Muy por debajo de cualquiera
  de los límites duros del usuario (600/min, 5.000/h, 10.000/día, 300.000/mes)
  incluso sumado al resto de jobs OPS1 ya activos (ensemble, IMERG, caudal,
  climatologías). **Pendiente**: confirmar el peso real con una request de
  diagnóstico cuando el cupo se reponga (00:00 UTC) o cuando el guard de cupo
  de `feat/open-meteo-cupo` esté disponible para medirlo sin riesgo de
  exceder límites.

## Verificación

| Comando | Resultado |
|---|---|
| `pnpm vitest run` (foco: centroides, provider, job, API, panel, flags) | exit 0 — 6 archivos, 45 tests OK |
| `pnpm test` | exit 0 — 177 archivos, 1481 tests OK |
| `pnpm lint` | exit 0 |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 — `/api/infraestructura/tendencia-estacional` listada entre las rutas |

Cobertura de tests nueva/tocada:

- `lib/mapas/departamento-centroides.test.ts` — 25 departamentos, coordenadas
  dentro del bbox de Corrientes, sin duplicados.
- `lib/infraestructura/riesgo/providers/seasonal.test.ts` — parseo contra el
  fixture real fechado y contra payloads sintéticos por longitud (acumulado
  por ventana, `probabilidadSobreNormal` determinística, lotes de 5, un lote
  fallido no tumba a los demás, payload con cantidad de objetos distinta a la
  esperada cae como error).
- `lib/infraestructura/riesgo/jobs/sync-seasonal.test.ts` — idempotencia con
  lease (misma clave del día = mismo run; reintento actualiza vía `uidx` en
  vez de duplicar), lease perdido a mitad de tandas, salud degradada cuando
  hay errores parciales, provider que lanza no tumba el job.
- `app/api/infraestructura/tendencia-estacional/route.test.ts` — ACL staff
  (403 para no-staff), `Cache-Control: private, no-store`, filtro por
  departamento, una fila por departamento (la más reciente), 400 con
  parámetro inválido.
- `components/mapas/risk-explanation-panel.test.tsx` — tarjeta ausente sin
  `tendenciaEstacional` (flag off simulado), presente con el rótulo "no es un
  valor por escuela" y la probabilidad como texto (no sólo color).
- `lib/infraestructura/riesgo/flags.test.ts` — `seasonalEnabled()` default
  off, `true` sólo con `SEASONAL_ENABLED=true` exacto.

## Pendiente

- Confirmar el peso ponderado real de una request Seasonal (ver "Costo
  estimado" arriba) con una segunda request real cuando el cupo lo permita.
- Reverificar si `forecast_days=95` realmente acota el payload en el servidor
  de Open-Meteo (la única request real mostró que no truncó el horizonte
  devuelto) — no bloqueante para la corrección, sólo para el ahorro de
  payload/costo.
- Cuando `feat/open-meteo-cupo` mergee, envolver
  `obtenerTendenciaEstacional`/`ejecutarConReintentos` con el guard de cupo
  compartido (el único punto de entrada de fetch ya está preparado para eso).
- Habilitar `SEASONAL_ENABLED=true` en un ambiente real y correr el timer
  systemd al menos una corrida completa contra la red, para confirmar
  `filasInsertadas`/`llamadasRealizadas` con datos reales (esta implementación
  se verificó con el fixture + tests, no con una corrida real end-to-end del
  job completo, por la restricción explícita de no llamar a Open-Meteo real
  en este batch).
- Walkthrough UX de la tarjeta nueva con usuarios reales — no se hizo (mismo
  gap ya documentado en otros batches de ENOS, requiere levantar la app con
  navegador).
