# Registro — accesos territoriales en /mapas/infraestructura

## Objetivo

Mostrar la susceptibilidad estática physrisk y el aislamiento de acceso OSM
para todo el padrón en `/mapas/infraestructura` y, para la escuela
seleccionada, la ruta real de OSM y sus cruces de agua (puente / vado / sin
evidencia).

## Fuente y corrida

- Extracto Geofabrik `south-america/argentina-260926.osm.pbf`, 431.636.976
  bytes, md5 `ddd7a4f8f3184059a647cb261b732f0b`, en
  `services/geo-static/.data/osm/` (gitignorado; `argentina-latest.osm.pbf`
  es un symlink). Descarga autorizada por N1.
- Corrida real 2026-09-28: 2001 escuelas, red 272.806 nodos / 590.449
  aristas, 1528,7 s total (la construcción de la red domina; ~7-10 s por
  departamento), 1985 con ruta, 16 `sin_conexion_red`; cruces por clase: 1645
  puente, 6 vado, 1373 sin_evidencia. Artefacto de 1.062.693 bytes gz.
  Verificación de consistencia: para las 2001 filas, el conteo de cruces y el
  conteo de puentes coinciden con las métricas del CSV (0 discrepancias).
- Importación a una copia PGlite demo aislada: susceptibilidad 2001/2001,
  geometría 2001/2001, 0 fallidas.

## Equivalencia del cálculo

El `aislamiento_osm-v1-2026-09-26.csv` regenerado difiere del previamente
commiteado en 26 filas (distancias en 26, `tramos_sin_pavimentar_count` en 15,
cruces en 11, `snap_distancia_m` en 11; `indice_aislamiento` sin cambios en
todas ellas). Para probar que el export no cambió el cálculo, se corrió el
**código ORIGINAL** (commit `083f569`, anterior a este trabajo) sobre el mismo
extracto: su CSV es **byte-idéntico** al nuevo (`cmp` igual, 1377,1 s).
Conclusión: el CSV anterior había sido generado con una iteración previa del
job y estaba desactualizado respecto del código commiteado; el CSV se
refrescó junto con la geometría para que las métricas y los cruces dibujados
coincidan.

## Qué muestra el mapa

Bajo el flag `HAZARD_CONTEXT_ENABLED` (nunca en Replay), el control "Capas
territoriales" ofrece:

- (a) **aislamiento de acceso OSM** para todas las escuelas del padrón con
  coordenadas (ramp tonal violeta, íconos lucide `Route` / `RouteOff`);
- (b) **susceptibilidad histórica de inundación fluvial physrisk** (ramp teal,
  íconos lucide `Droplets`; solo se dibuja profundidad > 0; la leyenda cuenta
  "sin profundidad estimada" y "sin cobertura");
- (c) **ruta y cruces de la escuela seleccionada** (activa por defecto; se
  carga on demand por CUE desde
  `GET /api/mapas/infraestructura/accesos/{cue}/geometria`, con cache del lado
  del cliente, nunca todas las rutas a la vez).

Las capas estáticas provienen de `GET /api/mapas/infraestructura/territorio`
(una sola petición). Ambas APIs usan `verificarAccesoLectura` (ACL del recurso
de mapa). La ficha muestra índice, cruces, alternativa sin cruce, profundidad
physrisk, período de retorno, fuentes y fechas.

## Radar

`/api/infraestructura/radar` ahora devuelve `puntos` (el universo filtrado
completo); los puntos de riesgo y de riesgo de acceso del mapa usan `puntos`
más las coordenadas del padrón — antes, solo la página 1 (50 filas) de
escuelas con parte obtenía un punto.

## Limitaciones

- La profundidad physrisk de inundación fluvial es > 0 en solo 67 de 2001
  escuelas; pluvial y viento no tienen valores utilizables.
- La ruta arranca en el nodo vial tras el snap.
- Las etiquetas de puente/vado de OSM son incompletas, por lo que "sin
  evidencia" no equivale a "sin puente".
- El refresco trimestral requiere re-correr el job (~25 min) y el importador.
- La geometría no es un pronóstico ni el estado del edificio.

## Cómo regenerar

1. Desde `services/geo-static/`:

   ```
   PYTHONPATH=src uv run python -m geo_static.jobs.calcular_aislamiento
   ```

2. Desde la raíz del repo (aplicar antes la migración 0003):

   ```
   node scripts/importar-geo-static.mjs --aislamiento <csv> --geometria <ndjson.gz>
   ```

## Actualización — exactitud geográfica (job v2)

La corrida descrita arriba es `version_job` 1 (snap al nodo, red sin `track`/`service`, centroide proxy como cabecera). La auditoría de exactitud
(16 escuelas sin ruta, 7 coordenadas del padrón fuera de su departamento, cabeceras desplazadas hasta 55 km, snap al nodo) y la corrida
`version_job` 2 están en `docs/ejecucion-enos/ACCESOS/exactitud-geo.md`. Los archivos `v1` se conservan como «antes».
