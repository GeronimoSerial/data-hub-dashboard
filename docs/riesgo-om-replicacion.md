# Riesgo Open-Meteo: producción como único productor

Staging y dev salen a Internet por la misma IP que producción y Open-Meteo
cuenta el cupo gratuito por IP. Por eso los consumidores no consultan la API:
copian desde `hub_prod` lo que producen los jobs de producción.

## Rol del entorno

`RIESGO_DATOS_ROL` (`lib/infraestructura/riesgo/providers/rol-entorno.ts`):

| Valor | Rol |
|---|---|
| `productor` | consulta Open-Meteo (producción) |
| `consumidor` | no consulta Open-Meteo; replica |
| sin valor | `consumidor` si `DATABASE_URL` apunta a `hub_staging` o `hub_dev`; si no, `productor` |
| cualquier otro valor | `consumidor` (un error de tipeo nunca gasta cupo) |

En rol consumidor, `node scripts/jobs.mjs <job>` responde
`{"ejecutado":false,"motivo":"rol_consumidor"}` con exit 0, antes de migrar o
cargar el módulo, para: `sync-pronostico-caudal`, `sync-ensemble`,
`sync-seasonal`, `climatologia-precipitacion`, `climatologia-caudal`,
`sync-radar-meteo`, `sync-radar-ensemble` y `verificar-radar-meteo`. La salud de
jobs (`jobs-esperados.ts`) los reporta como `no_programado`. `sync-imerg`,
`climatologia-imerg` (NASA, cupo por token), Prefectura, SYNOP, SMN y los jobs
derivados (`calcular-riesgo`, `situacion-corte`, veredicto) no cambian.

## Réplica

`node scripts/replicar-riesgo-om.mjs` copia de `RIESGO_SOURCE_DATABASE_URL`
(`hub_prod`) a `DATABASE_URL` (`hub_staging` o `hub_dev`). Exige esos nombres en
las URLs y en `current_database()` de cada conexión. No llama a ninguna API.

| Tabla | Filas | Marca (partición) | Primera copia |
|---|---|---|---|
| `hazard_forecast` | `open-meteo-ecmwf`, `open-meteo-flood` | `corrida_en` (provider) | 14 días |
| `hazard_ensemble_prob` | todas | `corrida_en` (variable) | 14 días |
| `hazard_seasonal_trend` | todas | `emision_en` (variable) | 60 días |
| `hazard_climatology` | versiones no IMERG (ERA5 y caudal) | `calculado_en` (version) | todo |
| `hazard_precipitacion_serie` | celdas ERA5 (sin prefijo `imerg:`) | `descargado_en` | todo |
| `hazard_source_health` | proveedores `open-meteo-*` | `actualizada_en` (provider) | todo |

Sólo copia filas con marca igual o posterior a la última del destino en su
partición: las corridas viejas no se re-copian y la última se vuelve a copiar
para completar una corrida que producción estaba escribiendo. Upsert por la
clave natural (los índices únicos del esquema), conservando el `id` del destino.
No purga: filas propias del destino ausentes en el origen quedan intactas.

Lectura en snapshot `REPEATABLE READ READ ONLY`; escritura en una transacción
con `SHARE ROW EXCLUSIVE` sobre las seis tablas, que serializa réplicas
concurrentes sin bloquear lecturas de la app. Si falla una tabla, no se aplica
ninguna. Las tablas `radar_meteo_*` las copia la [réplica del radar](radar-replicacion.md).

Configurar en ambos consumidores:

```dotenv
RIESGO_DATOS_ROL=consumidor
RIESGO_SOURCE_DATABASE_URL=postgresql://lector:clave@host/hub_prod
```

El usuario de origen necesita sólo `SELECT` sobre las seis tablas (puede ser el
mismo lector del radar con los permisos ampliados). La base destino debe tener
el esquema vigente; el script no migra. No depende de `ENOS_JOBS_ENABLED`.

La [activación en Coolify y systemd](riesgo-om-operacion.md) queda preparada
para ejecución manual.

## Verificación y reversión del código

`vitest run scripts/replicar-riesgo-om.test.ts` ejecuta SQL contra dos PGlite:
filtro por fuente, idempotencia sin `fetch`, sólo corridas nuevas por partición,
ventana inicial, actualización de climatología recalculada, lotes y rollback.
`scripts/jobs.test.ts`, `rol-entorno.test.ts` y `jobs-esperados.test.ts` cubren
el bloqueo por rol.

Revertir el código: el script de réplica, su módulo y tests, el bloqueo en
`jobs.mjs`, `rol-entorno.ts` y la variante por rol de `jobs-esperados.ts`.
