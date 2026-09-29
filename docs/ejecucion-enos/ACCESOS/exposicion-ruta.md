# Exposición histórica de inundación a lo largo de la ruta escolar

Rama `feat/enos-ruta-physrisk` (base `34188b5`). Complementa `exactitud-geo.md` §physrisk.

## Qué es (y qué no es)
Para cada escuela con ruta OSM v2 se muestrean las celdas de la grilla WRI Aqueduct v2 histórica (30 arcsec, ≈ 1 km; physrisk `ZarrReader`,
período de retorno 100 años, profundidad en m) que la ruta atraviesa. Es un indicador **histórico y estático por celda**: no es por tramo ni por
cruce, no es un pronóstico, no es el estado del camino y no dibuja ningún río. `infra_susceptibilidad_estatica` (valor en el punto de la escuela)
sigue siendo otra cosa y no se presenta como exposición de la ruta. Sin ruta o sin dato de grilla = **sin dato**, nunca 0.

## Resultado (corrida 2026-09-29)
- Duración: 39,4 s en total (8.898 celdas únicas leídas en 37,4 s, RSS máx. 159 MB). Las 59.453 celdas-visitadas de las 1.989 rutas se deduplican a 8.898 lecturas.
- Escuelas: 2.001; 1.989 con ruta y datos (1.986 con cobertura 100 %, 3 con 78,6 %); 12 `sin_ruta` (7 `coordenada_fuera_de_departamento`, 3 `red_vial_no_conectada`, 2 `sin_via_osm_cercana`) → sin dato.
- 401 rutas cruzan al menos una celda con profundidad estimada > 0 (máx. 4,84 m); 1.588 no. Casos: 806 `1801075-00` (57 celdas, 0 > 0), 767 `1800521-00` (79 celdas, 0 > 0), positivo `1800212-00` (10 de 93 celdas, máx. 4,77 m).
- Límites: 30 arcsec ⇒ un valor por celda de ~1 km; la ruta se densifica cada 400 m para no saltar celdas en aristas largas; el punto consultado es el centro de la celda; el dato cubre el escenario histórico WATCH 1980.

## Reproducir
```
cd services/geo-static
PYTHONPATH=src uv run python -m geo_static.jobs.calcular_exposicion_ruta            # exit 0 ok, 3 tope, 4 bloques fallidos
#   opciones: --max-segundos --max-rss-mb --pausa-segundos --limite-escuelas --cues --checkpoint --salida-dir
cd ../.. && node scripts/importar-geo-static.mjs --exposicion-ruta services/geo-static/output/exposicion_ruta_inundacion-v1-2026-09-29.ndjson.gz
```
El checkpoint (`services/geo-static/.data/exposicion_ruta_celdas.ndjson`) hace la corrida reanudable e idempotente. La migración es `drizzle/0004_exposicion_ruta_inundacion.sql` (tabla `infra_exposicion_ruta_inundacion`).

## API y UI
`GET /api/mapas/infraestructura/accesos/[cueAnexo]/exposicion-inundacion` (ACL `verificarAccesoLectura`; 401/403; 200 con `disponible:false` si no hay dato).
Ficha: una línea («Ruta: cruza N celdas de ~1 km con inundación histórica estimada (máx. X m)» / «sin inundación histórica estimada en las celdas que cruza» / «sin dato»), detalle secundario con resolución, período, fuente y aviso. Mapa: celdas afectadas (cuadrados de 30 arcsec) sólo con una escuela seleccionada. Todo bajo `HAZARD_CONTEXT_ENABLED` y fuera de Replay, igual que la ruta.

## Verificación
pytest geo-static 126 OK; vitest focalizado (importador, lib, API, ficha, mapa) 37 archivos / 452 tests OK (un timeout de PGlite en `recurso-seed-natalidad`, pasa aislado); `tsc`, `eslint` y `next build` OK. Vitest completo detenido por el coordinador: fallas ajenas de entorno/seed (`job-diagnostico`, `localizaciones-seed`, etc., sin `ADMIN_EMAIL`/`ADMIN_PASSWORD`) tratadas como línea base. QA de navegador (Chromium headless, demo `:3207`, PGlite `~/orca/demo-data/enos-ruta`): 401 anónimo, textos correctos para 806/767/positivo, capa de celdas visible al seleccionar. Los 503/404 de consola son `parte`/`historial`/`geo-perfiles`, ajenos.
