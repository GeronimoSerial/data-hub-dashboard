# Optimización transversal del mapa de infraestructura

## Objetivo

Que `/mapas/infraestructura` (Operativa, Radar, Evolución y ficha de escuela) sea rápido y
fluido para el cliente: carga inicial, interacción con el mapa, capas, filtros, búsqueda y
ficha. Optimización transversal: cliente, API, consultas y red.

## Orden

Último N2 de la cadena: DB1 → pulido visual (`odd/tasks/pulido-visual-mapa.md`) → integración de main → optimización. Parte de feat/renovación en 692f27d: código pulido, sobre PostgreSQL y con main integrado (mapa de natalidad, roles).

## Línea base (2026-09-28, `next dev`, demo ficticia, 2005 escuelas del fixture)

Solo orientativa: dev no minifica ni comprime. El N2 debe re-medir con `next build && next start`.

| Medida | Valor |
|---|---|
| Recursos en carga inicial | 76 |
| JS transferido (dev) | ≈ 1,0 MB |
| `/api/mapas/infraestructura/escuelas` | 446 KB JSON, sin compresión visible |
| `/api/mapas/infraestructura` | 40 KB |
| `/api/mapas/infraestructura/evolucion` | 24 KB |
| `/api/mapas/infraestructura/totales` | 3,4 KB |
| APIs del mapa | cada una pedida 2 veces en la carga (confirmar si es solo StrictMode de dev) |
| JS heap usado | ≈ 152 MB |
| Latencia de API local | 10–50 ms |

El padrón real de Corrientes es mayor que el fixture: dimensionar para el padrón completo
(regla de producto: el mapa siempre muestra todas las escuelas, totales por departamento y
búsqueda).

## Alcance

- Carga: code splitting de MapLibre y paneles pesados, lazy de Evolución/Radar, prefetch
  razonable, fuentes y assets.
- Datos: payload del padrón (campos mínimos, compresión, cache HTTP/ETag, vector tiles o
  GeoJSON compacto si conviene), eliminar pedidos duplicados, deduplicar/cachear en cliente,
  no recalcular totales en cada render.
- API y consultas (PostgreSQL post-DB1): índices y planes (`EXPLAIN ANALYZE`) de las
  consultas del mapa, totales, evolución, radar y ficha; sin N+1.
- Interacción: clustering y capas sin jank (fuentes y capas MapLibre reutilizadas, sin
  re-crear sources en cada cambio de filtro), búsqueda con debounce e índice, tooltip y ficha
  sin re-render global del mapa, memoria estable al alternar modos y capas.
- Fuera de alcance: jobs, ingesta, Open-Meteo (no consumir cupo: `ENOS_JOBS_ENABLED=false`),
  resto del hub.

## Restricciones

- Sin regresiones funcionales ni visuales del pulido; tests existentes verdes.
- Cada optimización con medición antes/después en build de producción; nada "por intuición".
- Mantener la regla de padrón completo, totales por departamento y búsqueda.

## Tareas

- [ ] O0 — Residuo visual del pulido: un .map-panel.map-title-panel viejo (components/mapas/title-panel.tsx o su uso en map-infraestructura-page.tsx) queda detrás del panel izquierdo y, cuando no hay afectadas, su texto "No hay escuelas con afectación vigente con los filtros aplicados." asoma a la derecha del panel. Eliminarlo o integrarlo al panel izquierdo (el mismo mensaje ya aparece dentro de Filtros del mapa); verificar en navegador con 0 afectadas.
- [ ] O1 — Medición base en producción: Lighthouse (desktop y móvil), trace de Performance
      (carga, pan/zoom, cambio de capas, Radar, ficha), tamaños de bundle y payloads,
      memoria al alternar modos 20 veces.
- [ ] O2 — Red y payloads: compresión, cache, payload mínimo del padrón, sin pedidos duplicados.
- [ ] O3 — Bundle: split de MapLibre y paneles, lazy de pestañas y modos.
- [ ] O4 — Consultas PostgreSQL de las APIs del mapa: índices, planes, sin N+1.
- [ ] O5 — Render e interacción del mapa: sources/capas reutilizadas, filtros sin recrear,
      búsqueda con debounce, memoria estable.
- [ ] O5b — Memoizar handleMapLoad (components/mapas/map-infraestructura-page.tsx) y demás callbacks pasados a MapGL/capas: hoy crean una referencia nueva en cada render (detectado por el N2 del pulido al colgarse un test con un mock de onLoad sin memoizar, 2026-09-28).
- [ ] O6 — Medición final y tabla antes/después en este documento.

## Checks

- `pnpm test`, `pnpm lint`, `pnpm build`.
- Metas orientativas a confirmar con la línea base de O1: LCP < 2,5 s y TBT < 200 ms en
  Lighthouse desktop; interacción de capas/filtros < 100 ms; sin crecimiento de heap
  sostenido al alternar modos.

## Estado

- Ruta: delegado (N2 → N3), a lanzar al terminar el pulido visual.
- Progreso: línea base orientativa tomada; implementación pendiente.
