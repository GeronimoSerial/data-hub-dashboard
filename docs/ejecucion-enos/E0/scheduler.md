# Scheduler del job de diagnóstico (E0)

Batch E0 del plan de ejecución ENOS 2026/2027 (§6-E0, §2). Una sola opción
operativa, como exige el plan: **timer del host** (systemd), no cron embebido
en el proceso Next ni un worker residente.

## Por qué un timer del host y no otra cosa

El plan de ejecución (§2, "Operación mínima") fija que los jobs son procesos
batch finitos que corren en el mismo host/volumen que el servicio Next, y que
el scheduler es "un timer del host o el mecanismo ya instalado". Este repo no
tiene ningún scheduler propio instalado (no hay `node-cron`, ni un proceso
worker, ni un servicio externo de colas), así que la opción por defecto es un
`systemd timer` del host que ejecute `docker exec <contenedor> node
scripts/job-diagnostico.mjs` en el contenedor ya corriendo. Serverless/cron de
plataforma quedan fuera de alcance (§2: "no ejecutar trabajos largos dentro de
requests ni asumir que serverless conserva el archivo local").

## Configuración (unidades systemd, plantilla)

Reemplazar `<CONTENEDOR>` por el nombre real del contenedor en ese host.

`/etc/systemd/system/enos-diagnostico.service`:

```ini
[Unit]
Description=Job de diagnóstico ENOS (infra_job_run)
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker exec <CONTENEDOR> node scripts/job-diagnostico.mjs
```

`/etc/systemd/system/enos-diagnostico.timer`:

```ini
[Unit]
Description=Ejecuta el job de diagnóstico ENOS periódicamente

[Timer]
OnCalendar=*-*-* *:0/15
Persistent=true

[Install]
WantedBy=timers.target
```

`OnCalendar=*-*-* *:0/15` corre cada 15 minutos; ajustar según la carga de
referencia real del host una vez medida (pendiente, ver
`docs/ejecucion-enos/E0/report.md`). `Persistent=true` recupera una ejecución
perdida si el host estuvo apagado — el job es idempotente por diseño
(`adquirirLease`/`publicarResultado` sobre `infra_job_run`), así que una
ejecución recuperada tarde no duplica resultados.

Activación:

```bash
systemctl daemon-reload
systemctl enable --now enos-diagnostico.timer
systemctl list-timers enos-diagnostico.timer
```

## Códigos de salida del job

`scripts/job-diagnostico.mjs` puede salir con `0`, `1` o `3`. El timer de
systemd no distingue el motivo por sí solo, así que conviene interpretar cada
código:

- **`0`** — corrió y publicó el resultado, **o** no hizo nada porque el job ya
  estaba `completado` o con un lease vigente en progreso (idempotencia normal,
  no es un error). Operador: nada especial.
- **`1`** — excepción no manejada dentro del job (fallo real). Operador:
  investigar como falla, revisando `journalctl -u enos-diagnostico.service`.
- **`3`** — el job **corrió los chequeos** pero perdió el lease antes de poder
  publicar el resultado: otro proceso lo recuperó por vencimiento mientras
  corría. No es un fallo del chequeo de diagnóstico en sí, pero el resultado no
  quedó registrado, así que conviene loguearlo/alertarlo distinto de un fallo
  real. Operador: investigar **contención de lease**, no el diagnóstico. La
  causa típica es que el timer dispara con un intervalo menor a la duración del
  lease (acá el lease es de 5 minutos y `OnCalendar` corre cada 15, pero al
  ajustar la cadencia conviene revisar lease vs. período del timer). Tratarlo
  como problema de scheduling/solapamiento, no como una falla del chequeo.

## Ensayo en staging — PENDIENTE

El host de staging/producción **no está definido** en este batch (plan de
ejecución §1: "Tampoco se asume conocido el host de producción, su scheduler
o sus límites: E0 los fija" — E0 fija el mecanismo, no asume el host físico).
Por lo tanto el ensayo real del timer contra staging queda **pendiente
explícito**, sin dueño de fecha porque depende de una decisión de
infraestructura fuera del alcance de este batch.

Procedimiento exacto para cuando ese host exista:

1. Instalar las dos unidades de arriba con el nombre de contenedor real.
2. `systemctl start enos-diagnostico.service` (ejecución manual inmediata,
   sin esperar el timer) y verificar `journalctl -u enos-diagnostico.service`
   más el panel `/admin/operacion` (requiere sesión con rol `admin` o
   `editor`) para confirmar que `infra_job_run` refleja una fila
   `completado`.
3. Esperar al menos dos disparos del timer y confirmar en el panel que la
   misma clave de idempotencia (fecha UTC) no generó una segunda fila.
4. Detener el contenedor a mitad de una ejecución simulada (kill -9 al
   proceso del job dentro del contenedor) y verificar que, tras el
   `leaseExpiraEn`, la siguiente ejecución recupera el job (intento
   incrementado) en vez de quedar bloqueado.

Este documento fija la opción operativa; el ensayo queda condicionado a que
N1/infraestructura entregue un host de staging real.
