# Operación de la réplica del radar

La [réplica y su flag](radar-replicacion.md) deben estar desplegados antes de
activar las tareas.

## Activación manual

Este cambio no configura servidores por sí solo. Publicar primero la imagen dev
y la imagen staging con este código. El workflow `radar-operacion.yml` sólo tiene
`workflow_dispatch`; ejecutar `inspeccionar` antes de `configurar`.

Secrets requeridos por `configurar`:

- `COOLIFY_TOKEN`, con permisos para variables, tareas y despliegues.
- `RADAR_SOURCE_DATABASE_URL`, con origen `hub_prod`.
- `RADAR_CONSUMERS_SSH_KEY` y `RADAR_CONSUMERS_KNOWN_HOSTS`.
- `RADAR_STAGING_SSH_HOST` y `RADAR_DEV_SSH_HOST`, como `usuario@host`.
  El usuario debe poder ejecutar `sudo -n sh` en el host correspondiente.

`configurar` retira sólo los tres timers productores del radar y detiene sus
servicios en ambos hosts. Verifica que `/etc/enos-ops1/enos-ops1.env` atribuya los
timers al consumidor solicitado; si falta el archivo pero hay timers, falla sin
borrarlos. No retira la plantilla OPS1 ni otros timers. Después deshabilita las
tareas equivalentes de Coolify, guarda las variables, despliega cada consumidor y
habilita una réplica cada 15 minutos. La tarea permanece apagada si el despliegue
falla. Si la configuración queda parcial, corregir la causa y repetir:
la creación/actualización de tareas es idempotente. No modifica producción.

Luego ejecutar `ejecutar` para una primera réplica y `estado` para comprobar ambas
entregas. Comparar conteos y última fecha de las tres tablas con la ventana de
producción. Confirmar que los productores consumidores no aparecen activos en
Coolify ni en `systemctl list-timers`.

## Reversión operativa

Deshabilitar las tareas `replicar-radar-meteo` de ambos consumidores. Restaurar
la configuración anterior y sus timers sólo si se decide volver a consultar la
API desde esos entornos. La operación no modifica producción.

Verificación local: `python3 -m unittest discover -s scripts -p test_radar_operacion.py`
pasó 4 tests con API simulada. `sh -n` validó el retirador systemd y el workflow
se parseó como YAML. No se ejecutaron operaciones remotas.
