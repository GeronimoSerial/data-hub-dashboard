# Operación de la réplica de riesgo Open-Meteo

La [réplica y el rol consumidor](riesgo-om-replicacion.md) deben estar
desplegados en dev y staging antes de activar las tareas. Nada de esto se
ejecutó contra servidores: los pasos son manuales.

## Activación manual

1. Crear en `hub_prod` (o ampliar el lector del radar) un usuario con `SELECT`
   sobre `hazard_forecast`, `hazard_ensemble_prob`, `hazard_seasonal_trend`,
   `hazard_climatology`, `hazard_precipitacion_serie` y `hazard_source_health`,
   accesible desde ambos consumidores.
2. Guardar su URL como secret `RIESGO_SOURCE_DATABASE_URL` del repositorio.
   Reutiliza `COOLIFY_TOKEN` y los secrets SSH del radar
   (`RADAR_CONSUMERS_SSH_KEY`, `RADAR_CONSUMERS_KNOWN_HOSTS`,
   `RADAR_STAGING_SSH_HOST`, `RADAR_DEV_SSH_HOST`): son los mismos hosts.
3. Publicar las imágenes dev y staging con este código.
4. Ejecutar el workflow `riesgo-om-operacion.yml` con `inspeccionar`: lista por
   consumidor las tareas Coolify productoras y la réplica, si existe.
5. Ejecutar `configurar`. Valida origen y destinos antes de escribir; retira en
   cada host los timers systemd `sync-pronostico-caudal`, `sync-ensemble`,
   `sync-seasonal`, `climatologia-precipitacion` y `climatologia-caudal`
   (sólo si `/etc/enos-ops1/enos-ops1.env` los atribuye a ese consumidor);
   deshabilita las tareas Coolify con esos jobs exactos; guarda
   `RIESGO_DATOS_ROL=consumidor` y `RIESGO_SOURCE_DATABASE_URL`; despliega y
   habilita `replicar-riesgo-om` (`node scripts/replicar-riesgo-om.mjs`,
   `40 * * * *`, timeout 900 s). Si el despliegue falla, la tarea queda apagada.
   Repetir es idempotente.
6. Ejecutar `ejecutar` (primera réplica) y luego `estado`.
7. Comparar en cada consumidor contra producción la última `corrida_en` por
   proveedor de `hazard_forecast`, la de `hazard_ensemble_prob` y `max(calculado_en)`
   de `hazard_climatology`.
8. Si el radar sigue produciendo en los consumidores, ejecutar también
   `radar-operacion.yml` ([operación del radar](radar-operacion.md)). Aun sin
   eso, el rol consumidor ya bloquea los tres productores del radar.

Equivalente sin GitHub Actions, desde una máquina con acceso:

```bash
export COOLIFY_TOKEN=...            # no se imprime
export RIESGO_SOURCE_DATABASE_URL=... # no se imprime
python3 scripts/configurar-riesgo-om-operacion.py inspeccionar
ssh <usuario@host-staging> 'sudo -n sh -s -- j3zm0co4bi9iy0c70nv3vinf' < deploy/systemd/ops1/desactivar-productores-riesgo-om.sh
ssh <usuario@host-dev> 'sudo -n sh -s -- grg5ycm7js8dk9lkzkktt7l7' < deploy/systemd/ops1/desactivar-productores-riesgo-om.sh
python3 scripts/configurar-riesgo-om-operacion.py configurar
python3 scripts/configurar-riesgo-om-operacion.py ejecutar
python3 scripts/configurar-riesgo-om-operacion.py estado
```

Comprobación en el host: `systemctl list-timers 'enos-ops1-*'` no debe listar
los cinco productores. En el contenedor:
`node scripts/jobs.mjs sync-ensemble` debe responder `rol_consumidor`.

## Reversión operativa

Deshabilitar `replicar-riesgo-om` en ambos consumidores y borrar
`RIESGO_DATOS_ROL` (o fijarlo en `productor`) sólo si se decide volver a
consultar la API desde esos entornos, sabiendo que comparte cupo con
producción. Producción no se modifica en ningún paso.

Verificación local: `python3 -m unittest discover -s scripts -p test_riesgo_om_operacion.py`
(API Coolify simulada), `sh -n` y un test con `systemctl` simulado del
retirador en `scripts/replicar-riesgo-om.test.ts`.
