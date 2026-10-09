# Contrato de datos: aislamiento OSM

El job `geo_static.jobs.calcular_aislamiento` escribe el CSV `aislamiento_osm-v{version}-{fecha_corrida}.csv`, la auditoría `aislamiento_osm_sin_ruta-v{version}-{fecha_corrida}.csv` y, cuando usa el extracto PBF, la geometría `accesos_osm_geometria-v{version}-{fecha_corrida}.ndjson.gz`. La fecha de corrida evita reemplazar los archivos versionados del repositorio; `fecha_extracto_osm` sigue identificando la fecha de los datos OSM.

## Distancia pavimentada y nivel 0

`distancia_via_pavimentada_m` es la longitud real sobre el grafo desde la escuela, snapeada a la red, hasta la primera arista pavimentada alcanzable. El cálculo usa longitud física de las aristas y respeta su dirección. El nivel 0 requiere distancia a la red pavimentada de hasta 2.000 m, hasta 10.000 m a la localidad destino y hasta 2 km sin pavimentar en la ruta. El umbral de 10.000 m conserva el criterio previo de cercanía a localidad.

## Cruces de agua y vados

Los cruces mantienen `cruces_agua_con_vado_count` como total relevante para el índice. `cruces_agua_con_vado_explicito_count` cuenta cruces confirmados por `ford=yes` en una arista, un nodo cercano o una geometría way. `cruces_agua_con_vado_probable_count` cuenta cruces sin evidencia explícita de puente, túnel o culvert sobre vías que el mismo predicado vial clasifica como no pavimentadas para `tramos_sin_pavimentar_km`. Estos cruces se tratan como vados para el índice y para buscar una alternativa sin cruce. Un cruce sin evidencia sobre vía pavimentada permanece neutral.

Los dos conteos separados se incorporan a `infra_aislamiento_osm` en la migración `0011_aislamiento-vados-probables.sql`; los datos históricos siguen disponibles bajo la versión de job con la que fueron importados.

## Medición de `ford=yes`

La lectura pyrosm directa con el bbox de Corrientes retornó 213 entidades `ford=yes`: 202 nodos (`Point`) y 11 ways (`LineString`/`MultiLineString`). El bbox ampliado de la corrida real retornó 275 entidades. La corrida no encontró cruces explícitos confirmados en las rutas de las escuelas; sí contó 58 cruces probables en 39 escuelas. La extracción conserva los ways además de los nodos, mientras `_tiene_ford` sigue leyendo tags `ford=yes` de aristas y nodos de la red.

En el NDJSON, `vado_probable` mantiene su categoría propia. El mapa lo etiqueta como “Vado probable” y lo incluye en el resumen de vados con riesgo.
