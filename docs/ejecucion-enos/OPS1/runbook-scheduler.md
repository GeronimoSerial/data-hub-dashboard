# Runbook — scheduler OPS1 (jobs de ingesta y derivados)

Batch OPS1 del plan de ejecución ENOS 2026/2027. Extiende el precedente
documentado en `docs/ejecucion-enos/E0/scheduler.md`: los jobs corren como
**timers systemd del HOST** (no cron embebido, no worker residente), que
ejecutan `docker exec <CONTENEDOR> node scripts/jobs.mjs <nombre>` dentro del
contenedor ya corriendo. El servidor Next NO ejecuta estos jobs.

**Corrección del gate N1 (ver `docs/ejecucion-enos/OPS1/registro.md`,
sección "Correcciones del gate N1"):** las dos secciones siguientes cambiaron
respecto de la primera versión de este runbook:

- El runner ya NO gatea la ejecución de los 8 jobs con `RISK_ENGINE_ENABLED`
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
| `ENOS_JOBS_ENABLED` | entorno del CONTENEDOR (o, opcionalmente, `EnvironmentFile` del host — ver abajo) | encendido si no está seteada (`!== 'false'`) | Único interruptor de los 8 jobs de `scripts/jobs.mjs`. En `false`, ningún job corre: cada uno responde `{"ejecutado":false,"motivo":"flag_deshabilitado"}`, exit `0`, y el runner imprime un `WARN` a stderr (visible en `journalctl`) con el nombre del job saltado. |
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
  única para los 8 jobs. `ExecStart` corre
  `docker exec -e ENOS_JOBS_ENABLED <CONTENEDOR> node scripts/jobs.mjs %i`.
- Un `.timer` explícito **por job programado** (no una plantilla): cada uno
  fija `Unit=enos-ops1@<job>.service` y su propio `OnCalendar` en UTC. Los
  dos jobs de climatología son bajo demanda y no tienen `.timer` (ver tabla).

Pasos:

1. Copiar `deploy/systemd/ops1/enos-ops1@.service` y todos los
   `deploy/systemd/ops1/enos-ops1-*.timer` a `/etc/systemd/system/`.
2. Reemplazar `<CONTENEDOR>` por el nombre real del contenedor en
   `enos-ops1@.service`. Si el nombre cambia entre despliegues (Dokploy/
   Coolify recrean el contenedor con sufijos), el operador debe actualizar
   este archivo y correr `systemctl daemon-reload` de nuevo.
3. `systemctl daemon-reload`.
4. Habilitar cada timer (ver tabla de cadencias):

```bash
systemctl enable --now enos-ops1-sync-pronostico-caudal.timer
systemctl enable --now enos-ops1-sync-ensemble.timer
systemctl enable --now enos-ops1-sync-imerg.timer
systemctl enable --now enos-ops1-calcular-riesgo.timer
systemctl enable --now enos-ops1-episodios-derivados.timer
systemctl enable --now enos-ops1-geo-perfiles.timer
systemctl enable --now enos-ops1-situacion-corte.timer
```

Las climatologías no se habilitan como timer (bajo demanda, ver tabla): se
corren manualmente con
`docker exec <CONTENEDOR> node scripts/jobs.mjs climatologia-precipitacion`
(o `climatologia-caudal`). Si en el futuro se decide una cadencia periódica
para alguna, crear un `.timer` explícito con el mismo patrón que los de
arriba (`Unit=enos-ops1@climatologia-precipitacion.service`, `OnCalendar=...
UTC`) en vez de reintroducir drop-ins.

## Tabla de cadencias por job

| job | cadencia | `OnCalendar` (UTC) | archivo | motivo |
|---|---|---|---|---|
| sync-pronostico-caudal | 6h | `*-*-* 08,14,20,02:00:00 UTC` | `enos-ops1-sync-pronostico-caudal.timer` | corridas ECMWF 00/06/12/18 UTC + ~8h de margen (6h de latencia habitual de disponibilidad real-time + 2h adicionales documentados por Open-Meteo para su distribución open-data; ajustar si se confirma otro valor) |
| sync-ensemble | 6h | `*-*-* 08,14,20,02:00:00 UTC` | `enos-ops1-sync-ensemble.timer` | mismo motivo que arriba (Open-Meteo Ensemble) |
| sync-imerg | 1h | `*-*-* *:00:00 UTC` | `enos-ops1-sync-imerg.timer` | Early Run IMERG, ~4h de latencia propia de la fuente; backfill acotado ya cubre huecos |
| calcular-riesgo | 6h, encadenado por offset | `*-*-* 08,14,20,02:15:00 UTC` (offset +15min sobre los syncs de 6h) | `enos-ops1-calcular-riesgo.timer` | corre DESPUÉS de sync-pronostico-caudal/sync-ensemble; el offset de 15min evita la carrera; el lease además impide solapes |
| episodios-derivados | 1h | `*-*-* *:00:00 UTC` | `enos-ops1-episodios-derivados.timer` | recomputo barato, sin llamadas externas |
| geo-perfiles | diario | `*-*-* 03:00:00 UTC` | `enos-ops1-geo-perfiles.timer` | recompute barato de perfiles geográficos, sin llamadas externas; horario de baja carga |
| situacion-corte | 1h, alineado tras calcular-riesgo | `*-*-* *:20:00 UTC` | `enos-ops1-situacion-corte.timer` | corre poco después de calcular-riesgo (`:15` en 08,14,20,02 UTC) para que el corte del Centro de Situación (E5) refleje el riesgo recién calculado lo antes posible; en las demás horas corre con su propia cadencia horaria |
| climatologia-precipitacion | bajo demanda | sin timer | — | ejecución manual (`docker exec <CONTENEDOR> node scripts/jobs.mjs climatologia-precipitacion`); cálculo pesado de serie histórica, no cambia seguido |
| climatologia-caudal | bajo demanda | sin timer | — | ídem anterior |

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
`docker exec -e ENOS_JOBS_ENABLED <CONTENEDOR> node scripts/jobs.mjs
<nombre>`, el mismo mecanismo que usaba `enos-diagnostico.service` en E0
(más el reenvío opcional de `ENOS_JOBS_ENABLED` agregado en esta corrección).
El contenedor ya tiene `scripts/jobs.mjs` empaquetado en la imagen (igual que
`scripts/job-diagnostico.mjs`, copiado por el `Dockerfile`), así que no hace
falta montarlo ni instalarlo aparte.

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
directamente contra su ruta real. Corrido localmente en este batch sobre los
8 archivos del repo (la plantilla instanciada 8 veces + los 6 `.timer`
explícitos), **sin instalarlos**; ver `docs/ejecucion-enos/OPS1/registro.md`
para el resultado real, exit `0` en los 14.

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
- **Pausar los 8 jobs a la vez sin tocar systemd:** setear
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
