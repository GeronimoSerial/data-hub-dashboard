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

## QA de UX del mapa (2026-09-29)

Hallazgos del usuario y de N1 sobre `/mapas/infraestructura`, reproducidos en navegador real antes de tocar código y
resueltos en los commits `130bb1d`, `f65c653`, `6179218`, `78cf985` y `2a21b46`. Detalle y tareas en
`odd/tasks/mapa-accesos-qa-ux.md`.

- **Ficha breve:** tres líneas (acceso por camino, cruces de agua, inundación histórica en la escuela) y el botón
  "Ver recorrido"; la escala "n de 3", el período de retorno de 100 años, la metodología, las advertencias y las fuentes con
  fecha van en un único detalle secundario cerrado. La sección territorial pasó arriba de la ficha para que el botón se
  vea sin desplazarse.
- **Textos en lenguaje llano:** "Dificultad de acceso por caminos (0 a 3)" e "Inundación histórica por desborde de ríos".
  Las reglas de cada nivel salen de `calcular_indice_aislamiento`: 0 ruta de hasta 3 km sin cruces y con a lo sumo un
  tramo de tierra; 1 ningún cruce sin puente registrado pero trayecto no simple; 2 cruce sin puente registrado con camino
  que lo evita; 3 más de 20 km o cruce sin puente registrado sin alternativa; "No calculable" a más de 5 km del camino más
  cercano en OSM o sin conexión con la cabecera; "Sin dato" = la escuela no figura en el archivo importado (nunca es 0).
  physrisk es un modelo WRI Aqueduct con clima histórico, no un registro de inundaciones, no un pronóstico y no el
  trazado de un río.
- **Ficha y selección:** cerrar la ficha conserva la escuela (ruta, resaltado, leyenda) y ofrece "Ver ficha" y "Quitar
  selección". Elegir una escuela desde el buscador cierra los cajones en pantallas angostas y encuadra la ruta completa con
  el padding real de la columna y de la ficha. Una escuela sin coordenadas muestra su ficha y un aviso.
- **Capas accesibles:** con la ficha abierta el panel de capas pasa al botón "Capas" (a partir de 721 px) y queda por
  encima de la ficha al abrirlo; en 390 px el botón "Buscar escuelas" y el de pantalla completa suben sobre la hoja.
- **Íconos:** los íconos de acceso e inundación ya son interactivos (antes el clic caía en el departamento y lo filtraba);
  el cruce de agua abre un popup con su clase.
- **"Sin datos del padrón":** se refería al corte de Gestión Escolar (secciones y matrícula), no al padrón de escuelas.
  Ahora dice "Sin secciones ni matrícula en el corte vigente de Gestión Escolar." si la escuela figura en el padrón.
- **Leyenda:** tarjeta opaca, con el bloque de la escuela seleccionada primero y las explicaciones largas plegadas.

Verificación: `pnpm lint` 0, `tsc --noEmit` 0, `pnpm build` 0, vitest de `components`, `lib` y `app` 224 archivos / 2147
pruebas verdes; navegador real (Chromium headless con Playwright contra `:3206`) en 1440x900, 900x800 y 390x844, escuelas
`1800072-00` (con recorrido) y `1800585-00` (sin recorrido), modo claro y oscuro. Capturas en
`~/orca/demo-data/enos-accesos/qa-evidencia/` (fuera del repo).

Pendiente: no se probó el modo Radar con la ficha abierta; la hoja inferior de la ficha (721–1080 px) tapa la parte de abajo
de la columna izquierda, que se recupera cerrando la ficha; la selección por ícono no se probó con el punto de una escuela
con parte en cluster.

## Cómo regenerar

1. Desde `services/geo-static/`:

   ```
   PYTHONPATH=src uv run python -m geo_static.jobs.calcular_aislamiento
   ```

2. Desde la raíz del repo (aplicar antes la migración 0003):

   ```
   node scripts/importar-geo-static.mjs --aislamiento <csv> --geometria <ndjson.gz>
   ```
