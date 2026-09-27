# OM-cupo — guarda de cupo compartida de Open-Meteo

Registro de ejecución del batch OM-cupo (feature/open-meteo-cupo). Ver
`lib/infraestructura/riesgo/providers/cupo-om.ts` para la implementación y
`lib/infraestructura/riesgo/providers/cupo-om.test.ts` para los tests.

## 1. Objetivo

Evitar que los adapters de Open-Meteo (ECMWF, Ensemble, Archive/ERA5, Flood —
hosts `api.`, `ensemble-api.`, `archive-api.`, `flood-api.`, y sus variantes
`customer-*` cuando hay `OPEN_METEO_API_KEY`) superen los techos de la cuenta,
reservando cupo ANTES de cada request, esperando acotado en la ventana de
minuto, y deteniendo limpiamente el job (marcando la fuente `degradado` con
motivo `cupo_agotado`) cuando se agota una ventana larga (hora/día/mes).

## 2. Fuente de la regla de peso (citas textuales)

Fuente: <https://open-meteo.com/en/pricing>, sección "How API Requests Are
Counted as Multiple Calls" (consultada 2026-09-27):

> "Typically, one API call corresponds to one HTTP API request."
>
> "Requests for data covering more than 10 weather variables or extending
> over a period of more than 2 weeks for a single location are considered
> multiple API calls."
>
> "To calculate the number of API calls accurately, fractional counts are
> used. For example, a request for 2 weeks of data with 15 weather variables
> will be calculated as 1.5 API calls, while 4 weeks of data equals 3.0 API
> calls."

De los dos ejemplos (15 var/2 sem = 1.5; 15 var/4 sem = 3.0) se deriva la
fórmula implementada en `pesoLlamada` (`providers/cupo-om.ts`):

```
factorVariables = max(1, variables / 10)
factorDias      = max(1, dias / 14)
pesoPorUbicacion = factorVariables * factorDias
peso_total       = pesoPorUbicacion * ubicaciones
```

**Supuesto documentado (multi-ubicación):** la página NO publica una regla
cerrada de peso por multi-coordenada a la fecha de esta implementación (sólo
dice que la distinción "is crucial for developing future features such as
APIs for multiple locations simultaneously"). Se asume escalado LINEAL con la
cantidad de ubicaciones — dirección conservadora: si el costo real es menor
por request multi-ubicación, sólo reservamos de más (nos frenamos antes de
tiempo), nunca subestimamos y terminamos golpeando un 429 real.

**Los techos son de cuenta/IP, no por subdominio** (la página no distingue
host por host): la contabilidad (`bucketCupo` en `cupo-om.ts`) colapsa los 4
hosts a un único bucket compartido por plan (`open-meteo-free` /
`open-meteo-pago`), y el cooldown post-429 bloquea el bucket entero, no sólo
el host que devolvió el 429.

## 3. Techos duros y configuración

| Ventana | Techo gratuito (hard) | Default operativo (80%) |
|---|---|---|
| minuto | 600 | 480 |
| hora | 5.000 | 4.000 |
| día | 10.000 | 8.000 |
| mes | 300.000 | 240.000 |

El env base (`OPEN_METEO_LIMITE_<VENTANA>`) sólo puede BAJAR el techo; un
valor por encima se recorta con warning. Superarlo requiere
`OPEN_METEO_API_KEY` + `OPEN_METEO_LIMITE_<VENTANA>_PAGO` explícito (no se
clampea: es la configuración del plan pago).

## 4. Costo real estimado por ciclo y por día (cadencias OPS1)

Cadencias fuente: `docs/ejecucion-enos/OPS1/runbook-scheduler.md` §"Tabla de
cadencias por job" y `lib/infraestructura/riesgo/cadencias.ts`. Sólo dos jobs
programados llaman a Open-Meteo: `sync-pronostico-caudal` y `sync-ensemble`
(ambos cada 6h, 4 corridas/día); `sync-imerg` es NASA (no Open-Meteo);
`calcular-riesgo`/`episodios-derivados`/`geo-perfiles` no llaman a APIs
externas. Las dos climatologías (`calcular-climatologia`,
`calcular-climatologia-caudal`) son bajo demanda (sin timer).

Ubicaciones: ~387 celdas con `infra_geo_profile.geometryRef` (ECMWF,
Ensemble, climatología de precipitación) y ~8 puntos de río fijos en
`PUNTOS_RIO` (Flood, climatología de caudal).

### 4.1 `sync-pronostico-caudal` (cada 6h)

- **ECMWF** (`api`, `/v1/ecmwf`): batch de 50 coords/request (~8 requests
  para 387 celdas), 5 variables (`ecmwf.ts`), `forecast_days=10`.
  `factorVariables=max(1,5/10)=1`, `factorDias=max(1,10/14)=1` →
  peso total = 387 × 1 × 1 = **387**.
- **Flood** (`flood-api`, `/v1/flood`): sin batching multi-coordenada (una
  request por punto, `flood.ts`), 4 variables, `forecast_days=10` →
  `factorVariables=1`, `factorDias=1` → peso total = 8 × 1 × 1 = **8**.
- **Total por corrida: ≈395.**

### 4.2 `sync-ensemble` (cada 6h)

- Batch de 20 coords/request (~20 requests para 387 celdas), 1 variable
  solicitada por query string (`hourly=precipitation`, expande a 51 series
  server-side pero el peso usa la variable de query, ver `ensemble.ts`),
  `forecast_days=3`. `factorVariables=max(1,1/10)=1`,
  `factorDias=max(1,3/14)=1` → peso total = 387 × 1 × 1 = **387**.

### 4.3 Total del ciclo programado (6h) y por día

| | por ciclo (6h) | por día (×4) | por mes (×30) |
|---|---|---|---|
| sync-pronostico-caudal + sync-ensemble | **782** | **3.128** | **93.840** |

Frente a los defaults operativos (80%): minuto 480 (se reparte en ~28
requests HTTP por ciclo, ninguna ventana de minuto real cerca del techo),
hora 4.000 (782 muy por debajo), día 8.000 (3.128 deja ~4.872 de margen
diario), mes 240.000 (93.840 deja ~146.160 de margen mensual para las
climatologías bajo demanda).

**Veredicto: el nivel gratuito ALCANZA sobradamente para los jobs
programados de OPS1** (usa ~39% del cupo diario y ~39% del mensual, sólo con
los dos syncs de 6h).

### 4.4 Climatología de caudal (`calcular-climatologia-caudal`, bajo demanda)

Batch único (8 puntos ≤ `TAMANO_LOTE_COORDENADAS_CAUDAL=50` → 1 request), 1
variable, período `2015-01-01`–`2024-12-31` (~3.653 días ≈ 10 años).
`factorVariables=1`, `factorDias=max(1,3653/14)≈260,9` → peso total =
8 × 1 × 260,9 ≈ **2.087**. Cabe cómodo en cualquier ventana (día u hora),
incluso sumado al tráfico programado del mismo día.

### 4.5 Climatología de precipitación (`calcular-climatologia`, bajo demanda) — HALLAZGO CRÍTICO Y FIX APLICADO

**Estado original (antes de este batch):** el job **no usaba el batching de
50 coordenadas** que sí soporta el provider (`climatologia.ts`,
`TAMANO_LOTE_COORDENADAS=50`): iteraba celda por celda y llamaba
`obtenerSerieHistorica` (wrapper de 1 sola ubicación) para cada una de las
~387 celdas. Período default `1991-01-01`–`2020-12-31` (30 años, **10.958
días exactos** — se corrige acá el ≈10.957 estimado en la primera versión de
este registro), 1 variable (`precipitation_sum`).

Peso por request (1 ubicación): `factorVariables=max(1,1/10)=1`,
`factorDias=max(1,10958/14)≈782,71` → peso ≈ **782,71 por celda**.

Peso total para las ~387 celdas: **387 × 782,71 ≈ 302.910** — esto **supera
el techo duro mensual absoluto (300.000)**, no sólo el default operativo del
80% (240.000).

**Batching solo (sin deduplicar ubicaciones) NO alcanza — verificado con la
fórmula real:** `pesoLlamada` (`cupo-om.ts`) escala **linealmente en
`ubicaciones`**, sin importar cuántas entren en una sola request HTTP.
Agrupar en lotes de 50 (lo que sí hace `obtenerSeriesHistoricas`) reduce de
~387 requests HTTP a ~8, pero el peso total sigue siendo
`387 × 782,71 ≈ 302.910` — el mismo número, porque `ubicaciones` en la
fórmula cuenta coordenadas pedidas, no requests disparadas. **Confirma la
hipótesis del punto 1 del pedido: batching por sí solo no reduce el peso.**
La única palanca real para bajar el peso total es reducir el producto
`ubicaciones × variables × días`.

**Fix aplicado — deduplicación por celda nativa de ERA5 + cursor resumable
(ver `providers/climatologia.ts`: `agruparPuntosPorEra5`,
`redondearACeldaEra5`, `estimarCostoClimatologia`; `jobs/calcular-climatologia.ts`):**

1. **Deduplicación por celda ERA5 (~0.25°):** ERA5 (la fuente detrás de
   `/v1/archive`) tiene una resolución nativa más gruesa (~0.25°) que la
   grilla de 0.1° de `infra_geo_profile`. Pedir cada celda de 0.1° por
   separado sólo duplicaba, bajo interpolación bilineal, el mismo dato
   subyacente varias veces. `obtenerSeriesHistoricas` ahora redondea cada
   punto a la celda ERA5 que lo contiene (`round(valor/0.25)*0.25`,
   supuesto documentado igual que el de escalado lineal de `pesoLlamada`:
   Open-Meteo no publica el offset exacto de su grilla; el peor caso es
   agrupar de más, un error de precisión espacial acotado a ~0.25°, nunca de
   cupo) y pide UNA sola serie por grupo, replicándola a todos los
   `geometryRef` de 0.1° agrupados. Esto reduce las `ubicaciones` REALES
   consultadas (y por lo tanto el peso, que escala lineal en ellas) sin
   fabricar datos: es el mismo valor de grilla que ya se devolvía repetido.
   - Ratio de deduplicación esperado: área de una celda ERA5 (0.25°) vs. una
     de 0.1° ≈ `(0.25/0.1)² = 6,25`. Sobre ~387 celdas de 0.1°, el número
     de celdas ERA5 únicas esperado es del orden de `387 / 6,25 ≈ 62`
     (estimación geométrica; el número real depende de la distribución
     espacial real de `infra_geo_profile`, no medida en este batch por no
     haber datos reales sembrados en este entorno — `estimarCostoClimatologia`
     permite recalcular con el número real de celdas ERA5 que devuelva
     `agruparPuntosPorEra5` sobre los datos de producción).
   - Costo con 62 celdas ERA5 (best-effort, usar como referencia de orden de
     magnitud): `62 × 782,71 ≈ 48.528` — **muy por debajo** del techo
     operativo mensual (240.000) y del duro (300.000), incluso sumado a los
     ~93.840/mes de los syncs programados (total ≈ 142.368, deja ~97.632 de
     margen mensual).
   - Peor caso (si la deduplicación real fuera nula, 387 celdas ERA5 únicas
     — geografía muy dispersa): sigue en **302.910**, igual que sin el fix.
     El fix por sí solo NO garantiza entrar en el techo si la dispersión
     geográfica real es mayor a la esperada; por eso se complementa con:
2. **Cursor resumable vía `hazard_climatology` (sin tabla nueva):** antes de
   gastar cupo, el job excluye las celdas que YA tienen al menos una fila
   persistida para el período+version exacto (misma clave que el `upsert`
   existente). Si el cupo se agota en una ventana larga
   (`cupo_agotado`/`host_en_cooldown`), el job-run se marca **`fallido`** a
   propósito (no `completado`) — esto es lo que permite que `adquirirLease`
   autorice retomar el MISMO período+version en la corrida siguiente en vez
   de bloquearlo para siempre (si quedara `completado`, el lease impediría
   cualquier reintento). Las celdas que no llegaron a procesarse simplemente
   no quedan en `hazard_climatology`, así que la corrida siguiente las
   detecta como pendientes y retoma sin recomputar ni volver a gastar cupo
   en lo ya hecho.
   - Con el peor caso (sin deduplicación real, 302.910 de peso total) y un
     techo operativo mensual de 240.000, el cursor resumable permite
     terminar la corrida completa en **2 meses calendario** (una corrida por
     mes, cada una tomando lo que el cupo mensual disponible permita antes
     de cortar), dejando margen para los syncs programados de 6h en cada
     mes intermedio. Con el caso esperado (dedup real ≈62 celdas), la
     corrida completa entra en **1 solo mes** sin necesidad de cursor.
3. **No se cambió el período por defecto en código** (sigue siendo
   `1991-01-01`–`2020-12-31`, para no alterar la ventana de referencia usada
   por el resto del sistema): la combinación dedup+cursor ya resuelve el
   caso peor sin necesitar acortar el período ni requerir plan pago.

**Verdicto:** el batching de 50 coordenadas por sí solo NO reduce el peso
(confirmado con la fórmula real, no sólo con la lectura de la doc de
Open-Meteo). La deduplicación por celda ERA5 SÍ lo reduce (baja las
`ubicaciones` reales, la única palanca real bajo la fórmula), y en el caso
esperado (~62 celdas ERA5 únicas) deja la corrida completa cómoda dentro de
un solo mes calendario. El cursor resumable (reusando `hazard_climatology`,
sin tabla nueva) es la red de seguridad para el caso en que la dispersión
geográfica real sea peor a la esperada: garantiza que ninguna corrida
recomputa trabajo ya hecho y que el job siempre progresa mes a mes hasta
completar, sin exceder nunca los techos duros documentados en la sección 3.

## 5. Verificación

- `pnpm exec vitest run --maxWorkers=2 lib/infraestructura/riesgo/providers/cupo-om.test.ts lib/infraestructura/riesgo/providers/cliente-http.test.ts` → **31/31 passed** (fórmula de peso, límites/clamping, reserva atómica por ventana, wait-vs-stop en minuto, cooldown post-429, contabilidad cross-proceso con dos clientes drizzle contra el mismo archivo SQLite, switch de URL/API key, integración de cliente-http con el controlador de cupo).
- `pnpm exec vitest run --maxWorkers=2 lib/infraestructura/riesgo/providers/climatologia.test.ts lib/infraestructura/riesgo/jobs/calcular-climatologia.test.ts` (foco del fix de este batch) → **22/22 passed**: dedup 0.1°→celda ERA5 (`redondearACeldaEra5`/`agruparPuntosPorEra5`), `estimarCostoClimatologia` (fórmula y escalado lineal), resultado idéntico al enfoque celda-por-celda (misma serie para dos celdas que colapsan en 1 sola request HTTP), cursor resumable (corte en `cupo_agotado`, job-run queda `fallido` a propósito, la corrida siguiente sólo pide la celda pendiente y no recomputa la ya hecha, corrida sin celdas pendientes no llama a la red).
- `pnpm exec vitest run --maxWorkers=2` (suite completa) → **1437/1437 passed**, 168 archivos (+9 tests nuevos sobre el baseline de 1428).
- `pnpm lint` → sin hallazgos.
- `pnpm exec tsc --noEmit` → sin errores.
- `pnpm build` → build de producción exitoso (Next.js 16.2.9 / Turbopack).

## 6. Decisiones de diseño (resumen)

1. **Bucket compartido, no por host literal**: los 4 hosts de Open-Meteo
   gastan del mismo pozo de cupo (cuenta/IP), tanto en la contabilidad
   (`om_cupo_contador`) como en el cooldown post-429 (`om_cupo_cooldown`).
   `host` se conserva como nombre de columna por no romper el resto del
   archivo con un rename cosmético; el valor persistido es el bucket
   (`open-meteo-free`/`open-meteo-pago`).
2. **Reserva todo-o-nada por las 4 ventanas**: si cualquier ventana
   (minuto/hora/día/mes) rechazaría el peso, ninguna queda incrementada.
3. **Minuto: espera acotada (máx. `esperaMaximaMs`, default 65s) y un solo
   reintento**; hora/día/mes: `stop` inmediato (`cupo_agotado`), sin
   bloquear el job por horas.
4. **429 con `Retry-After`**: cooldown persistido a nivel de bucket
   (`registrarCooldown`); sin header, no se registra nada (no se sabe cuánto
   durar) y se sigue con el backoff interno normal de `cliente-http.ts`.
5. **Techos duros no configurables al alza** sin `OPEN_METEO_API_KEY` +
   env `_PAGO` explícito por ventana.
6. **Persistencia en SQLite** (bloque `// OM-cupo:` al final de
   `lib/db/schema.ts` y de `HUB_DDL` en `lib/db/seed.ts`; sin índice
   adicional en las tablas nuevas, siguiendo la convención de las
   migraciones `ensure*` posteriores) para que la contabilidad sea
   compartida entre procesos (dos timers systemd corriendo jobs distintos
   simultáneamente comparten el mismo pozo real).
7. **Visibilidad en `/admin/operacion`**: sección "Cupo Open-Meteo" con
   uso/límite por ventana y cooldowns activos (`obtenerResumenCupo`).
8. **Deduplicación por celda ERA5 + cursor resumable para `calcular-climatologia`**
   (ver sección 4.5): batching de coordenadas por sí solo no reduce el peso
   (`pesoLlamada` escala lineal en `ubicaciones`, no en requests HTTP);
   `agruparPuntosPorEra5` reduce las `ubicaciones` reales deduplicando por la
   celda nativa de ERA5 (~0.25°), y el cursor resumable (reusando
   `hazard_climatology`, sin tabla nueva) garantiza que una corrida cortada
   por `cupo_agotado` progresa mes a mes sin recomputar trabajo ya hecho. El
   job-run queda `fallido` (no `completado`) cuando el corte fue por cupo,
   para que `adquirirLease` autorice el reintento del mismo período+version.
