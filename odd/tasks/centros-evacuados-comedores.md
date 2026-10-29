# centros-evacuados-comedores

Objective: marcar escuelas aptas como posibles centros de evacuados, ruta al más cercano, y saber qué escuelas tienen comedor.
Branch: `GeronimoSerial/centros-evacuados-comedores` (from origin/main). Delivery: work-unit commits, no push. Runner: `pnpm exec vitest run`.

## Specs
- S1 "Escuelas con menos riesgos (o nulo) marcarlos como posibles centros de evacuados." Apta = snapshot vigente (run `estado='vigente'`, operativo) con `evidenciaValida` y `nivelRiesgo === 'bajo'` en el horizonte por defecto de la capa de riesgo del mapa (72 h, `horizonteSeleccionado`); Y exposición histórica de sitio `claseRio` en {bajo, sin_riesgo} y de ruta de acceso `claseRuta` en {bajo, sin_riesgo}. Sin snapshot, null, `sin_dato`, `sin_ruta` o fila de exposición ausente = NO apta. Recalculada por un job DIARIO. Distinta del estado reportado `centro_evacuados`. (Assumption: sitio junto a laguna `juntoLaguna === true` también la excluye; sin coordenadas no es apta.)
- S2 "Marcar el camino hacia la escuela mas cercana (como un boton que permita mostrar el camino hacia)". Botón "Mostrar camino al centro de evacuados más cercano" en la ficha; dibuja la ruta con el patrón de `capas-accesos.tsx`, con nombre de destino y distancia. Escuelas aptas: badge "Posible centro de evacuados" y distinguibles en mapa/leyenda. Ruta por camino precomputada por el batch OSM (offline, Python) hacia los K candidatos estáticamente elegibles; el job diario elige el primero apto hoy. Sin ruta OSM: línea recta rotulada como tal. (Assumption: nada agenda geo-static a diario; por eso el batch OSM calcula K candidatos y el job diario Node resuelve cuál es el más cercano apto hoy.)
- S3 "sumar que escuelas brindan un servicio de comida o no ... la idea es saber que escuelas dan o no, no mucha mas informacion." Tabla + importador desde los dos xlsx (hoja PlanillaServicioComedor, título fila 1, encabezado fila 3, datos desde fila 4; clave `Cue-Anexo` con `normalizeCue`; servicio = Raciones Desayuno > 0 y/o Raciones Almuerzo > 0; CUEs repetidos se agregan sumando raciones; CUEs en ambos archivos se fusionan). Guarda sólo cue, desayuno, almuerzo, proveedor, fuente/fecha. Los xlsx NO se commitean. Documentar cómo correr el importador.
- S4 Ficha: "Comedor: desayuno y almuerzo / solo desayuno / solo almuerzo / sin servicio registrado"; chip "Con comedor" en `filtros-chips.tsx`.

## Tasks
- [x] T1 S3 comedores: tabla + migración + parser + importador + doc (inline) — d6b763d5
- [ ] T2 S1 aptitud: función pura + tabla + job diario + timer (inline)
- [ ] T3 S2 ruta: tipo geo `ruta-evacuacion` + job Python + endpoint + hook (inline)
- [ ] T4 S4/S2 UI: enriquecimiento escuelas, ficha, chip, badge, capa de ruta, leyenda (inline)

## Log
- L1 (user, 2026-10-29): "1. Escuelas con menos riesgos (o nulo) marcarlos como posibles centros de evacuados.
2. Marcar el camino hacia la escuela mas cercana (como un boton que permita mostrar el camino hacia)
3. y sumar que escuelas brindan un servicio de comida o no, ya que son doble riesgo, de pedagogia, y de servicio de comida ... la idea es saber que escuelas dan o no, no mucha mas informacion."
