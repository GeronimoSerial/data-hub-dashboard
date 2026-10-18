# Puntos de río sobre el cauce (2026-10-18)

Versión preparada de `puntos-rio`: `8ac2a28fa95015ce8380faab9cc7acf0b4f3e6de1b467d55a98d1a2402667bc2`
(revisión `cauce-ign-glofas-2026-10-18`). Está guardada en producción **sin publicar**.
La publicada sigue siendo `41de1aafe26a…` (revisión `inicial-2026-10-16`).
La entrada completa, con el criterio de cada punto, está en
[`puntos-rio-cauce-2026-10-18.json`](puntos-rio-cauce-2026-10-18.json).

## Problema

Los puntos vigentes son la celda de caudal máximo de un barrido de 0,1° alrededor
de cada localidad. Quedan lejos del cauce real y de la ciudad. `infra_geo_rio`
(job `asociacion-rio`) mide la distancia escuela → punto como si fuera la
distancia al río.

| Punto | Distancia actual al cauce IGN | Distancia actual a la ciudad | Distancia nueva a la ciudad | Caudal medio sep-2026, actual → nuevo (m³/s) |
|---|---|---|---|---|
| parana-ituzaingo | 0,79 km | 15,4 km | 12,0 km | 11.497 → 12.963 |
| parana-corrientes-paso-patria | 5,13 km | 9,0 km | 2,0 km | 14.097 → 13.710 |
| parana-bella-vista | 3,08 km | 24,1 km | 1,6 km | 14.082 → 14.070 |
| parana-goya | 2,27 km | 11,3 km | 5,5 km | 14.018 → 14.012 |
| parana-esquina | 0 (dentro) | 9,9 km | 9,7 km | 14.020 → 14.027 |
| uruguay-santo-tome | 4,02 km | 15,6 km | 6,5 km | 7.896 → 7.730 |
| uruguay-paso-de-los-libres | 8,17 km | 25,0 km | 2,0 km | 9.112 → 9.105 |
| uruguay-monte-caseros | 7,95 km | 22,4 km | 5,2 km | 9.053 → 9.323 |

## Regla de selección

1. Cauce: polígonos IGN `ign:areas_de_aguas_continentales_BH140`
   (`fna` = Río Paraná / Río Uruguay), WFS `https://wms.ign.gob.ar/geoserver/ows`.
2. Ciudad: cabecera del dataset `cabeceras-departamentales` (Georef).
3. Celdas GloFAS de 0,05° que cortan el cauce a ≤ 0,15° de la ciudad. Se pide a
   Open-Meteo Flood el caudal diario de septiembre de 2026 de cada celda.
4. Se aceptan las celdas con caudal medio ≥ 90 % del punto anterior, o sea, del cauce principal.
   Gana la celda cuyo tramo de cauce queda más cerca de la ciudad.
5. La coordenada es el centro del cruce del cauce dentro de esa celda, sobre la
   recta ciudad → orilla más cercana. Se comprobó que cada coordenada nueva cae en
   la celda GloFAS elegida: el caudal coincide exactamente.

## Por qué no se publicó

Con estos puntos, en el motor v0.3 (`resolverEvidenciaRio`, criterio
`punto_rio <= 3 km`, sin chequeo de terreno) cambian 133 de 2.005 escuelas:

- 113 pasan de no expuestas a expuestas.
- 20 pasan de `ruta_rp100` a `punto_rio`: cambia la etiqueta, no la exposición.
- Por localidad, sobre los 133 cambios: Corrientes 79, Bella Vista 22,
  Paso de los Libres 32.

Publicarla también mueve las celdas que consultan `sync-pronostico-caudal` y la
climatología de caudal.

## Pasos para publicar (cuando el motor lo decida)

1. Publicar la versión:
   `node scripts/datasets-infraestructura.mjs publicar puntos-rio 8ac2a28f…`.
   Ojo: el script corre `migrarDb()`.
2. Recalcular `infra_geo_rio` con el job `asociacion-rio`.
3. Recalcular la climatología de caudal con una versión nueva (por ejemplo
   `caudal-climatologia-v0.2`). La `v0.1` corresponde a las celdas anteriores.

## C: distancia al agua (preparado, sin importar)

`distancia_agua_m` y `altura_sobre_agua_m` eran nulas en 1.808 de 2.001
escuelas porque el lector buscaba agua sólo dentro de 300 m. El criterio del
motor llega a 1.000 m. Con el radio extendido (commit `8abc263e`):

- 710 escuelas pasan a tener distancia.
- 455 cumplen distancia ≤ 1.000 m y altura ≤ 10 m.
- `junto_laguna` no cambia en ninguna escuela.

En el motor v0.3 cambian 31 escuelas: 24 pasan de no expuestas a expuestas, 5
quedan sin dato y 2 cambian de etiqueta. Ninguna está en Paso de los Libres.

El CSV corregido (`inundacion_v2-v1-2026-10-18.csv`) se generó fuera del
repositorio y no se importó. Además difiere en `margen_rp*` en unas 20 escuelas,
por diferencias de ráster o de coordenadas, no por este cambio.
