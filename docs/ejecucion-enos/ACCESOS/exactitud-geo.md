# Exactitud geográfica de accesos territoriales — auditoría y correcciones (job v2)

Rama `feat/enos-exactitud-geo` (base `1f00b0a`). Corrida real reproducible con las 2001 escuelas del padrón con
coordenadas, sobre el extracto Geofabrik `argentina-260926.osm.pbf` (md5 `ddd7a4f8f3184059a647cb261b732f0b`).
Los archivos `v1` committeados se conservan intactos como «antes»; los nuevos son `v2`.

## Resumen

| Hallazgo | Causa demostrada | Corrección |
|---|---|---|
| 16 escuelas `sin_conexion_red` (todas con nodo vial a más de 5 km) | 8 son **red OSM filtrada**: el filtro `driving` de pyrosm excluye `highway=track` y `service` y los accesos rurales de Corrientes son tracks; 3 son **red OSM no conectada**; 2 **sin vías OSM**; 3 **coordenada del padrón errónea** | Red con `track`+`service`; motivos verificables |
| «Cabecera» = centroide de las escuelas de la localidad con más escuelas | **Bug de algoritmo/datos**: error de hasta 55,5 km respecto de la sede real (Santo Tomé 55,5; General Paz 43,1; Concepción 27,4; General Alvear 23,2; Lavalle 8,2; San Cosme 7,8; San Martín 7,7; Ituzaingó 5,3; Capital 3,0) | Sede oficial versionada (Georef) |
| 7 coordenadas del padrón a 3,9–307 km fuera de su departamento | **Coordenada del padrón** (4 comparten la longitud −59,4571363, artefacto de geocodificación); tenían índice calculado en otro lugar | Gate: sin índice, motivo `coordenada_fuera_de_departamento`; no se reubican |
| Snap al nodo, no a la vía | **Algoritmo**: distancia escuela→nodo vs escuela→arista difiere p50 17 m, p99 425 m, máx 935 m (112 escuelas >100 m, 15 >500 m) | Snap a la arista más cercana; la ruta arranca en el punto de la vía |
| Vados en nodos `ford=yes` etiquetados «sin evidencia» | **Bug de import/algoritmo** (solo visual: los conteos no cambian) | 263 nodos `ford=yes` cargados; 4 cruces ahora `vado` |
| Exportación de ruta | **Sin defecto**: longitud de la geometría / `distancia_cabecera_departamental_m` = 0,997–1,0015 en las 1989 rutas (no hay truncamiento ni rectas) | — |

## Las 16 escuelas sin ruta (antes)

Antes = `aislamiento_osm-v1`; después = `aislamiento_osm-v2`. «Vía más cercana» es la vía de OSM de cualquier clase más
cercana a la coordenada del padrón, medida sobre el extracto real (`highway=*`, sin filtrar).

| CUE | Escuela (localidad, depto) | Antes: snap m / motivo | Causa (evidencia OSM) | Después | Resolución |
|---|---|---|---|---|---|
| 1800585-00 | ESCUELA Nº 122 "PEDRO CRISTALDO" (Tres Cruces, San Luis Del Palmar) | 5517 / sin_conexion_red | track (excluida por el filtro driving), conectada; vía más cercana: track 33 m | snap 33 m · 69.9 km a la sede · índice 3 | Corregido: red con tracks; ruta real de OSM |
| 1801033-00 | ESCUELA Nº 294 (Estancia Santa Barbara, Concepcion) | 9936 / sin_conexion_red | track (excluida), conectada; vía más cercana: track 331 m | snap 331 m · 70.5 km a la sede · índice 3 | Corregido: red con tracks; ruta real de OSM |
| 1801529-00 | ESCUELA Nº 961 (Yajarave, Concepcion) | 7151 / sin_conexion_red | solo tracks lejanos (excluidos); path con access=private/motor_vehicle=no; vía más cercana: path private 707 m (no conducible); track 1.982 m | snap 2219 m · 19.8 km a la sede · índice 1 | Corregido: red con tracks; ruta real de OSM |
| 1801080-00 | ESCUELA Nº 367 "SUBPREFECTURA GOYA (Isla La Josefina, Goya) | 11424 / sin_conexion_red | sin ninguna vía OSM en 6 km (el padrón la ubica en «Isla La Josefina»); vía más cercana: ninguna en 6 km | sin_via_osm_cercana | Sin ruta, motivo verificable (Archivo 4) |
| 1801916-00 | COLEGIO SECUNDARIO DEL PARAJE MONT (San Antonio, Ituzaingo) | 7580 / sin_conexion_red | componente vial aislado (126 ways, 122,7 km) a 1.405 m de la red principal; sin `route=ferry` a menos de 114 km; vía más cercana: unclassified 61 m | red_vial_no_conectada | Sin ruta, motivo verificable (Archivo 4) |
| 1800896-00 | ESCUELA Nº 752 "PREFECTURA NAVAL A (Apipe Grande, Ituzaingo) | 8583 / sin_conexion_red | mismo componente aislado; vía más cercana: unclassified 34 m | red_vial_no_conectada | Sin ruta, motivo verificable (Archivo 4) |
| 1800898-00 | ESCUELA Nº 213 "ROSALÍA VALDÉS DE  (Monte Grande, Ituzaingo) | 7582 / sin_conexion_red | mismo componente aislado; vía más cercana: unclassified 62 m | red_vial_no_conectada | Sin ruta, motivo verificable (Archivo 4) |
| 1800844-00 | ESCUELA Nº 223 " JOSE CALASANZ RAM (San Lorencito, Empedrado) | 7008 / sin_conexion_red | track (excluida), conectada; vía más cercana: track 21 m | snap 21 m · 65.4 km a la sede · índice 3 | Corregido: red con tracks; ruta real de OSM |
| 1800056-00 | ESCUELA Nº 49 "DON GIL ROMERO" (Bernachea, Empedrado) | 5966 / sin_conexion_red | track (excluida), conectada; vía más cercana: track 25 m | snap 25 m · 69.4 km a la sede · índice 3 | Corregido: red con tracks; ruta real de OSM |
| 1800295-00 | ESCUELA DE EDUCACION ESPECIAL Nº 1 (General Alvear, General Alvear) | 13993 / sin_conexion_red | coordenada 269,6 km fuera de General Alvear; lon -59,4571363 repetida en 4 escuelas; vía más cercana: path a 4,1 km (no conducible) | coordenada_fuera_de_departamento | Sin ruta, motivo verificable (Archivo 4) |
| 1800200-00 | ESCUELA Nº 271 (Malezal, Esquina) | 6588 / sin_conexion_red | track (excluida), conectada; vía más cercana: track 1.245 m | snap 1245 m · 105.8 km a la sede · índice 3 | Corregido: red con tracks; ruta real de OSM |
| 1801532-00 | ESCUELA Nº 377 (Isla Talar, Esquina) | 15847 / sin_conexion_red | coordenada 17,3 km fuera de Esquina; no se reubica; vía más cercana: ninguna en 6 km | coordenada_fuera_de_departamento | Sin ruta, motivo verificable (Archivo 4) |
| 1800203-00 | ESCUELA Nº 626 (Malezal, Esquina) | 7877 / sin_conexion_red | sin vías OSM locales; la más cercana está a 11,8 km; vía más cercana: ninguna en 5 km (Ruta Provincial 57 a 11,8 km) | sin_via_osm_cercana | Sin ruta, motivo verificable (Archivo 4) |
| 1800920-00 | ESCUELA Nº 301 "BATALLA DE SAN LOR (Ita Caabo, Mercedes) | 5700 / sin_conexion_red | track (excluida), conectada; vía más cercana: track 83 m | snap 83 m · 45.2 km a la sede · índice 3 | Corregido: red con tracks; ruta real de OSM |
| 1800282-00 | ESCUELA Nº 410 "PROVINCIA DE SANTA (Perugorria, Curuzu Cuatia) | 6875 / sin_conexion_red | coordenada 55,0 km fuera de Curuzú Cuatiá; lon -59,4571363; vía más cercana: ninguna en 6 km | coordenada_fuera_de_departamento | Sin ruta, motivo verificable (Archivo 4) |
| 1800025-00 | ESCUELA Nº 316 "EL CHAÑAR" (El Chañar, Curuzu Cuatia) | 8289 / sin_conexion_red | track (excluida), conectada; vía más cercana: track 91 m | snap 91 m · 82.2 km a la sede · índice 3 | Corregido: red con tracks; ruta real de OSM |

Resultado: **8 corregidas** con ruta real de OSM, **3** sin ruta por red no conectada, **2** sin vías OSM, **3** con coordenada
inválida. La evidencia por escuela está en `services/geo-static/output/aislamiento_osm_sin_ruta-v2-2026-09-26.csv` (12 filas).

Notas de rigor:
- **Ituzaingó (San Antonio, Monte Grande, Apipé Grande):** hay un camino a 34–62 m, pero pertenece a un componente de 126 ways
  (122,7 km) separado 1.405 m de la red principal, y el extracto no tiene ningún `route=ferry` a menos de 114 km (hay 3 en toda la
  provincia, a 114–187 km de estas escuelas). Es coherente con una isla sin enlace mapeado. Se ve en el mapa base pero **no hay enlace en OSM**: no se inventa un camino.
  `via_a_red_principal_m` = 7.632 (San Antonio) / 7.640 (Monte Grande) / 8.580 m (Apipé Grande).
- **Yajaravé (1801529-00)** se resuelve pero con snap de 2.219 m: la vía conducible más cercana está a esa distancia
  (a 707 m solo hay un `path` con `access=private`/`motor_vehicle=no`). La ruta arranca a 2,2 km de la escuela; ese tramo
  no se dibuja ni se suma.
- **Malezal (1800203-00)** y **Alvear/Perugorría/Isla Talar**: ninguna vía a menos de 5 km; en los tres últimos la coordenada
  cae fuera del departamento (269,6 / 55,0 / 17,3 km).

## Casos 806 y 767 (camino rural visible en el mapa base)

| Caso | | Antes (v1) | Después (v2) |
|---|---|---|---|
| **806** CUE 1801075-00, Arroyo Horqueta (Sauce); escuela −29,988212, −58,535738 | Snap | 2.885,7 m al nodo | **118,0 m** a la vía |
| | Primer punto de la ruta | −58,533237, −29,962351 (2,9 km al norte) | **−58,535738, −29,987147** (mismo meridiano, 118 m al norte) |
| | Distancia a la sede | 58.114 m (hasta el centroide proxy) | 41.101 m (hasta Sauce, sede oficial) |
| | Tramos sin pavimentar / cruces | 178 / 2 (1 puente, 1 sin evidencia) | 68 / 1 (sin evidencia) |
| | Índice | 3 | 3 |
| **767** CUE 1800521-00, Lobory (Curuzú Cuatiá); escuela −29,7099769, −58,5198489 | Snap | 3.852,0 m al nodo | **25,8 m** a la vía |
| | Primer punto de la ruta | −58,518287, −29,675361 (3,9 km al norte) | **−58,519809, −29,709747** |
| | Distancia a la sede | 50.436 m | 56.930 m (Curuzú Cuatiá, sede oficial; la ruta ahora sigue los tracks reales) |
| | Tramos sin pavimentar / cruces | 70 / 4 (3 puente, 1 sin evidencia) | 97 / 4 (3 puente, 1 sin evidencia) |
| | Índice | 3 | 3 |

Verificación visual/geométrica (capturas reproducibles en esta carpeta: `1801075-00.png/.svg`, `1800521-00.png/.svg`, con
todas las vías de OSM del entorno; marrón = `track`, rojo = ruta): la ruta nueva **sigue los tracks de OSM desde el punto de la
vía más próximo a la escuela**. El **tramo residual escuela↔vía** (118 m en la 806, 25,8 m en la 767) no se dibuja ni se suma a la
distancia: no existe en OSM un camino de acceso entre la coordenada del padrón y el track (puede ser un acceso no mapeado o
imprecisión de la coordenada); `snap_distancia_m` lo declara. Los tramos rectos largos de la ruta son geometría propia de OSM
(ways de 2 nodos, p. ej. Ruta Provincial 126 de 6,8 km y Ruta Provincial 25 de 9,9 km, verificados en el extracto), no
interpolación. `1801916-00.png` muestra el caso Ituzaingó: red local densa, aislada de la principal.

## Antes / después (2001 escuelas, mismo extracto)

| Métrica | Antes (v1) | Después (v2) |
|---|---:|---:|
| Escuelas con índice | 1985 (99,2 %) | **1989 (99,4 %)**; sobre las 1994 con coordenada válida: 99,75 % |
| Sin índice | 16 (`sin_conexion_red`) | 12: 7 coordenada fuera de departamento, 3 red no conectada, 2 sin vía OSM |
| Escuelas con ruta dibujable | 1985 | 1989 (0 rutas degeneradas) |
| Snap (m) p50 / p90 / p99 / máx | 50,4 / 164,5 / 4.213,6 / 15.846,9 | **27,2 / 56,9 / 164,5** / 11.308,2 |
| Snap > 500 m / > 1 km (todas las escuelas con snap) | 86 / 60 | **15 / 13** (de las cuales 5 sin ruta; con ruta: 10 / 8, máx 2.988 m) |
| Índice 0 / 1 / 2 / 3 | 471 / 628 / 114 / 772 | 560 / 601 / 63 / 765 |
| Índice sin cambios | — | 1406 (70,3 %) |
| Cruces (total / puente / vado+sin evidencia) | 3024 / 1645 / 1379 | 2554 / 1477 / 1077 |
| Cruces etiquetados `vado` (nodo/arista `ford`) | 6 | 5 |
| Tramos sin pavimentar (suma) | 105.305 | 96.275 |
| Distancia a la sede: cambio absoluto p50 / p90 / máx | — | 2,0 km / 29,8 km / 66,9 km |
| Tiempo total del job | 1528,7 s | **1301,1 s** (capa de agua+fords 472,8 s) |

Origen de los cambios de índice: los departamentos con la sede desplazada menos de 1,1 km (control, 491 escuelas) cambian de
nivel en el **5,5 %** (efecto de red+snap); los de 5 km o más (554 escuelas) en el **54,3 %** (efecto de la sede). El caso más
grande es Capital (162 de 363): la sede real de Corrientes está 3,0 km del centroide proxy y el nivel 0 exige ≤ 3 km de la
sede. Detalle por departamento en «Cabecera departamental» más abajo. La **semántica de niveles 0–3 no cambió**.

### Cabecera departamental: desplazamiento proxy→sede e índices modificados

| Departamento | Escuelas | Desplazamiento (km) | Índice cambió |
|---|---:|---:|---:|
| Berón de Astrada | 10 | 0,1 | 0 (0 %) |
| San Miguel | 39 | 0,3 | 0 (0 %) |
| Itatí | 26 | 0,4 | 0 (0 %) |
| San Roque | 53 | 0,5 | 1 (2 %) |
| Bella Vista | 79 | 0,6 | 3 (4 %) |
| Saladas | 69 | 0,7 | 5 (7 %) |
| Sauce | 43 | 0,7 | 5 (12 %) |
| Empedrado | 59 | 0,8 | 6 (10 %) |
| Mercedes | 81 | 0,9 | 7 (9 %) |
| Mburucuyá | 32 | 1,0 | 0 (0 %) |
| Curuzú Cuatiá | 92 | 1,7 | 10 (11 %) |
| San Luis del Palmar | 60 | 1,9 | 8 (13 %) |
| Goya | 188 | 2,1 | 19 (10 %) |
| Paso de los Libres | 70 | 2,5 | 12 (17 %) |
| Monte Caseros | 78 | 2,9 | 20 (26 %) |
| Capital | 363 | 3,0 | 162 (45 %) |
| Esquina | 105 | 3,1 | 24 (23 %) |
| Ituzaingó | 78 | 5,3 | 27 (35 %) |
| San Martín | 51 | 7,7 | 17 (33 %) |
| San Cosme | 55 | 7,8 | 38 (69 %) |
| Lavalle | 92 | 8,2 | 45 (49 %) |
| General Alvear | 25 | 23,2 | 21 (84 %) |
| Concepción | 77 | 27,4 | 34 (44 %) |
| General Paz | 73 | 43,1 | 40 (55 %) |
| Santo Tomé | 103 | 55,5 | 79 (77 %) |

## Verificación de posiciones, distancias, rutas y cruces

- **Posiciones:** punto en polígono contra Georef departamentos: 19 escuelas fuera de su polígono, 7 a más de 2 km (3,9–307 km); las 12
  restantes están a 0,01–1,33 km (borde de río/costa) y se conservan. Las 4 escuelas del padrón sin coordenadas no entran al universo.
- **Distancias:** longitud de la geometría exportada / `distancia_cabecera_departamental_m` en [0,99702; 1,00148] para las 1989 rutas;
  el último vértice queda a ≤ 98 m de la sede oficial (nodo vial más cercano); el primer vértice queda a la distancia de `snap_distancia_m`
  (máxima diferencia 10,3 m en 5 rutas con aristas de varios km, por la interpolación sobre la arista).
- **Cruces:** los cruces exportados coinciden con `cruces_agua_count` en las 1989 rutas. Contra las etiquetas del extracto en los
  402 puntos de cruce únicos: los 206 «puente» tienen `bridge`/`tunnel=culvert` en la vía; los 192 «sin evidencia» no tienen puente ni
  ford; los 4 «vado» tienen un nodo `ford=yes` a 0–17,7 m. Todo cruce intersecta un curso de agua por construcción. «Sin evidencia» no
  equivale a «sin puente» (etiquetado incompleto de OSM); los conteos siguen tratando ese caso como vado (nunca se asume seguro).
- **Importación/API:** `scripts/importar-geo-static.mjs` cargó 2001/2001 filas de aislamiento y de geometría de `version_job` 2 en una
  copia PGlite aislada (`~/orca/demo-data/enos-exactitud`), conviviendo con `v1`; los consumidores toman la versión más nueva.
  Vitest focalizado 12 archivos / 71 tests OK (importador, `territorio-mapa`, APIs `mapas/infraestructura`, adaptador de aislamiento).
  No se tocó código TypeScript ni la UI.

## physrisk a lo largo de la ruta

**Técnicamente posible, no implementado (fuera de alcance).** El lector `ZarrReader.get_curves(path, longitudes, latitudes)` que ya usa
`physrisk_susceptibilidad.leer_peligro_lote` acepta arrays de puntos arbitrarios. Prueba real con la ruta de 1800072-00 (285 vértices,
80 celdas únicas): 80/80 lecturas correctas en 10,4 s (todas 0,0 m de profundidad). Límites: (1) la grilla WRI Aqueduct v2 histórica
(`inunriver_historical_000000000WATCH_1980`) es de 30 arcsec (≈ 0,82 × 0,92 km): un valor por celda de ~1 km, no por tramo de
camino ni por cruce; (2) es un indicador histórico/estático, no un pronóstico ni el estado del camino; (3) hoy la base guarda
**solo el valor en el punto de la escuela** (`infra_susceptibilidad_estatica`), y solo 67 de 2001 tienen profundidad > 0.
Un muestreo por ruta requeriría un job y una tabla nuevos (≈ 100–150 mil lecturas únicas) y no se mezcla con los datos OSM.

## Riesgos y cobertura pendiente

- **Dependencia del mapeo OSM:** 5 escuelas sin ruta por falta o desconexión de vías en OSM (3 + 2); para el componente de Ituzaingó el extracto no tiene un enlace (`route=ferry`) cercano.
- **7 coordenadas del padrón inválidas** (excluidas, no corregidas): requieren revisión de la fuente; las 4 con longitud −59,4571363 sugieren
  un valor por defecto del geocodificador. También hay 4 escuelas sin coordenadas y 48 pares de coordenadas repetidas (no evaluados).
- **Copy de UI:** `components/mapas/capas-accesos.tsx` traduce solo `sin_conexion_red`, `ruta_degenerada` y `sin_geometria_importada`; los 3 motivos
  nuevos caen en el texto genérico «Sin geometría de acceso para esta escuela.» (no se editó UI por restricción). Pendiente para el dueño de UI.
- **Sede oficial = centroide Georef de la localidad**, no un punto de plaza; el nodo vial más cercano queda ≤ 98 m. Los niveles con umbral de 3 km
  (nivel 0) dependen de ese punto.
- **Snap ≤ 5 km sigue aceptando** escuelas alejadas de la vía (8 con ruta a más de 1 km, máx 2.988 m); el tramo escuela↔vía no se dibuja.
- **Rendimiento:** la lectura de fords agrega una pasada del PBF (~+8 min); el total bajó a 1301 s. Corrida 2 fue muerta por el OOM global del
  equipo (memoria agotada por otros procesos; el job usa ~2,4 GB) y se relanzó sin efectos.
- La ruta usa tracks con `surface` no informada como «sin pavimentar» (supuesto preexistente); no se verifica transitabilidad real ni estado del camino.
- Nada se importó a la base real ni al demo `localhost:3206`; solo a la copia aislada.

## Cómo reproducir

```
cd services/geo-static
PYTHONPATH=src uv run python -m geo_static.jobs.calcular_aislamiento      # ~22 min, genera los 3 archivos v2
PYTHONPATH=src uv run pytest tests -q                                       # 115 tests
cd ../.. && node scripts/importar-geo-static.mjs --aislamiento services/geo-static/output/aislamiento_osm-v2-2026-09-26.csv \
  --geometria services/geo-static/output/accesos_osm_geometria-v2-2026-09-26.ndjson.gz
```

Requiere `services/geo-static/.data/osm/argentina-latest.osm.pbf` (gitignorado). Fuentes: © OpenStreetMap contributors (ODbL) y Georef
Argentina (datos.gob.ar; polígonos departamentales `departamentos-corrientes-georef-2026-09-27.geojson` y sedes en
`services/geo-static/data/cabeceras_departamentales.json`, consultadas el 2026-09-29).

## Commits

`28f937e` gate + sedes oficiales · `e7506d4` red track/service + motivos · `5a3ad99` snap a arista · `480f8f7` fords de nodo +
proyecciones vectorizadas · `1f5df6b` fix de orientación de aristas (detectado validando con el grafo real: sin él, 3–13 % de rutas
con longitud inconsistente) · `b917094` `version_job` 2 · `550a661` fix de lectura de fords (la lectura combinada devolvía 0 de 263) ·
`8eb8f06` artefactos v2.
