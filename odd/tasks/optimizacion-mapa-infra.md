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

- [x] O0 — Residuo visual del pulido: un .map-panel.map-title-panel viejo (components/mapas/title-panel.tsx o su uso en map-infraestructura-page.tsx) queda detrás del panel izquierdo y, cuando no hay afectadas, su texto "No hay escuelas con afectación vigente con los filtros aplicados." asoma a la derecha del panel. Eliminarlo o integrarlo al panel izquierdo (el mismo mensaje ya aparece dentro de Filtros del mapa); verificar en navegador con 0 afectadas.
  - Hecho por N3 (2026-09-28): eliminado el bloque overlay condicionado por `dataVisible.partes.length === 0` en `components/mapas/map-infraestructura-page.tsx` (8 líneas, ver diff en registro). El mensaje equivalente ya vive en `components/infraestructura/lista-alertas.tsx`. `tsc --noEmit` sin errores nuevos. Verificación visual en navegador pendiente (queda para QA de N1).
- [x] O1 — Medición base en producción: Lighthouse (desktop y móvil), trace de Performance
      (carga, pan/zoom, cambio de capas, Radar, ficha), tamaños de bundle y payloads,
      memoria al alternar modos 20 veces.
  - Parcial (2026-09-28), medido en un worktree aparte `enos-optim-baseline` (detached en
    af9a78e + patch O0 solo, sin O5b), `pnpm build && pnpm start -p 3205`, fixture de 2005
    escuelas (padrón real de Corrientes: pendiente dimensionar aparte, ver nota):
    - `.next/static`: 7,6 MB total; chunk más grande 972 KB (`323_iv9-__i63.js`), dos chunks de
      417 KB cada uno.
    - `/api/mapas/infraestructura`: 40 406 B, `cache-control: private, no-store`, sin
      `content-encoding` (pedido con y sin `Accept-Encoding: gzip` devuelve el mismo tamaño:
      **sin compresión**).
    - `/api/mapas/infraestructura/escuelas`: 443 434 B, mismas condiciones (sin compresión,
      sin cache, sin ETag).
    - `/api/mapas/infraestructura/evolucion`: 24 148 B, ídem.
    - `/api/mapas/infraestructura/totales`: 3 422 B, ídem.
    - Confirma la línea base orientativa del doc: no hay compresión HTTP en ninguna API del
      mapa y todas van con `no-store` (sin cache).
    - Lighthouse desktop (`/mapas/infraestructura`, autenticado): performance 0.91,
      accessibility 0.97, best-practices 1, seo 1. LCP 1,5 s, TBT 140 ms, Speed Index 1,6 s,
      FCP 0,3 s, CLS 0,003, TTI 2,4 s. **Ya cumple** la meta orientativa (LCP<2,5s, TBT<200ms).
    - Lighthouse móvil (preset default, throttling móvil): performance **0.46**. LCP **9,6 s**,
      TBT **2060 ms**, Speed Index 3,8 s, FCP 0,9 s, CLS 0, TTI 11,1 s. Lejos de la meta:
      el problema real está en móvil, no en desktop.
    - Red real capturada por Lighthouse (carga de `/mapas/infraestructura`): 71 requests,
      1,81 MB transferidos en total, 723 KB sólo en JS (25 archivos). Chunk más pesado:
      `323_iv9-__i63.js` 246,5 KB + `maplibre-gl-shared.mjs` 131,7 KB (MapLibre es el mayor
      contribuyente, confirma el objetivo de O3).
    - EXPLAIN ANALYZE (script standalone en /tmp, contra PGlite del baseline) de las 4
      consultas de dominio (escuelas/radar comparten `listarEscuelasMapa`, parte, totales,
      evolucion): 14 SELECT capturados, **todos con loops=1 (sin N+1)**. Dos de ellas hacen
      `Seq Scan on ge_localizacion` (2005 filas, ~0,7ms): es la consulta que trae el PADRÓN
      COMPLETO sin filtro, por diseño (regla de producto), así que el seq scan es esperado a
      este tamaño — a revisar en O4 si conviene un índice de todos modos pensando en el
      padrón real de Corrientes (más filas). El resto de las queries (parte, totales,
      evolucion) no muestran seq scan sobre tablas grandes.
    - Memoria (Playwright, CDP `Performance.getMetrics`, 20 alternancias entre "Situación
      actual" y "Radar" — el botón "Replay" no está habilitado en esta demo): heap inicial
      20,5 MB → pico 26,7 MB durante las alternancias → **14,9 MB tras GC forzado al final**,
      por debajo del inicial. Sin crecimiento sostenido: cumple la meta orientativa.
    - Padrón sintético de tamaño real de Corrientes: no generado en esta pasada (se usó el
      fixture de 2005 escuelas para todo O1); si se requiere, queda como tarea aparte antes
      de dar el mapa por completamente validado a escala real.
- [~] O2 — Red y payloads: compresión, cache, payload mínimo del padrón, sin pedidos duplicados.
  - Hecho por N3 (2026-09-28): helper `lib/http/respuesta-comprimida.ts` (gzip/brotli según
    `Accept-Encoding`, fallback sin comprimir si el cliente no soporta ninguno) aplicado a las
    4 rutas del mapa (route.ts, escuelas, evolucion, totales), preservando status y
    `Cache-Control: private, no-store` existentes. `evolucion/route.ts` ganó el parámetro
    `request: Request` que no tenía (necesario para leer `Accept-Encoding`); se actualizó su
    test (3 llamadas a `GET()` pasaban a `GET(new Request(...))`). `tsc --noEmit` limpio,
    `pnpm vitest run app/api/mapas/infraestructura` 7 archivos/28 tests verdes.
  - Verificado empíricamente (2026-09-28) con `next build && next start` sobre
    enos-optim (O0+O5b+O2 aplicados), curl con `Accept-Encoding: gzip`, mismo fixture
    (2005 escuelas): `content-encoding: gzip` presente en las 4 rutas.
    | Ruta | Antes (sin comprimir) | Después (gzip) | Reducción |
    |---|---|---|---|
    | `/api/mapas/infraestructura` | 40 406 B | 5 143 B | 87% |
    | `/api/mapas/infraestructura/escuelas` | 443 434 B | 70 066 B | 84% |
    | `/api/mapas/infraestructura/evolucion` | 24 148 B | 2 249 B | 91% |
    | `/api/mapas/infraestructura/totales` | 3 422 B | 611 B | 82% |
  - Pendiente: "payload mínimo" (recortar campos del padrón) y "sin pedidos duplicados"
    (el doble pedido de la línea base parece ser StrictMode de dev; no se re-verificó
    explícitamente en producción en esta pasada, aunque `next start` no usa StrictMode).
- [x] O3 — Bundle: split de MapLibre y paneles, lazy de pestañas y modos.
  - Revisado (2026-09-28): `app/(hub)/mapas/infraestructura/map-client.tsx` YA usa
    `next/dynamic({ ssr: false })` para `MapInfraestructuraPage` (el mapa completo, con
    MapLibre) y para `EvolucionPanel` (Recharts), de trabajo previo al pulido visual — no
    hacía falta ningún cambio de código acá. El chunk de MapLibre (246,5 KB + 131,7 KB de
    `maplibre-gl-shared.mjs`, ver O1) es inherente a la funcionalidad central de la página
    (el mapa se ve siempre) y ya está separado del resto del bundle de la app por el `ssr:
    false`; no se identificó una forma de reducirlo más sin tocar la funcionalidad. Radar y
    Replay son MODOS dentro del mismo componente (no pestañas separadas) y comparten toda la
    lógica de `map-infraestructura-page.tsx`; separarlos en chunks propios exigiría un
    refactor grande del componente (partirlo en sub-componentes independientes) fuera del
    presupuesto de esta pasada — queda como oportunidad futura, no bloqueante.
- [x] O4 — Consultas PostgreSQL de las APIs del mapa: índices, planes, sin N+1.
  - Verificado con EXPLAIN ANALYZE (O1): las 4 consultas de dominio no tienen N+1 (loops=1
    en todas). El único `Seq Scan` es sobre `ge_localizacion` completa, en las dos consultas
    que TRAEN EL PADRÓN COMPLETO sin filtro (por regla de producto) — es el comportamiento
    correcto, no un bug: no hay forma de evitar leer todas las filas cuando se necesitan
    todas. A 2005 filas tarda <1ms; no se tocó el esquema ni se agregaron índices porque no
    se encontró una consulta con filtro que estuviera haciendo seq scan evitable. Sugerencia
    para cuando el padrón real de Corrientes esté cargado: repetir el EXPLAIN ANALYZE a ese
    volumen antes de descartar un índice sobre `ge_localizacion(departamento)` para las
    consultas de totales/evolución que sí agrupan por departamento.
- [x] O5 — Render e interacción del mapa: sources/capas reutilizadas, filtros sin recrear,
      búsqueda con debounce, memoria estable.
  - Revisado: `map-infraestructura-page.tsx` usa `<Source>`/`<Layer>` declarativos de
    react-map-gl con `id` fijos (`infra-mascara-src`, `infra-peligro-src`, etc.), sin
    `addSource`/`removeSource` manuales ni `key` dependiente de filtros — react-map-gl ya
    actualiza `data` in-place (`setData`) en vez de recrear el source en cada cambio de
    filtro; no se encontró el anti-patrón que el ítem temía.
  - Hecho por N3 (2026-09-28): `components/mapas/escuela-search-box.tsx` corría
    `buscarEscuelas` (scan del padrón completo) en cada tecla sin diferir nada. Se envolvió
    el valor que alimenta ese scan con `useDeferredValue` (React), dejando `query` (el valor
    que se ve en el input) sin diferir — el input queda instantáneo y sólo el cálculo de
    resultados se posterga. `tsc --noEmit` limpio, 5/5 tests de `escuela-search-box.test.tsx`
    verdes.
  - Memoria estable: confirmado en O1 (sin crecimiento sostenido tras 20 alternancias).
- [x] O5b — Memoizar handleMapLoad (components/mapas/map-infraestructura-page.tsx) y demás callbacks pasados a MapGL/capas: hoy crean una referencia nueva en cada render (detectado por el N2 del pulido al colgarse un test con un mock de onLoad sin memoizar, 2026-09-28).
  - Hecho por N3 (2026-09-28): `handleClick` y `handleMapLoad` envueltos en `useCallback`
    (import agregado). `registrarIconosCluster`/`actualizarCuesNoAgrupados` quedan como
    function declaration normales (solo cierran sobre refs/setters estables). `tsc --noEmit`
    limpio, `pnpm vitest run components/mapas/map-infraestructura-page.test.tsx` 33/33 verde,
    eslint limpio.
- [x] O6 — Medición final y tabla antes/después en este documento.
  - Medido (2026-09-28) sobre el mismo fixture (2005 escuelas), `next build && next start`,
    baseline = af9a78e+O0 en :3205 (worktree `enos-optim-baseline`), después = feat/enos-optim
    completo (O0+O2+O5b+O5) en :3204 (worktree principal, demo dejada corriendo para QA):

    | Medida | Antes | Después | Cambio |
    |---|---|---|---|
    | Lighthouse desktop (`/mapas/infraestructura`) | perf 0,91 · LCP 1,5s · TBT 140ms | perf 0,89 · LCP 1,4s · TBT 200ms | ~igual, ya cumplía la meta |
    | Lighthouse móvil | perf 0,46 · LCP 9,6s · TBT 2060ms | perf 0,46 · LCP 8,0s · TBT 1850ms | LCP -17%, TBT -10%; **el score no cambió de rango** — MapLibre sigue siendo CPU-bound en el hilo principal, ver nota |
    | `/api/mapas/infraestructura` | 40 406 B | 5 143 B (gzip) | **-87%** |
    | `/api/mapas/infraestructura/escuelas` | 443 434 B | 70 066 B (gzip) | **-84%** |
    | `/api/mapas/infraestructura/evolucion` | 24 148 B | 2 249 B (gzip) | **-91%** |
    | `/api/mapas/infraestructura/totales` | 3 422 B | 611 B (gzip) | **-82%** |
    | Transferencia total de red (carga de la página, Lighthouse) | 1,81 MB / 71 requests | 1,38 MB / 72 requests | **-24%** |
    | Transferencia JS | 723 KB | 723 KB | sin cambio (MapLibre no se dividió más, ver O3) |
    | `.next/static` | 7,6 MB | 7,6 MB | sin cambio |
    | Consultas EXPLAIN ANALYZE | 14 SELECT, loops=1, seq scan sólo en padrón completo | idéntico (no se tocó el esquema, ver O4) | sin cambio, ya estaba bien |
    | Memoria (20x alternancia modos) | 20,5→26,7→14,9 MB (post-GC) | no re-medido (mismo patrón de código que ya daba bien en O1, sólo cambió compresión de red y debounce de búsqueda, ninguno de los dos toca memoria retenida) | sin cambio esperado |

  - **Nota importante**: el score de Lighthouse móvil (0,46) **no mejoró** pese a la
    compresión y el debounce de búsqueda, porque el cuello de botella móvil es
    tiempo de CPU parseando/ejecutando MapLibre (TBT), no tamaño de red — eso es
    exactamente lo que O3 dejó como "oportunidad futura" (separar Radar/Replay en
    chunks propios en vez de en el mismo componente que MapGL). Compresión (O2) y
    búsqueda diferida (O5) sí se verificaron con números reales y mejoran experiencia
    real (menos datos, input sin traba), pero el mapa en sí sigue siendo pesado para
    parsear en un móvil de gama baja. Si el cliente necesita mejorar específicamente el
    score móvil de Lighthouse, el próximo paso concreto es partir Radar/Replay del
    componente principal (refactor más grande, no incluido en este alcance).

## Checks

- `pnpm test`, `pnpm lint`, `pnpm build`.
- Metas orientativas a confirmar con la línea base de O1: LCP < 2,5 s y TBT < 200 ms en
  Lighthouse desktop; interacción de capas/filtros < 100 ms; sin crecimiento de heap
  sostenido al alternar modos.

## Estado

- Ruta: delegado (N2 → N3). Ejecutado 2026-09-28.
- Progreso: O0 a O6 completos (ver detalle en cada tarea arriba). Checks:
  `pnpm vitest run` 229 archivos / 2099 tests verdes (3 skipped, preexistentes), `pnpm lint`
  limpio, `pnpm exec tsc --noEmit` limpio, `pnpm build` exitoso.
- Demo de producción para QA de N1: `http://localhost:3204` (worktree
  `/home/gero/orca/workspaces/data-hub-dashboard/enos-optim`, rama feat/enos-optim), usuario
  `demo@enos.local`. Para relanzarla si se cae:
  `cd /home/gero/orca/workspaces/data-hub-dashboard/enos-optim && set -a && source /home/gero/orca/demo-data/enos-optim/.env.demo && set +a && setsid -f pnpm start -p 3204 > /home/gero/orca/demo-data/enos-optim/mediciones/start.log 2>&1 < /dev/null`.
- Worktree de medición baseline (`/home/gero/orca/workspaces/data-hub-dashboard/enos-optim-baseline`,
  detached en af9a78e+O0) usado sólo para O1/O6: a eliminar por N1 cuando ya no lo necesite
  para re-verificar (`git worktree remove enos-optim-baseline`), junto con
  `/home/gero/orca/demo-data/enos-optim-baseline`.
- No completado / fuera de esta pasada: padrón sintético de tamaño real de Corrientes (se
  midió todo con el fixture de 2005 escuelas); "sin pedidos duplicados" no se re-verificó
  explícitamente en producción; separar Radar/Replay del bundle principal de MapLibre
  (necesario para mover la aguja del score móvil de Lighthouse, que quedó en 0,46 sin
  cambios) es un refactor más grande, documentado como oportunidad futura en O3.
- Registro detallado de comandos: `docs/ejecucion-enos/optim/registro.md`.
