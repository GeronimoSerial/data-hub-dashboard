# Promoción de Motor v0.4 a motor operativo (T11)

Desde este despliegue, el job operativo `calcular-riesgo` corre Motor v0.4. No hay
período de candidato: v0.4 publica el puntero vigente desde la primera corrida.
El frontend no cambia. La forma de los datos es la misma; sólo cambia cuántas
escuelas quedan en riesgo.

## Qué cambió

| Pieza | Antes | Después |
|---|---|---|
| `MOTOR_VERSION` (`motor/config.ts`) | `motor-v0.3` | `motor-v0.4` (`MODELO_VERSION_V04` queda como alias) |
| Job `calcular-riesgo` | reglas v0.3 | reglas v0.4 (`reglas-v0.4-3`): río probabilístico donde la superación del terreno es `modelada`, río v0.3 en el resto |
| Tipo de job, bloque y lease | `calcular-riesgo-v0`, 6 h, 15 min | sin cambios |
| `infra_risk_run` | `modeloVersion = motor-v0.3`, `metadatos` nulo | `modeloVersion = motor-v0.4`, `modo = operativo`, `metadatos` con reglas, insumos y `degradacion` |
| `infra_risk_snapshot` | columnas heredadas | mismas columnas heredadas y además `resultado_v04` por fila |
| Universo | escuelas con perfil territorial | **el mismo**. Las escuelas sin coordenadas siguen sin fila |
| `cobertura` del run | `{procesadas, conEvidencia, sinEvidencia}` | las mismas 3 claves |
| `publicar-run.ts` | acepta `motor-v0.3` | acepta únicamente `motor-v0.4`; sigue rechazando candidatos |
| Job `calcular-riesgo-v04-candidato` | no programado | ya no figura en `jobs-esperados`. El código queda para corridas manuales de evaluación con el padrón completo |
| `sync-ina-serie-diaria` | no programado | `10 6 * * *` |
| `sync-ina-pronostico` | no programado | `50 1,7,13,19 * * *`, antes de `calcular-riesgo` |
| `sync-radar-meteo` | — | `27 3,9,15,21 * * *` |
| `climatologia-caudal`, `climatologia-precipitacion` | — | deshabilitadas (sólo corrida manual) |

`sync-ina-pronostico` se programa para tener el dato fresco y su salud de fuente
visible. El cálculo operativo de esta versión todavía no lo usa: la superación del
terreno se calcula con la serie diaria A5 y la última lectura de Prefectura.

Los dos jobs INA no escriben `infra_job_run`. En la salud de jobs aparecen como
`sin_trazabilidad`, y su frescura se ve en `hazard_source_health` (`ina-a5`,
`ina-a5-pronostico`). INA no comparte cupo por IP, así que staging y dev también
corren sus propios jobs INA en lugar de replicar `hidro_serie_diaria` /
`hidro_ina_*`.

## Degradación por falta de datos

El run nunca se cae porque falte un insumo de v0.4. Cada falta queda registrada en
`metadatos.degradacion`:

| Motivo | Causa | Efecto |
|---|---|---|
| `padron_no_disponible` | el padrón no se pudo leer | se usa el universo de perfiles; todas las escuelas cuentan como con coordenadas |
| `altimetria_no_disponible` | no hay versión de altimetría importada o no se pudo leer | la superación del terreno queda `no_estimable` con motivo; se usa el río v0.3 |
| `terreno_no_disponible` | falló la carga de catálogo A5, tramos o series | ninguna escuela tiene río probabilístico; se usa el río v0.3 |
| `serie_ina_desactualizada` | la última fila de una estación (INA + Prefectura) tiene más de 3 días | esa estación no alimenta v0.4 en esta corrida; queda listada en `metadatos.insumos.estacionesDesactualizadas` |
| `peligro_240h_respaldo` | la ingesta más reciente no cubría la ventana (216, 240] y se usó la ingesta previa (máximo 18 h de antigüedad) | la celda usa esa ingesta; el dato sigue siendo válido |
| `peligro_240h_sin_dato` | alguna escuela quedó con peligro `sin_dato` a 240 h | esa escuela no tiene peligro meteorológico a 240 h en la corrida |

## Configurar las Scheduled Tasks de producción

Workflow manual `.github/workflows/riesgo-v04-operacion.yml`, que usa los secrets
`COOLIFY_TOKEN` y `COOLIFY_APP_UUID`:

1. Correr `inspeccionar` (es el default y sólo lee). Muestra el diff, por ejemplo
   `CREAR sync-ina-serie-diaria …` o `MODIFICAR <uuid> sync-radar-meteo {…} -> {…}`.
2. Si el diff es el esperado, correr `configurar`. Volver a correrlo no cambia nada.
3. Correr `estado` para ver las tareas y las últimas ejecuciones de los jobs INA.

El script se niega a operar si `DATABASE_URL` de la aplicación no apunta a
`hub_prod`. Sólo toca las tareas listadas arriba.

## Una única versión operativa en todos los entornos

Desde el 18/10/2026 sólo se publica `motor-v0.4` en producción, staging y dev.
La variable antigua `RIESGO_REGLAS_MOTOR=v0.3` ya no cambia el motor operativo.
Las reglas v0.3 del núcleo puro se conservan para comparaciones históricas.
La migración `0029_riesgo_operativo_solo_v04` impide nuevas publicaciones v0.3
también desde SQL directo, sin borrar corridas ni factores anteriores.

v0.4 es la evaluación integral: conserva peligro meteorológico, caudal, lluvia
observada, historial, vulnerabilidad, acceso y exposición educativa. Cambia las
reglas F1–F6 y agrega la probabilidad fluvial; cuando ésta es estimable,
reemplaza el factor anterior del río para evitar contarlo dos veces. Las
columnas `score_*` y `nivel_*` y todos sus factores siguen persistidos.
`resultado_v04` añade el detalle probabilístico; por sí solo no representa
la evaluación completa. Sin probabilidad estimable se conserva el camino
observado del río bajo las reglas de alcance v0.4, con abstención explícita.

Para actualizar una base de desarrollo atrasada sin recalcular con insumos
incompletos, `node scripts/replicar-riesgo-v04.mjs` copia la corrida vigente
completa de `hub_prod` a `hub_staging` o `hub_dev`. Recibe
`RIESGO_SOURCE_DATABASE_URL` y `DATABASE_URL`, valida los destinos, la versión,
la cobertura y los tres horizontes. Copia el run, snapshots completos y todos
los factores en una transacción; conserva las corridas anteriores como vencidas.
No modifica insumos ni producción. Una copia incompleta revierte la operación.
No reemplaza los jobs de cálculo ni la réplica de insumos Open-Meteo.

La migración usa `NOT VALID` para permitir reemplazar un vigente antiguo sin
alterar los históricos. Una vez publicado v0.4, validar la restricción:

```sql
ALTER TABLE infra_risk_run VALIDATE CONSTRAINT infra_risk_run_vigente_solo_v04;
```

## Consultas de verificación

```sql
-- 1. El vigente es v0.4 operativo y se publica cada 6 h.
SELECT id, modelo_version, modo, estado, iniciado_en, publicado_en, cobertura,
       metadatos->'degradacion' AS degradacion
FROM infra_risk_run
WHERE modo = 'operativo'
ORDER BY iniciado_en DESC
LIMIT 5;

-- 2. Universo sin cambios: mismas escuelas que el último vigente v0.3.
WITH v04 AS (SELECT id FROM infra_risk_run WHERE estado = 'vigente'),
     v03 AS (SELECT id FROM infra_risk_run
             WHERE modelo_version = 'motor-v0.3' AND estado = 'vencido'
             ORDER BY publicado_en DESC LIMIT 1)
SELECT
  (SELECT count(DISTINCT cue_anexo) FROM infra_risk_snapshot WHERE run_id IN (SELECT id FROM v04)) AS escuelas_v04,
  (SELECT count(DISTINCT cue_anexo) FROM infra_risk_snapshot WHERE run_id IN (SELECT id FROM v03)) AS escuelas_v03;

-- 3. Todas las filas del vigente tienen detalle v0.4.
SELECT count(*) AS filas, count(resultado_v04) AS con_detalle
FROM infra_risk_snapshot
WHERE run_id = (SELECT id FROM infra_risk_run WHERE estado = 'vigente');

-- 4. Distribución de niveles: v0.4 vigente contra el último v0.3.
SELECT r.modelo_version, s.horizonte_horas, s.nivel_riesgo, count(*)
FROM infra_risk_snapshot s JOIN infra_risk_run r ON r.id = s.run_id
WHERE r.id IN (
  (SELECT id FROM infra_risk_run WHERE estado = 'vigente'),
  (SELECT id FROM infra_risk_run WHERE modelo_version = 'motor-v0.3' AND estado = 'vencido'
   ORDER BY publicado_en DESC LIMIT 1))
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- 5. Frescura de los insumos INA.
SELECT provider, ultimo_exito_en, estado
FROM hazard_source_health
WHERE provider IN ('ina-a5', 'ina-a5-pronostico');
```
