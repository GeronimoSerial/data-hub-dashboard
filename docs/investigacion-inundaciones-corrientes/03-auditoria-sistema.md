# Auditoría del sistema actual

Ventana investigada: desde el miércoles 7 de octubre de 2026 hasta el corte (2026-10-13 ~12:45 ART). Cada afirmación indica su base:

- **[código]** leído en el repositorio (commit de `main` al 2026-10-13; rutas y líneas verificadas en esta sesión salvo las marcadas «según auditoría delegada»).
- **[prod]** observado en la base productiva (acceso de solo lectura provisto por el equipo), consulta 2026-10-13 ~12:30 ART.
- **[ops]** observado el 2026-10-13 ~13:20–13:45 ART en la configuración de la app de producción (variables de entorno del contenedor y tareas programadas de Coolify) y en el servidor, con acceso autorizado por el equipo.
- **[supuesto]** no verificable con el acceso disponible.

Los cambios operativos hechos ese mismo día (después del corte de esta auditoría) están en [10](10-cambios-operativos-2026-10-13.md); las cifras de esta página describen el estado **anterior** a esos cambios.

## Respuestas directas

| Pregunta | Respuesta |
|---|---|
| ¿Qué puede detectar hoy? | Nada observado de forma automática. No hay ninguna fuente de observación ejecutándose: IMERG (lluvia observada) está programado pero nunca corrió [prod]; no hay integración de alturas de río (Prefectura, INA) [código]. |
| ¿Qué solo estima? | Pronóstico meteorológico (Open-Meteo, grilla 0,2°, cada 3 h) y alertas SMN de tormentas [prod]. El motor (amenaza × vulnerabilidad), el caudal GloFAS y el ensemble de riesgo existen en código pero **no se ejecutan** [prod]. Las capas estáticas (susceptibilidad, exposición RP100, aislamiento) son históricas, no del evento [código]. |
| ¿Qué requiere un parte humano? | Toda afectación concreta de escuela o acceso. Es el único camino para que una afectación real llegue al mapa [código]. |
| ¿Qué datos están disponibles y actualizados? | Radar meteorológico (61 corridas completas, sin huecos > 3 h), ensemble radar (2 fallas el 13/10), alertas SMN (8 fallas HTTP 429 el 7-8/10, sin huecos > 60 min) y capas estáticas cargadas una vez el 2026-10-06 [prod]. |
| ¿Qué llega al mapa? | Partes vigentes (`/api/mapas/infraestructura` → `listarPartesVigentes`) [código]; la pestaña Radar, porque `RISK_RADAR_ENABLED=true` en producción [ops]. Dentro de ella, el panel radar se calcula al vuelo desde la última corrida radar; las capas por escuela («Peligro por clima estimado», «Riesgo pronosticado») estaban **vacías** porque no había ninguna corrida de riesgo vigente [código, prod]. |

## Estado en producción [prod]

| Job | Ejecuciones (histórico completo, primer job 2026-10-06 02:56 UTC) |
|---|---|
| `sync-radar-meteo` | 61 (54 desde el 7/10, todas completas) |
| `sync-radar-ensemble` | 30 (2 fallidas: 13/10 03:55Z y 09:55Z, «fetch failed») |
| `sync-smn-alertas` | 721 (8 fallidas por HTTP 429 entre 7/10 02:52Z y 8/10 03:52Z) |
| `geo-perfiles`, `asociacion-rio-v1` | 1 cada uno (2026-10-06) |
| `calcular-riesgo`, `sync-pronostico-caudal`, `sync-ensemble`, `sync-imerg`, `sync-seasonal`, climatologías, `situacion-corte`, `episodios-derivados` | **0** |

Tablas con 0 filas: `hazard_forecast`, `hazard_observation`, `infra_risk_run`, `infra_risk_snapshot`, `infra_situacion_corte`, `infra_episodio_derivado`, `hazard_source_health`.

Hay unidades systemd para todos esos jobs en `deploy/systemd/ops1/*.timer` [código], pero **producción no usa systemd**: programa sus jobs con tareas de Coolify y solo tenía 4 (`sync-radar-ensemble`, `sync-radar-meteo`, `sync-smn-alertas`, `verificar-radar-meteo`) [ops]. Los timers systemd instalados en el servidor ejecutan la app de **staging** [ops]. Causa confirmada de las 0 ejecuciones: **los jobs no estaban programados en producción** (ver [Configuración observada en producción](#configuración-observada-en-producción)).

Consecuencia: todo el comportamiento del motor descrito abajo es **código no ejecutado en producción** hasta el corte. Importa para cuando se active, no explica lo que se vio en esta crecida.

Capas estáticas [prod]: `infra_geo_profile` 2005 escuelas (4 con motivo de exclusión; `geo_calidad` nulo en las consultadas), `infra_susceptibilidad_estatica` 2001, `infra_exposicion_ruta_inundacion` 2001, `infra_aislamiento_osm` 4002, `infra_geo_rio` 2005.

Alertas SMN almacenadas por fecha de inicio [prod]: 7/10 Moderate 59 / Severe 2; 8/10 Moderate 53 / Severe 43 (hasta 16 departamentos por alerta); 9/10 Moderate 23 / Severe 8; 12/10 Moderate 4. **Solo evento «Tormentas».**

### Datos de prueba mezclados con datos reales

Los partes escolares de la ventana (8 afectaciones en 7 escuelas, creadas desde el 2026-10-07) son **ficticios**, según informó el equipo. Conviven en las mismas tablas (`infra_parte`, `infra_afectacion`) que se usarían para partes reales, junto con datos reales de radar, alertas SMN y capas estáticas, **sin un campo visible de procedencia o entorno** en las tablas consultadas [prod]. Riesgos:

- el mapa productivo puede mostrar afectaciones inexistentes como vigentes (`listarPartesVigentes` no filtra por procedencia [código, según lectura de `parte-mapa.ts`]);
- cualquier evaluación o conjunto de referencia construido desde la base queda contaminado;
- el historial de partes alimenta la vulnerabilidad del motor (`historial` peso 0,7, `motor/config.ts:37`): datos de prueba alterarían scores reales si el motor se activa.

Propuesta en [05](05-diseno-deteccion.md#procedencia-y-entorno) y [06](06-plan-mejoras.md) (acción I-2); pregunta abierta en [09](09-preguntas-limitaciones.md).

## Recorrido fuente → mapa

### Fuentes y scheduler [código]

| Fuente | Módulo | Estado prod |
|---|---|---|
| Open-Meteo Forecast, grilla 0,2° (radar) | `lib/infraestructura/radar-meteo/` | corre |
| Open-Meteo Ensemble (radar) | idem | corre (2 fallas) |
| SMN CAP RSS | `lib/infraestructura/radar-meteo/smn-alertas.ts:22` | corre |
| Open-Meteo Flood (GloFAS) en 8 puntos | `lib/infraestructura/riesgo/puntos-rio.ts` | no corre |
| NASA IMERG | `lib/infraestructura/riesgo/peligro/observado.ts`, `riesgo/jobs/sync-imerg.ts` | no corre |
| ECMWF / Seasonal / Archive (climatologías) | `lib/infraestructura/riesgo/providers/` (según auditoría delegada) | no corre |
| Prefectura, INA, CARU, EBY | **no existe integración** | — |

Retención: `radar_meteo_run` se purga a 14 días por `fetched_at` (`radar-meteo/job-sync.ts:56-58`); `smn_alerta` 90 días (según auditoría delegada). El radar no escribe `hazard_source_health` (búsqueda sin coincidencias en `radar-meteo/`).

Cobertura de la grilla radar (snapshot): lat −30,8 a −27,2; lon −59,6 a −55,6; 239 celdas. **No cubre las cuencas altas** (Iguazú, Paraná en Brasil y Paraguay, Uruguay en Brasil), que explican las crecidas de esta ventana.

### Puntos de río y asociación [código]

- `puntos-rio.ts` define 8 puntos GloFAS identificados por slug, no estaciones: `parana-ituzaingo`, `parana-corrientes-paso-patria`, `parana-bella-vista`, `parana-goya` (54), `parana-esquina`, `uruguay-santo-tome`, `uruguay-paso-de-los-libres`, `uruguay-monte-caseros`. Afluentes (Corriente, Santa Lucía, Miriñay, Aguapey) excluidos como pendiente explícito (`puntos-rio.ts:98-106`).
- El comentario de `parana-goya` (`puntos-rio.ts:59`) repite el caudal máximo de `parana-corrientes-paso-patria` (17740,9 m³/s, `:43`): posible error de copia, a verificar.
- El comentario de `uruguay-santo-tome` (`:76`) advierte que su magnitud (12734 m³/s) es alta y pendiente de contraste.
- **Dos asociaciones distintas:**
  - `riesgo/rio-asociacion.ts:16`: radio 40 km (haversine). La usa el job `asociacion-rio-v1` (`scripts/jobs.mjs`) que llena `infra_geo_rio`.
  - `riesgo/motor/adaptadores/territorio.ts:12,25`: umbral 0,75° con distancia euclídea en grados, sin corrección por coseno de latitud (a −28° un grado de longitud mide ~98 km y uno de latitud ~111 km). Alimenta el componente caudal del motor.
  - Ambas eligen el punto más cercano; ninguna usa cuenca ni hidrografía.
- Resultado en prod (`infra_geo_rio`, 40 km): 0 escuelas asociadas en Berón de Astrada, Concepción, General Paz, **Itatí (0/26, sobre el Paraná)**, Mburucuyá, Mercedes, San Miguel, San Roque y Sauce; Curuzú Cuatiá 1/92; Saladas 3/69; General Alvear 4/25; San Martín 15/51; Santo Tomé 34/103; Ituzaingó 42/78; Monte Caseros 52/78; Paso de los Libres 67/70; Capital 363/365 [prod].

### Motor de riesgo (no ejecutado en prod) [código]

- `scoreRiesgo = round(scoreAmenaza × scoreVulnerabilidad / 100)` (`motor/calculo.ts:382`).
- Amenaza: celda 0,5 / caudal 0,3 / lluvia antecedente 0,2 (`motor/config.ts:20-22`). Vulnerabilidad: historial 0,7 / susceptibilidad 0,3 (`config.ts:37-38`). La exposición no entra en el score; el riesgo de acceso se agrega con peso 0 (`calculo.ts:360-369`).
- El historial «siempre presente» (`calculo.ts:373`) hace que una escuela **sin partes previos y sin susceptibilidad** tenga vulnerabilidad 0 y riesgo 0 **aunque la amenaza sea 100**. El motor mezcla detección de amenaza con priorización.
- Niveles: 25 / 50 / 75 (`config.ts:10-12`).
- Saturación de lluvia 72 h: 150 mm (`config.ts:56`).
- Umbrales provisorios de lluvia v0.1 (`peligro/umbrales-provisorios.ts`): 24 h 50/80/120 mm (`:30`), 72 h 80/120/180 mm (`:22-24`), 240 h ×1,5 (`:27`); el propio archivo dice que es «NO un umbral oficial» (`:2`).

### Consulta temporal [código]

- `obtenerNivelCaudal(puntoId, opts)` descarta `opts.ahora` (`peligro/nivel.ts:588-593`, `void opts?.ahora`) y toma el horizonte más chico de la corrida más reciente de toda la tabla (`nivel.ts:142-164, 185-194`: la consulta filtra solo por `geometryRef` y variable). La climatología usa la última versión (`:227-235`). **No hay reproducibilidad retrospectiva** del caudal ni del pronóstico.
- IMERG sí es «as-of»: solo usa gránulos con `validoHasta <= asOf` (`peligro/observado.ts:10, 71-72`).
- Los comentarios de `nivel.ts:57` y `jobs/sync-imerg.ts:72` remiten a `lib/infraestructura/replay/consulta.ts`, que **no existe**.
- `scripts/exportar-dataset-desidentificado.mjs:33-35` escribe solo el encabezado (`const filas = []`).

### Capas estáticas [código]

- Exposición de rutas: WRI Aqueduct v2 fluvial histórico, período de retorno 100 años (`services/geo-static/src/geo_static/physrisk_susceptibilidad.py:31`; `exposicion_ruta.py:11-12`). Es susceptibilidad, no observación del evento.
- Inundación pluvial siempre `None`: no hay dataset (`physrisk_susceptibilidad.py:5-7, 228-232`). El documento de evidencia citado (`docs/ejecucion-enos/G1/evidencia-physrisk.md`) **no existe** en el repositorio.

### API, flags y mapa [código]

- `app/api/mapas/infraestructura/route.ts:7` devuelve `listarPartesVigentes()` (`lib/infraestructura/parte-mapa.ts:350`).
- Pestaña Radar solo con `props.riskRadarEnabled` (`app/(hub)/mapas/infraestructura/map-client.tsx:118`); flag leído en `lib/infraestructura/riesgo/flags.ts:20`. En producción vale `true` [ops].
- Panel radar: `app/api/infraestructura/radar-meteo/resumen/route.ts` toma la última corrida (`obtenerUltimoRunRadarMeteo`, `:2, :18`) y calcula el resumen al vuelo (`calcularResumen`, `:29`). Lo que mostraba es **reconstruible** desde un snapshot de `radar_meteo_run`.
- Capas de riesgo por escuela: `app/api/infraestructura/radar/route.ts:189-197` busca la `infra_risk_run` vigente y devuelve una respuesta vacía si no existe («Estado legítimo: el motor todavía no publicó ningún corte»). Con `infra_risk_run` en 0 filas [prod], esas capas estuvieron **vacías toda la ventana**.
- La capa «riesgo-acceso» está deshabilitada en código: `{false && radarActivo && capasRadarVisibles['riesgo-acceso'] && (` (`components/mapas/map-infraestructura-page.tsx:1514`).
- `MOSTRAR_AGUA_ESTIMADA = false` (`lib/mapas/flags.ts:2`).
- Las escuelas sin color calculado se ocultan (`lib/infraestructura/mapa/puntos-nivel.ts:27, 40`, `conDato`).
- `RISK_MODE` (`flags.ts:46-47`, `shadow` por defecto) solo lo consume `riesgo/salud.ts:84`, que lo informa; no cambia lo que se muestra.
- Umbral «sin actualizar»: 72 h (`lib/infraestructura/umbrales.ts:20`, marcado como hipótesis ajustable).
- `parte-mapa.ts` no referencia verificaciones (búsqueda sin coincidencias): las verificaciones no alimentan el mapa.
- `components/infraestructura/situacion-client.tsx:56` admite `scoreRiesgo`; la página Situación está habilitada (`SITUACION_ENABLED=true` [ops]) pero `infra_situacion_corte` tiene 0 filas [prod]: no había nada que mostrar.

### Documentos de diseño existentes

`docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md` es una propuesta; `docs/recomendaciones-flujo-enos.md` contiene recomendaciones. Ninguno describe comportamiento implementado.

## Configuración observada en producción

Observada el 2026-10-13 ~13:20–13:45 ART [ops]; antes figuraba como supuesto.

| Elemento | Valor observado | Efecto |
|---|---|---|
| `RISK_RADAR_ENABLED` | `true` | pestaña Radar visible |
| `RISK_ENGINE_ENABLED` | `true` | motor habilitado, pero sin tarea programada: nunca corrió |
| `HAZARD_CONTEXT_ENABLED` | `true` | contexto de amenaza habilitado; sin datos (`hazard_*` en 0 filas) |
| `SITUACION_ENABLED` | `true` | página Situación visible; `infra_situacion_corte` vacía |
| `SEASONAL_ENABLED` | `true` | sin tarea `sync-seasonal` |
| `RISK_MODE` | `shadow` | solo informativo (`riesgo/salud.ts:84`) |
| Token de Earthdata (IMERG) | presente | IMERG podía correr; faltaba programarlo |
| Clave de Open-Meteo | ausente | cupo gratuito, compartido con staging (misma salida de red, probable) |
| Scheduler | tareas programadas de Coolify (4 tareas) | ver tabla de jobs arriba |

**Deriva documental:** `docs/ejecucion-enos/OPS1/runbook-scheduler.md` describe un scheduler systemd que en el servidor corresponde a staging, no a producción. No se editó (fuera de la superficie de esta investigación); acción P-4 en [06](06-plan-mejoras.md#problemas-operativos-detectados-el-2026-10-13).

## Lo que no se pudo verificar [supuesto]

- Qué vio efectivamente un usuario en el mapa en cada momento: no hay snapshots del mapa ni registros de las respuestas servidas. El panel radar es reconstruible desde la corrida; las capas de riesgo estaban vacías por construcción.
- Valores de los flags **antes** del 2026-10-13: se observaron ese día; se supone que no cambiaron durante la ventana (no hay historial de despliegues consultado).
