# Runbook — scheduler OPS1 (jobs de ingesta y derivados)

Batch OPS1 del plan de ejecución ENOS 2026/2027. Extiende el precedente
documentado en `docs/ejecucion-enos/E0/scheduler.md`: los jobs corren como
**timers systemd del HOST** (no cron embebido, no worker residente), que
invocan un wrapper del host que resuelve el contenedor activo de Coolify por prefijo y ejecuta `docker exec ... node scripts/jobs.mjs <nombre>` dentro de él. El servidor Next NO ejecuta estos jobs.

**Corrección del gate N1 (ver `docs/ejecucion-enos/OPS1/registro.md`,
sección "Correcciones del gate N1"):** las dos secciones siguientes cambiaron
respecto de la primera versión de este runbook:

- El runner ya NO gatea la ejecución de los 12 jobs con `RISK_ENGINE_ENABLED`
  ni `EPISODIOS_DERIVADOS_ENABLED` (esos son flags de **UI**, ver "Variables
  de entorno" abajo). Ahora usa un flag propio, `ENOS_JOBS_ENABLED`, con
  default **encendido**.
- Los timers dejaron de ser una sola plantilla `enos-ops1@.timer` con
  drop-ins de `systemctl edit` por instancia. Ahora hay un archivo `.timer`
  explícito por job programado, cada uno con su propio `OnCalendar` en UTC
  fijado en el repo (más fácil de auditar y de revisar en un diff que un
  drop-in generado en el host).

## Variables de entorno

| Variable | Dónde vive | Default | Qué gobierna |
|---|---|---|---|
| `ENOS_JOBS_ENABLED` | entorno del CONTENEDOR (o, opcionalmente, `EnvironmentFile` del host — ver abajo) | encendido si no está seteada (`!== 'false'`) | Único interruptor de los 12 jobs de `scripts/jobs.mjs`. En `false`, ningún job corre: cada uno responde `{"ejecutado":false,"motivo":"flag_deshabilitado"}`, exit `0`, y el runner imprime un `WARN` a stderr (visible en `journalctl`) con el nombre del job saltado. |
| `RISK_ENGINE_ENABLED` | entorno del CONTENEDOR | apagado | Gobierna **sólo** la UI `/admin/riesgo` (lista y detalle del motor de riesgo v0). NO afecta si los jobs corren — ver `lib/infraestructura/jobs/flags.ts` para el porqué de la separación. |
| `EPISODIOS_DERIVADOS_ENABLED` | entorno del CONTENEDOR | apagado | Gobierna **sólo** la UI de sólo lectura `/admin/episodios-derivados`. NO afecta si el job `episodios-derivados` corre. |
| `EARTHDATA_TOKEN` | entorno del CONTENEDOR | sin default | Token de NASA Earthdata para `sync-imerg`. Sin él, el job no rompe: marca `nasa-imerg` como `no_disponible` en `hazard_source_health` y sale con `0`. Ver "Renovación del token" abajo. |

**Todas** estas variables son del entorno del **contenedor de la aplicación**
(las lee el proceso Next/Node vía `process.env`, dentro de `scripts/jobs.mjs`
o los módulos de flags), no del host ni de los units de systemd. Se setean
según el mecanismo de despliegue del host (Dokploy/Coolify/`docker-compose`,
etc.), **nunca** commiteadas ni logueadas.

### Interruptor de pausa opcional desde el HOST (`EnvironmentFile`)

`deploy/systemd/ops1/enos-ops1@.service` declara
`EnvironmentFile=-/etc/enos-ops1/enos-ops1.env` (el `-` inicial hace que el
unit no falle si el archivo no existe) y reenvía esa variable al contenedor
con `docker exec -e ENOS_JOBS_ENABLED`. Esto da un mecanismo de pausa
**desde el host**, sin tocar el entorno del contenedor ni redeployar, útil
para un incidente o mantenimiento:

```bash
sudo install -d -m 700 /etc/enos-ops1
sudo tee /etc/enos-ops1/enos-ops1.env >/dev/null <<'EOF'
ENOS_JOBS_ENABLED=false
EOF
sudo chmod 600 /etc/enos-ops1/enos-ops1.env
sudo chown root:root /etc/enos-ops1/enos-ops1.env
```

- **Permisos: `600`, dueño el usuario que corre el unit** (root por defecto,
  ya que ninguna unidad de este batch declara `User=`). El archivo no
  contiene secretos por sí mismo en el caso de `ENOS_JOBS_ENABLED`, pero se
  trata con la misma disciplina que cualquier archivo de entorno leído por
  systemd.
- Si el archivo no existe o no define `ENOS_JOBS_ENABLED`, `docker exec -e
  ENOS_JOBS_ENABLED` no sobreescribe nada y el contenedor usa su propio
  valor (default encendido).
- Para reanudar: borrar la línea (o el archivo) y no hace falta reiniciar
  nada — cada disparo del timer relee el archivo antes de correr `ExecStart`.
- Este archivo **no** es el lugar para `EARTHDATA_TOKEN` ni para
  `RISK_ENGINE_ENABLED`/`EPISODIOS_DERIVADOS_ENABLED`: esas siguen siendo
  variables del contenedor, no del host.

## Instalación

Unidades del repo, en `deploy/systemd/ops1/`:

- `enos-ops1@.service` — plantilla instanciada (`%i` = nombre del job),
  única para los 12 jobs. `ExecStart` corre
  `/usr/local/bin/enos-ops1-exec %i`.
- Un `.timer` explícito **por job programado** (no una plantilla): cada uno
  fija `Unit=enos-ops1@<job>.service` y su propio `OnCalendar` en UTC. Los
  dos jobs de climatología tienen timers mensuales resumables (ver tabla).

Pasos generales de instalación (la sección «Radar de pronóstico» detalla el
conjunto mínimo recomendado):

1. Copiar el wrapper como `/usr/local/bin/enos-ops1-exec`, instalar la plantilla
   `enos-ops1@.service` y los timers elegidos en `/etc/systemd/system/`.
2. Crear `/etc/enos-ops1/enos-ops1.env` con `CONTENEDOR_PREFIJO=<uuid-app>-`
   (el UUID de Coolify seguido de guion) y, opcionalmente,
   `ENOS_JOBS_ENABLED=false` para pausar. Protegerlo con modo `600`.
3. Ejecutar `systemctl daemon-reload` y habilitar los timers necesarios.

`sync-seasonal` es una capa OPCIONAL (Open-Meteo Seasonal, tendencia ENOS a
30-90 días, detrás del flag `SEASONAL_ENABLED` de UI — ver
docs/ejecucion-enos/SEASONAL/registro.md). El job corre igual con el flag de
UI apagado (el flag sólo oculta la tarjeta en el mapa); habilitar este timer
es opcional y depende de si se decide activar esa capa en el ambiente.

### Climatologías: timers mensuales con cursor resumable (OM-cupo)

`climatologia-precipitacion` (ERA5, ~387 celdas × 30 años) y
`climatologia-caudal` (GloFAS, 8 `PUNTOS_RIO` fijos × ~10 años) ya NO son
puramente "bajo demanda": el cálculo completo de precipitación por sí solo
excede el cupo MENSUAL de Open-Meteo en una sola corrida (ver
docs/ejecucion-enos/OM-cupo/registro.md, "Climatología de precipitación"), así
que corren en timers MENSUALES de baja carga que avanzan el cursor resumable en
tandas y conservan el progreso entre ejecuciones — nunca recomputa una celda ya persistida en
`hazard_climatology` para el mismo período+version (ver el comentario "CURSOR
RESUMABLE" en `lib/infraestructura/riesgo/jobs/calcular-climatologia.ts`).
Mientras queden celdas pendientes el job termina 'fallido' A PROPÓSITO en
`infra_job_run` (para que el lease permita reanudar en la próxima ejecución
mensual sin bloquearse) — esto es esperado y NO es un incidente; el avance real (celdas
completas / total) se ve en `/admin/operacion`, no en la columna "atrasado".

La climatología de precipitación requiere unas ~48.500 llamadas ponderadas
contra `archive-api` (~387 celdas × 30 años); con una ejecución mensual puede
requerir varios meses hasta completar todas las celdas. La de caudal usa
`flood-api` (8 puntos) y tiene un volumen mucho menor. El cursor conserva el
avance entre ejecuciones mensuales.
Una vez que ambas quedan completas (100% en `/admin/operacion`), cada timer
sigue corriendo mensualmente pero no gasta cupo (el cursor resumable no
encuentra celdas pendientes).

Ambas corren el día 1 de cada mes a las 06:40 UTC (03:40 en Argentina), en
horario de baja carga. El cursor permite reanudar en corridas mensuales; en el
plan gratuito, el radar de pronóstico tiene prioridad sobre el uso de cuota de
las climatologías.

## Tabla de cadencias por job

| job | cadencia | `OnCalendar` (UTC) | archivo | motivo |
|---|---|---|---|---|
| sync-radar-meteo | 3h | `*-*-* 00/3:12:00 UTC` | `enos-ops1-sync-radar-meteo.timer` | radar de pronóstico; frecuencia acordada y prioridad de cuota en plan gratuito |
| sync-pronostico-caudal | 6h | `*-*-* 08,14,20,02:00:00 UTC` | `enos-ops1-sync-pronostico-caudal.timer` | corridas ECMWF 00/06/12/18 UTC + ~8h de margen (6h de latencia habitual de disponibilidad real-time + 2h adicionales documentados por Open-Meteo para su distribución open-data; ajustar si se confirma otro valor) |
| sync-ensemble | 6h | `*-*-* 08,14,20,02:00:00 UTC` | `enos-ops1-sync-ensemble.timer` | mismo motivo que arriba (Open-Meteo Ensemble) |
| sync-imerg | 1h | `*-*-* *:00:00 UTC` | `enos-ops1-sync-imerg.timer` | Early Run IMERG, ~4h de latencia propia de la fuente; backfill acotado ya cubre huecos |
| calcular-riesgo | 6h, encadenado por offset | `*-*-* 08,14,20,02:15:00 UTC` (offset +15min sobre los syncs de 6h) | `enos-ops1-calcular-riesgo.timer` | corre DESPUÉS de sync-pronostico-caudal/sync-ensemble; el offset de 15min evita la carrera; el lease además impide solapes |
| episodios-derivados | 1h | `*-*-* *:00:00 UTC` | `enos-ops1-episodios-derivados.timer` | recomputo barato, sin llamadas externas |
| geo-perfiles | diario | `*-*-* 03:00:00 UTC` | `enos-ops1-geo-perfiles.timer` | recompute barato de perfiles geográficos, sin llamadas externas; horario de baja carga |
| asociacion-rio | diario | `*-*-* 03:10:00 UTC` | `enos-ops1-asociacion-rio.timer` | calcula asociaciones de ríos después de geo-perfiles (03:00 UTC) |
| briefing-ia | cada hora | `*-*-* *:30:00 UTC` | `enos-ops1-briefing-ia.timer` | corre diez minutos después de situacion-corte; requiere `OPENROUTER_API_KEY` para generar contenido |
| situacion-corte | 1h, alineado tras calcular-riesgo | `*-*-* *:20:00 UTC` | `enos-ops1-situacion-corte.timer` | corre poco después de calcular-riesgo (`:15` en 08,14,20,02 UTC) para que el corte del Centro de Situación (E5) refleje el riesgo recién calculado lo antes posible; en las demás horas corre con su propia cadencia horaria |
| climatologia-precipitacion | mensual, cursor resumable de cupo | `*-*-01 06:40:00 UTC` | `enos-ops1-climatologia-precipitacion.timer` | el cálculo completo (~387 celdas × 30 años) excede el cupo mensual en una sola corrida; el timer mensual avanza el cursor resumable y conserva el progreso, sin recomputar celdas ya persistidas |
| climatologia-caudal | mensual, cursor resumable de cupo | `*-*-01 06:40:00 UTC` | `enos-ops1-climatologia-caudal.timer` | misma estrategia resumable, otra fuente (GloFAS, 8 `PUNTOS_RIO` fijos) |
| sync-seasonal | diario (opcional) | `*-*-* 09:00:00 UTC` | `enos-ops1-sync-seasonal.timer` | Open-Meteo Seasonal (EC46+SEAS5): EC46 actualiza a diario (20:30Z), SEAS5 mensual; una corrida diaria alcanza. Capa opcional detrás de `SEASONAL_ENABLED` (UI); el job corre igual, sólo la tarjeta queda oculta con el flag apagado |

### Caveat de secuencia entre jobs distintos (sin cola/orquestador)

No hay Redis ni colas en este repo (fuera de alcance de OPS1): la única
garantía de orden entre jobs distintos es el offset fijo de
`calcular-riesgo` respecto de los sync de 6h, más el lease de
`job-run.ts` (impide que un mismo job se pise a sí mismo, no ordena jobs
distintos entre sí). Efectos concretos a tener en cuenta:

- `calcular-riesgo` corre a `:15` sobre la ventana de 6h de
  `sync-pronostico-caudal`/`sync-ensemble`, pero **no** espera a `sync-imerg`
  (cadencia horaria, independiente): puede calcular riesgo con datos de IMERG
  de hasta ~1h de antigüedad. Esto es una decisión de producto que E5 resolvió
  con su propio job/timer: `situacion-corte` corre cada hora a
  `*:20:00 UTC` (offset de +5min sobre `calcular-riesgo` cuando coinciden en
  08,14,20,02), para que el corte del Centro de Situación refleje el riesgo
  recién calculado lo antes posible. Sigue siendo un **offset fijo sin
  cola/orquestador**, con el mismo caveat que `calcular-riesgo`: si el timer de
  `calcular-riesgo` se atrasa, el corte puede reflejar datos de hasta ~1h de
  antigüedad.
- `episodios-derivados` y `sync-imerg` comparten cadencia horaria en `:00`
  pero no hay offset entre ambos: `episodios-derivados` puede correr con
  datos de IMERG de la hora anterior si el orden de disparo dentro del mismo
  minuto no favorece a `sync-imerg`. Bajo riesgo (recompute barato, se
  corrige solo en la corrida siguiente), pero documentado para no
  sorprenderse si aparece en el panel.

Consumidor del `situacion-corte`: la UI del Centro de Situación (E5) muestra
cuándo se generó el corte y lo marca "desactualizado" reusando
`estaAtrasado`/`estadoAtrasoJob` de `lib/infraestructura/riesgo/cadencias.ts`
con `nombre: 'situacion-corte'` (el mismo mecanismo que ya usa
`/admin/operacion` para los demás jobs).

## Variante Docker — cómo se invoca el runner dentro del contenedor

El timer vive en el **HOST**, no dentro del contenedor. Lo que dispara es
`/usr/local/bin/enos-ops1-exec <nombre>`; el wrapper localiza el contenedor
activo a partir de `CONTENEDOR_PREFIJO` y reenvía `ENOS_JOBS_ENABLED`.
El contenedor ya tiene `scripts/jobs.mjs` empaquetado en la imagen (igual que
`scripts/job-diagnostico.mjs`, copiado por el `Dockerfile`), así que no hace
falta montarlo ni instalarlo aparte.

### Credenciales de red por job

- `sync-imerg` requiere `EARTHDATA_TOKEN` para NASA; sin token se registra como fuente no disponible.
- `sync-pronostico-caudal`, `sync-ensemble`, `sync-seasonal` y ambos jobs de climatología consultan Open-Meteo; `OPEN_METEO_API_KEY` habilita cuota paga si corresponde, mientras las cuotas gratuitas pueden operar sin clave.
- `briefing-ia` requiere `OPENROUTER_API_KEY` para llamadas al proveedor OpenRouter.
- `geo-perfiles`, `asociacion-rio`, `calcular-riesgo`, `episodios-derivados` y `situacion-corte` son derivados locales y no requieren credenciales de proveedor de red.

## Códigos de salida

`scripts/jobs.mjs` sigue el mismo contrato de exit codes que
`scripts/job-diagnostico.mjs`, más un código propio:

- **`0`** — corrió y publicó el resultado, **o** no hizo nada porque el job ya
  estaba `completado`, con un lease vigente en progreso, o porque
  `ENOS_JOBS_ENABLED=false` (idempotencia/gating normal, no es un error).
  Operador: nada especial, salvo revisar el `WARN` en el log si el motivo fue
  el flag (¿pausa deliberada o alguien lo apagó por error?).
- **`1`** — excepción no manejada dentro del job (fallo real). Operador:
  investigar como falla, revisando `journalctl -u enos-ops1@<nombre>.service`.
- **`2`** — nombre de job desconocido. No debería pasar nunca en producción si
  las unidades están bien armadas; si aparece, es un error de la unidad
  (instancia mal escrita), no del job.
- **`3`** — el job corrió pero perdió el lease antes de publicar el resultado:
  otro proceso lo recuperó por vencimiento mientras corría. Tratarlo como
  problema de **scheduling/solapamiento**, no como falla del job. Causa típica:
  el timer dispara con un intervalo menor a la duración del lease o del propio
  job.

## Verificación

```bash
systemctl list-timers 'enos-ops1-*'
systemctl start enos-ops1@geo-perfiles.service   # ejecución manual inmediata
systemd-analyze verify /etc/systemd/system/enos-ops1@.service
systemd-analyze verify /etc/systemd/system/enos-ops1-sync-pronostico-caudal.timer
systemd-analyze verify /etc/systemd/system/enos-ops1-sync-ensemble.timer
systemd-analyze verify /etc/systemd/system/enos-ops1-sync-imerg.timer
systemd-analyze verify /etc/systemd/system/enos-ops1-calcular-riesgo.timer
systemd-analyze verify /etc/systemd/system/enos-ops1-episodios-derivados.timer
systemd-analyze verify /etc/systemd/system/enos-ops1-geo-perfiles.timer
systemd-analyze verify /etc/systemd/system/enos-ops1-situacion-corte.timer
```

Tras `systemctl start`, revisar `/admin/operacion` (requiere sesión con rol
`admin` o `editor`) para confirmar que el batch OPS1 refleja la corrida. Con
`ENOS_JOBS_ENABLED=false`, la columna "atrasado" muestra explícitamente
"Desactivado por configuración" en vez de "atrasado" — es una señal de pausa
deliberada, no de incidente.

Sobre `systemd-analyze verify`: el `.service` sigue siendo una plantilla
instanciada (`@`) y no acepta verificación sin una instancia concreta, así
que se valida copiando la plantilla a un nombre de instancia de prueba (p.
ej. `enos-ops1@geo-perfiles.service`) y corriendo `systemd-analyze verify`
sobre esa copia. Los `.timer` explícitos ya no son plantillas y se verifican
directamente contra su ruta real. Verificar la plantilla y los 12 timers explícitos
del repo antes de instalarlos.

## Logs

```bash
journalctl -u enos-ops1@<nombre>.service            # ej. sync-imerg
journalctl -u 'enos-ops1@*.service' --since "1 hour ago"
```

El segundo comando muestra todos los jobs recientes juntos. Un `WARN` con
`ENOS_JOBS_ENABLED=false` en la línea indica que ese disparo fue un no-op por
el flag, no una falla.

## Pausa y reanudación

Dos mecanismos independientes, elegir el que corresponda:

- **Pausar un job puntual sin afectar a los demás:**
  `systemctl disable --now enos-ops1-<nombre>.timer` (no toca el `.service`,
  sólo detiene el disparo periódico). Reanudar:
  `systemctl enable --now enos-ops1-<nombre>.timer`.
- **Pausar los 12 jobs a la vez sin tocar systemd:** setear
  `ENOS_JOBS_ENABLED=false` (ver "Interruptor de pausa opcional desde el
  HOST" arriba, o directamente en el entorno del contenedor). Los timers
  siguen disparando en su horario, pero cada corrida es un no-op con exit
  `0` y un `WARN` en el log.
- **Ejecución manual puntual sin afectar el timer:**
  `systemctl start enos-ops1@<nombre>.service`.

## Renovación del token de Earthdata (vence 2026-11-26)

El job `sync-imerg` usa `EARTHDATA_TOKEN` (variable de entorno del contenedor)
para autenticar contra NASA CMR/OPeNDAP.

El token vigente vence el **2026-11-26**. Antes de esa fecha:

1. Generar un token nuevo en https://urs.earthdata.nasa.gov/ (perfil >
   Generate Token).
2. Actualizar la variable de entorno del contenedor según el mecanismo de
   despliegue del host, **sin loguear ni commitear el valor nunca**.
3. Reiniciar el contenedor para que tome el nuevo valor.

Sin token válido, `sync-imerg` no debe romper: el job registra la fuente como
no configurada/degradada en `hazard_source_health` y sale con código `0`
(no-op), no con error. Verificar esto en `/admin/operacion` tras la renovación
(la fuente IMERG debe volver a estado `ok` en la corrida siguiente).

## Alertas operativas mínimas (sin canales nuevos)

La única señal de alerta hoy es **visual**, en `/admin/operacion`: la columna
"atrasado" del batch OPS1 (con su variante "Desactivado por configuración"
cuando `ENOS_JOBS_ENABLED=false`) y el estado de fuentes. La revisa el
operador que ya usa ese panel.

No se agrega ningún canal nuevo (sin Slack, sin email, sin webhook) porque está
fuera de alcance de este batch: principio rector `sin Redis/colas/frameworks
nuevos`, y sin operación manual nueva más allá de revisar un panel que ya
existe.


## Radar de pronóstico

El timer `sync-radar-meteo` corre cada tres horas a los :12 UTC. Coolify cambia
el sufijo del nombre del contenedor en cada deploy; el wrapper consulta en cada
ejecución los contenedores activos cuyo nombre empieza con el UUID de la app y
continúa sólo si encuentra exactamente uno. Durante un deploy, cero coincidencias
producen error y la siguiente activación vuelve a intentarlo.

Instalación en el host (ejemplo para staging; usar el UUID correspondiente):

```bash
sudo install -d -m 700 /etc/enos-ops1
sudo install -m 755 deploy/systemd/ops1/enos-ops1-exec.sh /usr/local/bin/enos-ops1-exec
sudo install -m 644 deploy/systemd/ops1/enos-ops1@.service /etc/systemd/system/
sudo install -m 644 deploy/systemd/ops1/enos-ops1-sync-radar-meteo.timer /etc/systemd/system/
sudo install -m 644 deploy/systemd/ops1/enos-ops1-climatologia-precipitacion.timer /etc/systemd/system/
sudo install -m 644 deploy/systemd/ops1/enos-ops1-climatologia-caudal.timer /etc/systemd/system/
sudo sh -c 'printf "%s\n" "CONTENEDOR_PREFIJO=<coolify-app-uuid>-" > /etc/enos-ops1/enos-ops1.env'
sudo chmod 600 /etc/enos-ops1/enos-ops1.env
sudo chown root:root /etc/enos-ops1/enos-ops1.env
sudo systemctl daemon-reload
sudo systemctl enable --now enos-ops1-sync-radar-meteo.timer
sudo systemctl enable --now enos-ops1-climatologia-precipitacion.timer enos-ops1-climatologia-caudal.timer
```

Si el radar meteorológico debe tener prioridad en el plan gratuito, habilitar como
mínimo `sync-radar-meteo` y las dos climatologías mensuales. Los demás timers son
opcionales según las capas que se quieran mantener activas; considerar su costo
de cuota antes de habilitarlos. La corrida del radar consume el cupo compartido
de Open-Meteo.

Verificar programación y logs con:

```bash
systemctl list-timers 'enos-ops1-*'
journalctl -u enos-ops1@sync-radar-meteo.service
```

Para ejecutarlo una vez a mano: `sudo systemctl start
enos-ops1@sync-radar-meteo.service`.

Staging y producción comparten el host. Para activar un segundo ambiente, crear
una copia de la plantilla de servicio con otro nombre (por ejemplo
`enos-ops1-prod@.service`) que lea `/etc/enos-ops1/prod.env`, copiar los timers
con `Unit=` apuntando a esa plantilla y guardar allí su propio
`CONTENEDOR_PREFIJO`. Instalarlo como una instancia aislada; esta guía no instala
la configuración de producción.
