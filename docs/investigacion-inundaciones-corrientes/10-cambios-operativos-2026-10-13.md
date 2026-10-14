# Cambios operativos del 2026-10-13

Registro de las acciones operativas que el orquestador ejecutó el 2026-10-13 (~13:20–13:45 ART) con acceso autorizado por el equipo (SSH al servidor, API de Coolify y consultas de solo lectura a la base). Esta investigación no modifica código ni configuración del repositorio; este documento deja constancia de lo que sí cambió en los entornos para que pueda auditarse y revertirse. No contiene credenciales, hosts ni identificadores de aplicaciones.

## Hallazgo que motivó los cambios

- **Producción programa sus jobs con «scheduled tasks» de Coolify, no con systemd.** Hasta el 2026-10-13 la app de producción tenía solo 4 tareas: `sync-radar-ensemble` (`55 3,9,15,21 * * *`), `sync-radar-meteo` (`27 */3 * * *`), `sync-smn-alertas` (`7-59/15 * * * *`) y `verificar-radar-meteo` (`30 11 * * *`).
- Los timers systemd del servidor (`enos-ops1-*`: smn, radar-meteo, radar-ensemble, verificar-radar-meteo, climatologia-caudal, climatologia-precipitacion) ejecutan la **app de staging** contra la **base de staging**, no producción.
- El runbook `docs/ejecucion-enos/OPS1/runbook-scheduler.md` describe systemd y no coincide con producción (deriva documental; fuera de la superficie de esta investigación, no se editó).
- Flags de la app de producción (variables de entorno del contenedor): `RISK_RADAR_ENABLED=true`, `RISK_ENGINE_ENABLED=true`, `HAZARD_CONTEXT_ENABLED=true`, `SITUACION_ENABLED=true`, `SEASONAL_ENABLED=true`, `RISK_MODE=shadow`; token de Earthdata presente; clave de Open-Meteo ausente (cupo gratuito).

Consecuencia: el motor de riesgo, el caudal, IMERG y las climatologías no corrieron en producción porque **no estaban programados**, no por un flag apagado. Detalle en [03](03-auditoria-sistema.md#configuración-observada-en-producción) y [04](04-matriz-caso-sistema.md).

## Producción

### Ejecuciones manuales (una vez)

| Job | Resultado registrado | Observación |
|---|---|---|
| `sync-imerg` | `sync-hazard-imerg` completado: 2 gránulos procesados, 10 fallidos, 8.662 celdas | `hazard_observation` 0 → 8.662 filas; último `valido_hasta` 2026-10-13T11:59:59Z; `hazard_source_health` para `nasa-imerg` = ok. Tasa de falla de gránulos alta (10/12): ver P-2 en [06](06-plan-mejoras.md#problemas-operativos-detectados-el-2026-10-13) |
| `climatologia-caudal` | **completado** con 0 filas y 0 puntos; los 8 puntos de río fallaron y no quedó error guardado | **Defecto:** informa éxito sin procesar nada (P-1 en [06](06-plan-mejoras.md#problemas-operativos-detectados-el-2026-10-13)) |
| `climatologia-precipitacion` | fallido por diseño: «cupo OM-cupo agotado: 366 celda(s) pendientes»; 21 celdas, 126 filas | Reanudable: el estado `fallido` permite retomar en la próxima corrida (`calcular-climatologia.ts:273-279`) |

### Tareas programadas creadas en Coolify

| Tarea | Cron | Timeout |
|---|---|---|
| `sync-imerg` | `5 * * * *` (cada hora) | 300 s |
| `climatologia-caudal` | `41 6 1 * *` (mensual) | 1200 s |
| `climatologia-precipitacion` | `43 6 1 * *` (mensual) | 1200 s |

## Staging

Los cambios en staging fueron **no intencionales en su origen**: se actuó sobre los timers del servidor creyendo que eran de producción.

- Se instaló y habilitó `enos-ops1-sync-imerg.timer` (cada hora).
- Ejecuciones manuales: `sync-imerg` (5 gránulos ok, 7 fallidos, 21.655 celdas); `climatologia-caudal` (`lease_no_disponible`); `climatologia-precipitacion` (21 celdas, 126 filas, cortada por cupo).
- La corrida de climatología de staging consumió cupo de Open-Meteo que probablemente se **comparte con producción** (misma salida de red). Ver P-3 en [06](06-plan-mejoras.md#problemas-operativos-detectados-el-2026-10-13).

## Qué no se cambió

- No se programaron `calcular-riesgo`, `sync-pronostico-caudal`, `sync-ensemble`, `situacion-corte`, `episodios-derivados` ni `sync-seasonal`.
- No se desplegó código. No se modificaron flags.

Motivo: el motor tiene defectos que deben corregirse antes de activarlo (consulta as-of, atenuación, distancia en grados). Ver P-5 y P-6 en [06](06-plan-mejoras.md#problemas-operativos-detectados-el-2026-10-13).

## Reversión

1. Producción: borrar las 3 tareas programadas creadas en la app de producción en Coolify (`sync-imerg`, `climatologia-caudal`, `climatologia-precipitacion`).
2. Staging: en el servidor de staging, `systemctl disable --now enos-ops1-sync-imerg.timer`.
3. Las filas ya escritas (`hazard_observation`, climatologías parciales, `infra_job_run`) no se borran con la reversión; si se quieren eliminar es una decisión aparte del equipo.
