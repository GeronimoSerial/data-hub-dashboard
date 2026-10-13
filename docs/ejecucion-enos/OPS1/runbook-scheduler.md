# Runbook — scheduler OPS1 (jobs de ingesta y derivados)

Batch OPS1 del plan de ejecución ENOS 2026/2027. Los jobs son los despachos de
`scripts/jobs.mjs` (`node scripts/jobs.mjs <nombre>`, dentro del contenedor de
la aplicación). El servidor Next NO ejecuta estos jobs. Quien los dispara
depende del entorno:

- **Producción:** tareas programadas de **Coolify** ("Scheduled Tasks") de la
  aplicación de producción. No usa systemd.
- **Staging:** **timers systemd** `enos-ops1-*` del host de staging, que invocan
  el wrapper `/usr/local/bin/enos-ops1-exec <nombre>`. El wrapper localiza el
  contenedor activo de Coolify por prefijo y ejecuta el job dentro de él.

Fuente de verdad de la lista de jobs y sus estados esperados:
`lib/infraestructura/riesgo/jobs-esperados.ts`. Ver "Sincronía con el código".

## Estado por entorno (al 2026-10-13)

| Entorno | Mecanismo | Jobs programados | Notas |
|---|---|---|---|
| Producción | Coolify Scheduled Tasks | 7 (tabla "Producción") | `sync-imerg` y ambas climatologías creadas el 2026-10-13. Flags: ver abajo. |
| Staging | Timers systemd `enos-ops1-*` | 4 activos; 3 deshabilitados (tabla "Staging") | Corre la app de staging contra la base de staging. |

Los seis jobs no programados en producción (`calcular-riesgo`,
`sync-pronostico-caudal`, `sync-ensemble`, `situacion-corte`,
`episodios-derivados`, `sync-seasonal`) se mantienen fuera del scheduler por
decisión hasta cerrar P-5 (I-6, I-7, G-3 e I-2). Figuran en
`jobs-esperados.ts` con `habilitado: false` y el estado `no_programado`.

## Producción (Coolify)

Tareas configuradas en Coolify sobre la aplicación de producción:

| Job (nombre de despacho) | Cron | Timeout | `infra_job_run.tipo` | Notas |
|---|---|---|---|---|
| sync-radar-ensemble | `55 3,9,15,21 * * *` | no registrado | `sync-radar-ensemble` | cada 6 h |
| sync-radar-meteo | `27 */3 * * *` | no registrado | `sync-radar-meteo` | cada 3 h |
| sync-smn-alertas | `7-59/15 * * * *` | no registrado | `sync-smn-alertas` | cada 15 min |
| verificar-radar-meteo | `30 11 * * *` | no registrado | — (no escribe `infra_job_run`) | diario; estado `sin_trazabilidad` |
| sync-imerg | `5 * * * *` | 300 s | `sync-hazard-imerg` | creado 2026-10-13 |
| climatologia-caudal | `41 6 1 * *` | 1200 s | `calcular-hazard-climatologia-caudal` | mensual, cursor resumable; creado 2026-10-13 |
| climatologia-precipitacion | `43 6 1 * *` | 1200 s | `calculo-climatologia` | mensual, cursor resumable; creado 2026-10-13 |

La zona horaria de las expresiones cron no está registrada en este runbook;
confirmarla en la configuración de Coolify antes de comparar con los horarios UTC
de staging.

Flags de la aplicación de producción: `RISK_RADAR_ENABLED`,
`RISK_ENGINE_ENABLED`, `HAZARD_CONTEXT_ENABLED`, `SITUACION_ENABLED` y
`SEASONAL_ENABLED` en `true`; `RISK_MODE=shadow`.

## Staging (systemd)

Unidades en `deploy/systemd/ops1/`. Estado en staging al 2026-10-13:

| Timer | Estado | Cadencia (`OnCalendar`, UTC) | Job |
|---|---|---|---|
| `enos-ops1-sync-radar-meteo.timer` | activo | `*-*-* 00/3:12:00` | sync-radar-meteo |
| `enos-ops1-sync-radar-ensemble.timer` | activo | `*-*-* 03,09,15,21:40:00` | sync-radar-ensemble |
| `enos-ops1-sync-smn-alertas.timer` | activo | `*:07/15` | sync-smn-alertas |
| `enos-ops1-verificar-radar-meteo.timer` | activo | `*-*-* 11:30:00` | verificar-radar-meteo |
| `enos-ops1-sync-imerg.timer` | deshabilitado | `*-*-* *:00:00` | sync-imerg (instalado por error; revertido) |
| `enos-ops1-climatologia-precipitacion.timer` | deshabilitado | `*-*-01 06:40:00` | climatologia-precipitacion (cuota Open-Meteo compartida con producción) |
| `enos-ops1-climatologia-caudal.timer` | deshabilitado | `*-*-01 06:40:00` | climatologia-caudal (cuota Open-Meteo compartida con producción) |

Los demás timers del repo (`calcular-riesgo`, `situacion-corte`,
`briefing-ia`, `episodios-derivados`, `geo-perfiles`, `asociacion-rio`,
`sync-pronostico-caudal`, `sync-ensemble`, `sync-seasonal`) no figuran como
activos en staging al 2026-10-13; su estado de instalación no está verificado.

Timeout: la plantilla `enos-ops1@.service` fija `TimeoutStartSec=600` para
todas las instancias. Los timers no lo sobreescriben.

Las cadencias de la tabla de arriba son las de las unidades del repo. Los
minutos de producción difieren (por ejemplo radar-meteo `:27` en Coolify y
`:12` en staging); la frecuencia es la misma.

## Verificación

**Producción (Coolify):** en la UI de Coolify, sección "Scheduled Tasks" de la
aplicación de producción, comparar nombre, cron y timeout con la tabla
"Producción". Si la versión de Coolify expone la misma lista por API, puede usarse
para la misma comparación; este runbook no documenta endpoints ni identificadores
de la aplicación.

**Staging (systemd):**

```bash
systemctl list-timers 'enos-ops1-*'
systemctl is-enabled enos-ops1-sync-imerg.timer    # esperado: disabled
systemd-analyze verify /etc/systemd/system/enos-ops1@.service
```

**Aplicación (ambos entornos):** `obtenerEstadoOperativo().jobsEsperados`
(`lib/infraestructura/riesgo/salud.ts`) evalúa cada job de `jobs-esperados.ts`
contra `infra_job_run`. Estados, con precedencia
`no_programado` / `sin_trazabilidad` > `sin_corridas` > `atrasado` > `fallando` > `ok`:

| Estado | Significado | Acción de operador |
|---|---|---|
| `ok` | última corrida dentro de la tolerancia (intervalo × 2) | ninguna |
| `sin_corridas` | job habilitado que nunca corrió | revisar la tarea/timer y su log |
| `atrasado` | última corrida (de cualquier estado) más vieja que intervalo × 2 | revisar el scheduler; si es climatología en cursor resumable, es esperado (ver más abajo) |
| `fallando` | la última corrida está `fallido`; muestra `errorSaneado` | revisar el log del job |
| `no_programado` | declarado pero deshabilitado (pendiente P-5) | ninguna; no es alarma |
| `sin_trazabilidad` | el job no escribe `infra_job_run` (hoy: `verificar-radar-meteo`) | verificar por otra vía (log/estado de fuente) |

Tras cambiar una tarea o un timer, confirmar en `/admin/operacion` que el batch
OPS1 refleja la corrida. Con `ENOS_JOBS_ENABLED=false` la columna "atrasado"
muestra "Desactivado por configuración".

## Sincronía con el código

Esta lista debe coincidir con `lib/infraestructura/riesgo/jobs-esperados.ts`:

- mismos nombres de despacho (`nombre`), validados contra `NOMBRES_VALIDOS` de `scripts/jobs.mjs`;
- `habilitado: true` ↔ job programado en producción (o explícitamente en staging);
- `intervaloMinutos` compatible con el cron o `OnCalendar` del job.

Un cambio en uno de los dos lados sin el otro es un defecto de documentación. El
campo `tipo` del código no coincide con el nombre de despacho para varios jobs
(por ejemplo `sync-imerg` escribe `sync-hazard-imerg`); usar la columna
`infra_job_run.tipo` de la tabla de producción al consultar el estado.

## Agregar o quitar un job

1. **Código:** agregar o editar la entrada en `jobs-esperados.ts` (`nombre`, `tipo`,
   `intervaloMinutos`, `habilitado`) y su prueba en `salud.test.ts`. Ver
   "Sincronía con el código".
2. **Producción:** crear o borrar la tarea en Coolify (nombre = nombre de despacho,
   cron, timeout). El comando debe ser el de las tareas existentes
   (`node scripts/jobs.mjs <nombre>`); confirmarlo contra una tarea ya creada antes
   de copiarlo.
3. **Staging:** copiar el timer `enos-ops1-<job>.timer` con `Unit=enos-ops1@<job>.service`
   a `/etc/systemd/system/`, `systemctl daemon-reload` y `systemctl enable --now enos-ops1-<job>.timer`.
   Para quitarlo: `systemctl disable --now enos-ops1-<job>.timer`, borrar el archivo y `daemon-reload`.
4. **Habilitar un job no programado** (`habilitado: false` → `true`): sólo después de cerrar
   P-5 y con decisión documentada en `odd/tasks/mejoras-deteccion-inundaciones.md`.
5. **Actualizar este runbook** en el mismo cambio y verificar `jobsEsperados` tras el despliegue.

## Variables de entorno

| Variable | Dónde vive | Default | Qué gobierna |
|---|---|---|---|
| `ENOS_JOBS_ENABLED` | entorno del CONTENEDOR (o `EnvironmentFile` del host en staging, ver abajo) | encendido si no está seteada (`!== 'false'`) | Único interruptor de los jobs de `scripts/jobs.mjs`. En `false`, cada job responde `{"ejecutado":false,"motivo":"flag_deshabilitado"}`, exit `0`, y el runner imprime un `WARN` a stderr con el nombre del job saltado. |
| `RISK_ENGINE_ENABLED` | entorno del CONTENEDOR | apagado | Gobierna **sólo** la UI `/admin/riesgo`. NO afecta si los jobs corren (ver `lib/infraestructura/jobs/flags.ts`). |
| `EPISODIOS_DERIVADOS_ENABLED` | entorno del CONTENEDOR | apagado | Gobierna **sólo** la UI `/admin/episodios-derivados`. NO afecta si el job corre. |
| `EARTHDATA_TOKEN` | entorno del CONTENEDOR | sin default | Token de NASA Earthdata para `sync-imerg`. Sin él, el job marca `nasa-imerg` como `no_disponible` en `hazard_source_health` y sale con `0`. Ver "Renovación de la credencial de Earthdata". |

Todas estas variables son del entorno del **contenedor de la aplicación**, se
setean según el mecanismo de despliegue (Coolify), **nunca** se commitean ni se
loguean.

### Pausa desde el host (sólo staging, `EnvironmentFile`)

`deploy/systemd/ops1/enos-ops1@.service` declara
`EnvironmentFile=-/etc/enos-ops1/enos-ops1.env` y reenvía `ENOS_JOBS_ENABLED` al
contenedor con `docker exec -e`. Permite pausar desde el host sin redeploy:

```bash
sudo install -d -m 700 /etc/enos-ops1
sudo tee /etc/enos-ops1/enos-ops1.env >/dev/null <<'EOF'
ENOS_JOBS_ENABLED=false
EOF
sudo chmod 600 /etc/enos-ops1/enos-ops1.env
sudo chown root:root /etc/enos-ops1/enos-ops1.env
```

- Permisos `600`, dueño root (ninguna unidad declara `User=`).
- Para reanudar: borrar la línea o el archivo; cada disparo relee el archivo antes de `ExecStart`.
- No sirve para `EARTHDATA_TOKEN`, `RISK_ENGINE_ENABLED` ni `EPISODIOS_DERIVADOS_ENABLED`.

**Producción:** no usa este archivo. Pausar con `ENOS_JOBS_ENABLED=false` en el
entorno del contenedor o deshabilitando la tarea en Coolify.

## Códigos de salida

`scripts/jobs.mjs` sigue el contrato de `scripts/job-diagnostico.mjs`, más un código propio:

- **`0`** — corrió y publicó, **o** no hizo nada porque el job ya estaba `completado`, tenía un lease vigente, o `ENOS_JOBS_ENABLED=false`. Si el motivo fue el flag, revisar el `WARN` (¿pausa deliberada o apagado por error?).
- **`1`** — excepción no manejada (fallo real). Revisar el log del scheduler (Coolify o `journalctl -u enos-ops1@<nombre>.service` en staging).
- **`2`** — nombre de job desconocido. Error de la tarea o unidad (nombre mal escrito), no del job.
- **`3`** — el job perdió el lease antes de publicar: otro proceso lo recuperó por vencimiento. Tratarlo como problema de **scheduling/solapamiento**. Causa típica: intervalo menor a la duración del lease o del job.

## Climatologías: timers mensuales con cursor resumable (OM-cupo)

`climatologia-precipitacion` (ERA5, ~387 celdas × 30 años) y `climatologia-caudal`
(GloFAS, 8 `PUNTOS_RIO` fijos × ~10 años) corren mensualmente y avanzan un cursor
resumable en tandas; el cálculo completo excede el cupo mensual de Open-Meteo en
una sola corrida (ver `docs/ejecucion-enos/OM-cupo/registro.md`). Nunca recomputan
una celda ya persistida en `hazard_climatology` para el mismo período y versión
(ver "CURSOR RESUMABLE" en `lib/infraestructura/riesgo/jobs/calcular-climatologia.ts`).

Mientras queden celdas pendientes el job termina `fallido` A PROPÓSITO, para que el
lease permita reanudar en la próxima ejecución. Es esperado, no un incidente. El
avance real (celdas completas / total) se ve en `/admin/operacion`, no en "atrasado".
Completadas ambas, el timer sigue corriendo sin gastar cupo.

La de precipitación requiere unas ~48.500 llamadas contra `archive-api`; puede tardar varios meses. La de caudal usa `flood-api` (8 puntos), con volumen mucho menor.

## Secuencia entre jobs distintos (sin cola/orquestador)

No hay Redis ni colas en este repo. La única garantía de orden entre jobs distintos
es el offset fijo de las unidades y el lease de `job-run.ts` (impide que un mismo
job se pise a sí mismo, no ordena jobs distintos). Los offsets de `calcular-riesgo`
(`:15` tras los syncs de 6 h), `situacion-corte` (`*:20`) y `briefing-ia` (`*:30`) están
definidos en las unidades del repo, que hoy no están activas en staging ni
programadas en producción: al habilitarlos, la secuencia se revalida en el mismo cambio.

- `calcular-riesgo` no espera a `sync-imerg` (cadencia horaria independiente): puede usar IMERG de hasta ~1 h de antigüedad.
- `episodios-derivados` y `sync-imerg` comparten `:00` sin offset: `episodios-derivados` puede usar IMERG de la hora anterior. Bajo riesgo: se corrige en la corrida siguiente.
- `briefing-ia` lee el corte de `situacion-corte`; si ese timer se atrasa, puede leer un corte de la hora previa o devolver `sin_corte_disponible`.

La UI del Centro de Situación (E5) marca el corte como "desactualizado" con
`estaAtrasado`/`estadoAtrasoJob` de `lib/infraestructura/riesgo/cadencias.ts`.

## Credenciales de red por job

- `sync-imerg` requiere `EARTHDATA_TOKEN`; sin esa variable se registra como fuente no disponible.
- `sync-pronostico-caudal`, `sync-ensemble`, `sync-seasonal`, `sync-radar-meteo`, `sync-radar-ensemble` y ambas climatologías consultan Open-Meteo; `OPEN_METEO_API_KEY` habilita cuota paga si corresponde.
- `sync-smn-alertas` consulta el feed CAP oficial del SMN; no consume cupo Open-Meteo.
- `briefing-ia` requiere `OPENROUTER_API_KEY`.
- `geo-perfiles`, `asociacion-rio`, `calcular-riesgo`, `episodios-derivados` y `situacion-corte` son derivados locales; no requieren credenciales de red.

## Renovación de la credencial de Earthdata (vence 2026-11-26)

`sync-imerg` usa `EARTHDATA_TOKEN` para autenticar contra NASA CMR/OPeNDAP. Antes del vencimiento:

1. Generar una credencial nueva en https://urs.earthdata.nasa.gov/ (perfil > Generate Token).
2. Actualizar la variable del contenedor según el mecanismo de despliegue, **sin loguear ni commitear el valor**.
3. Reiniciar el contenedor para que tome el nuevo valor.

Sin credencial válida, `sync-imerg` no rompe: registra la fuente como no disponible en
`hazard_source_health` y sale con `0`. Tras la renovación, verificar en
`/admin/operacion` que la fuente IMERG vuelve a `ok` en la corrida siguiente.

## Alertas operativas mínimas

La única señal de alerta es **visual**, en `/admin/operacion`: la columna "atrasado"
del batch OPS1 (con su variante "Desactivado por configuración") y el estado de
fuentes, más el estado `jobsEsperados` descrito en "Verificación". No se agrega
ningún canal nuevo (sin Slack, email ni webhook), por alcance de OPS1.

## Logs

```bash
journalctl -u enos-ops1@<nombre>.service               # staging, ej. sync-radar-meteo
journalctl -u 'enos-ops1@*.service' --since "1 hour ago"
```

En producción, los logs se consultan en la ejecución de la tarea en Coolify. Un
`WARN` con `ENOS_JOBS_ENABLED=false` indica un disparo que fue no-op por el flag, no una falla.

## Pausa y reanudación

- **Pausar un job puntual (staging):** `systemctl disable --now enos-ops1-<nombre>.timer`. Reanudar: `systemctl enable --now enos-ops1-<nombre>.timer`.
- **Pausar un job puntual (producción):** deshabilitar la tarea en Coolify; reanudar habilitándola.
- **Pausar todos los jobs:** `ENOS_JOBS_ENABLED=false` en el contenedor (o el `EnvironmentFile` en staging). Los disparos siguen y cada uno es un no-op con exit `0`.
- **Ejecución manual puntual (staging):** `sudo systemctl start enos-ops1@<nombre>.service`.

## Radar de pronóstico (staging)

Coolify cambia el sufijo del nombre del contenedor en cada deploy. El wrapper
consulta en cada ejecución los contenedores activos cuyo nombre empieza con el
prefijo configurado y continúa sólo si encuentra exactamente uno. Durante un deploy,
cero coincidencias produce error y la siguiente activación lo reintenta.

Instalación en el host de staging (los valores reales van en el host, no en este documento):

```bash
sudo install -d -m 700 /etc/enos-ops1
sudo install -m 755 deploy/systemd/ops1/enos-ops1-exec.sh /usr/local/bin/enos-ops1-exec
sudo install -m 644 deploy/systemd/ops1/enos-ops1@.service /etc/systemd/system/
sudo install -m 644 deploy/systemd/ops1/enos-ops1-sync-radar-meteo.timer /etc/systemd/system/
sudo install -m 644 deploy/systemd/ops1/enos-ops1-sync-smn-alertas.timer /etc/systemd/system/
sudo install -m 644 deploy/systemd/ops1/enos-ops1-sync-radar-ensemble.timer /etc/systemd/system/
sudo install -m 644 deploy/systemd/ops1/enos-ops1-verificar-radar-meteo.timer /etc/systemd/system/
# Crear /etc/enos-ops1/enos-ops1.env con CONTENEDOR_PREFIJO=<prefijo-del-contenedor> y modo 600, dueño root.
sudo systemctl daemon-reload
sudo systemctl enable --now enos-ops1-sync-radar-meteo.timer enos-ops1-sync-smn-alertas.timer
sudo systemctl enable --now enos-ops1-sync-radar-ensemble.timer enos-ops1-verificar-radar-meteo.timer
```

Los timers de climatología y `sync-imerg` no se habilitan en staging (ver "Estado por entorno").
`sync-radar-ensemble` tiene tope independiente de 600 de peso y cuatro requests
diarias; `RADAR_ENSEMBLE_ENABLED` está encendido salvo que valga exactamente `false`.

Verificar: `systemctl list-timers 'enos-ops1-*'` y `journalctl -u enos-ops1@sync-radar-meteo.service`.
Ejecución manual: `sudo systemctl start enos-ops1@sync-radar-meteo.service`.

## Tabla de cadencias de referencia (unidades del repo)

Referencia de `OnCalendar` en UTC de las unidades de `deploy/systemd/ops1/`. Para producción usar la tabla de Coolify.

| job | cadencia | `OnCalendar` (UTC) | archivo |
|---|---|---|---|
| sync-radar-meteo | 3h | `*-*-* 00/3:12:00` | `enos-ops1-sync-radar-meteo.timer` |
| verificar-radar-meteo | diario | `*-*-* 11:30:00` | `enos-ops1-verificar-radar-meteo.timer` |
| sync-smn-alertas | 15 min | `*:07/15` | `enos-ops1-sync-smn-alertas.timer` |
| sync-radar-ensemble | 6h | `*-*-* 03,09,15,21:40:00` | `enos-ops1-sync-radar-ensemble.timer` |
| sync-pronostico-caudal | 6h | `*-*-* 08,14,20,02:00:00` | `enos-ops1-sync-pronostico-caudal.timer` |
| sync-ensemble | 6h | `*-*-* 08,14,20,02:00:00` | `enos-ops1-sync-ensemble.timer` |
| sync-imerg | 1h | `*-*-* *:00:00` | `enos-ops1-sync-imerg.timer` |
| calcular-riesgo | 6h, offset +15 min | `*-*-* 08,14,20,02:15:00` | `enos-ops1-calcular-riesgo.timer` |
| episodios-derivados | 1h | `*-*-* *:00:00` | `enos-ops1-episodios-derivados.timer` |
| geo-perfiles | diario | `*-*-* 03:00:00` | `enos-ops1-geo-perfiles.timer` |
| asociacion-rio | diario | `*-*-* 03:10:00` | `enos-ops1-asociacion-rio.timer` |
| briefing-ia | cada hora | `*-*-* *:30:00` | `enos-ops1-briefing-ia.timer` |
| situacion-corte | 1h | `*-*-* *:20:00` | `enos-ops1-situacion-corte.timer` |
| climatologia-precipitacion | mensual, cursor resumable | `*-*-01 06:40:00` | `enos-ops1-climatologia-precipitacion.timer` |
| climatologia-caudal | mensual, cursor resumable | `*-*-01 06:40:00` | `enos-ops1-climatologia-caudal.timer` |
| sync-seasonal | diario (opcional) | `*-*-* 09:00:00` | `enos-ops1-sync-seasonal.timer` |

Opcional: `sync-seasonal` (Open-Meteo Seasonal) está detrás de `SEASONAL_ENABLED`
en la UI; el job corre igual, sólo se oculta la tarjeta.
