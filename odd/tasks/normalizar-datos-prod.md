# normalizar-datos-prod

## Objetivo

Corregir los huecos de datos de la base de producción del sistema de riesgo de
inundación escolar (Corrientes) detectados por las auditorías del 2026-10-18,
sin DDL, sin borrar filas y sin tocar corridas de riesgo, OSM v4 ni usuarios.

## Alcance autorizado

- Escritura en Postgres de producción sólo para los arreglos A–F.
- Prohibido: DDL/migraciones, DELETE, `infra_risk_run`/`infra_risk_snapshot`/
  `infra_risk_factor`, disparar o publicar corridas de riesgo,
  `infra_aislamiento_osm`/`infra_acceso_osm_geometria`, auth/usuarios.
- B y C: ejecutar sólo lo que no cambie la salida operativa del motor v0.3;
  lo demás queda preparado y documentado.

## Protocolo por arreglo

Diagnóstico read-only → plan → backup en
`/tmp/claude-1000/-home-gero-orca-workspaces-data-hub-dashboard-refactor/a13c37fd-886c-4e65-a97c-a45b1726f214/scratchpad/datos-prod/backup/`
→ dry run → transacción única → verificación (conteos antes/después) → rollback documentado.

## Checklist

- [ ] A. Climatología de caudal vacía (`hazard_climatology` sin `caudal_diario`).
- [ ] B. Puntos de río (`puntos-rio` / `infra_geo_rio`) lejos del cauce en Paso de los Libres.
- [ ] C. `distancia_agua_m` / `altura_sobre_agua_m` nulos en `infra_susceptibilidad_estatica`.
- [ ] D. Climatología IMERG con dos períodos bajo una versión.
- [ ] E. Referencias Prefectura (`hidro_referencia`) contaminadas por picos.
- [ ] F. Otras tablas de entrada vacías.

## Diagnóstico (read-only, 2026-10-18)

### A
- `infra_job_run` `calcular-hazard-climatologia-caudal`, clave
  `2015-01-01_2024-12-31_caudal-climatologia-v0.1`: `fallido`, intento 18, último
  2026-10-17T23:41Z, `cupo_agotado` en los 8 puntos, 0 filas.
- `om_cupo_contador` bucket `open-meteo-free`, ventana `dia`: ~7.990/8.000 cada día
  desde 2026-10-13; a las 21:41Z quedan ~790 unidades.
- El job pide los 8 puntos en un solo lote (`tamanoLote` 50) y exige que TODOS
  los tramos respondan (~2.087 unidades en un día); el primer tramo consume cupo
  y el resto falla, se descarta todo. Nunca puede completar.
- Además, un fallo parcial queda `completado` y bloquea el reintento de los
  puntos faltantes (lease por clave).

### B, C, D, E, F
Ver secciones por arreglo (se completan al ejecutar).

## Ruta por tarea

| Tarea | Ruta | Motivo |
|---|---|---|
| A | inline (writer único) | job + test acotados |
| B | inline | análisis + dataset versionado |
| C | inline | geo-static + análisis |
| D | inline | job + test acotados |
| E | inline | análisis |

## Evidencia

(se completa por tarea: backups, conteos antes/después, commits)

## Rollback

(se completa por tarea)

## Próximo paso

A: test RED del job de caudal resumible.
