# Posibles centros de evacuados y camino al más cercano

Sugerencia calculada, distinta del estado reportado `centro_evacuados` de los partes.

## Qué es "posible centro de evacuados"
Una escuela es apta cuando se cumplen TODAS estas condiciones (cualquier dato ausente, `sin_dato` o `sin_ruta` la deja NO apta):
- Tiene coordenadas.
- Snapshot de la corrida vigente del motor de riesgo (operativa), horizonte 72 h (el horizonte por defecto de la capa de riesgo del mapa): `evidencia_valida` y `nivel_riesgo = 'bajo'`.
- Exposición histórica del sitio (`clase_rio`) `bajo` o `sin_riesgo`, y no está junto a una laguna.
- Exposición histórica de la ruta de acceso (`clase_ruta`) `bajo` o `sin_riesgo`.

Reglas en `lib/infraestructura/evacuacion/aptitud.ts`.

## Job diario `centros-evacuados`
`node scripts/jobs.mjs centros-evacuados` (timer `deploy/systemd/ops1/enos-ops1-centros-evacuados.timer`, 03:20 UTC, después de `calcular-riesgo`). Recalcula `infra_centro_evacuados`: una fila por escuela con `apto`, motivo si no lo es y el destino (otra escuela apta) más cercano. Si hay rutas por camino precomputadas, gana el primer candidato que hoy sigue apto; si no, la apta más cercana en línea recta.

## Rutas por camino (batch OSM, offline)
Nada agenda geo-static a diario, así que el batch calcula, por escuela, las rutas OSM hacia sus K=5 destinos más cercanos entre las elegibles por exposición ESTÁTICA (no mira el riesgo vigente). El job diario elige cuál sigue apto hoy.

```bash
# desde services/geo-static/, con DATABASE_URL y el extracto .data/osm/argentina-latest.osm.pbf
PYTHONPATH=src uv run python -m geo_static.jobs.calcular_ruta_evacuacion
# con GEO_STATIC_EXPORT_FILES=1 además escribe output/rutas_evacuacion_osm-v1-AAAA-MM-DD.ndjson.gz; para importarlo
node scripts/importar-geo-static.mjs --ruta-evacuacion rutas_evacuacion_osm-v1-AAAA-MM-DD.ndjson.gz
```
Publica el tipo geo `ruta-evacuacion` (tabla `infra_ruta_evacuacion_osm`). La ruta arranca y termina en el nodo de la red vial más cercano a cada escuela. Sin ruta para el destino elegido, la ficha dibuja una línea recta rotulada como tal.

## Ficha y mapa
- Botón "Mostrar camino al centro de evacuados más cercano" (`GET /api/mapas/infraestructura/accesos/[cueAnexo]/centro-evacuados`, a demanda).
- Anillo verde en el mapa (zoom 8+) y entrada "Posible centro de evacuados" en la leyenda.
- Servicio de comedor: ver `docs/importar-comedores.md`; filtro "Con comedor".
