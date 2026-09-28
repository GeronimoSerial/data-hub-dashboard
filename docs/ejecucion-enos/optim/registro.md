# Optimización mapa infraestructura — Registro de ejecución

Base: `af9a78e` (feat/enos-optim), sobre feat/renovación con pulido visual + PostgreSQL + main
integrados. Documento de tareas: `odd/tasks/optimizacion-mapa-infra.md` (O0-O6).

Rol: N2 (sonnet) coordinando N3 (`opencode-go/deepseek-v4.1-flash`, sin MCP). Toda edición de
código la aplicó un N3, con comandos literales (leído/decidido por el N2, aplicado por el N3)
tras confirmar que el N3 se cuelga sin producir nada cuando la tarea exige leer/razonar sobre
varios archivos a la vez (4 timeouts de 560s confirmados con tareas multi-paso; funciona
confiable con un comando o un contenido de archivo exacto por llamada).

## Hallazgo de entorno

- `chrome-devtools-mcp` usa un perfil de Chrome compartido entre sesiones Orca; estaba en uso
  por la sesión de QA de N1 durante toda la ejecución. Las mediciones de Lighthouse y memoria
  se hicieron con herramientas con su propio Chromium (CLI `lighthouse@12` vía npx, y
  Playwright vía un `npm install` local en `/tmp/claude-1000/pw-mem`), nunca con
  chrome-devtools-mcp.
- Lanzar procesos en background (servidor de demo) desde el sandbox del N3 se cuelga 560s sin
  producir salida (confirmado con `setsid -f` funcionando instantáneo en el shell del N2 pero
  colgándose siempre en el N3). El N2 levantó/apagó los servers de demo directamente (son
  operaciones de infraestructura, no ediciones de código); el N3 se usó para instalar deps,
  compilar, migrar código, correr tests/lint/tsc/build y aplicar cambios.

## Comandos y resultados

### O0 — Residuo visual (overlay duplicado)

- N3 eliminó el bloque `{dataVisible && dataVisible.partes.length === 0 && (...)}` en
  `components/mapas/map-infraestructura-page.tsx` (8 líneas). Verificado con
  `pnpm exec tsc --noEmit` (sin errores nuevos) y lectura del diff (`git diff`).

### O1 — Medición base (worktree `enos-optim-baseline`, detached en af9a78e+O0)

```
git worktree add ../enos-optim-baseline af9a78e
git apply /tmp/claude-1000/o0-only.patch   # sólo el diff de O0, no O5b
pnpm install
pnpm build   # NODE_ENV=production, .env.demo en /home/gero/orca/demo-data/enos-optim-baseline
pnpm start -p 3205
node scripts/sync-ge.mjs --fixture
DEMO_OK=1 node scripts/seed-demo-partes.mjs
```

- Login: `POST /api/auth/sign-in/email` con `demo@enos.local` / password generado en
  `.env.demo` (600, nunca impreso).
- Payloads (curl, con/sin `Accept-Encoding: gzip`): ver tabla en O2 del doc de tareas. Sin
  compresión, `cache-control: private, no-store`, `Transfer-Encoding: chunked` en las 4 APIs.
- Bundle: `.next/static` 7,6 MB; red real capturada por Lighthouse: 71 requests, 1,81 MB
  total, 723 KB JS (chunk mayor MapLibre 246,5 KB + `maplibre-gl-shared.mjs` 131,7 KB).
- Lighthouse: `npx lighthouse@12 <url> --chrome-flags="--headless=new --user-data-dir=..."
  --preset=desktop --extra-headers='{"Cookie":"..."}'` (y sin `--preset` para el perfil
  móvil default). Desktop: perf 0,91, LCP 1,5s, TBT 140ms. Móvil: perf 0,46, LCP 9,6s,
  TBT 2060ms.
- EXPLAIN ANALYZE: script standalone `/tmp/claude-1000/explain-mapa-queries.mjs` (no vive en
  el repo), instrumenta `getRawClient().query` para capturar el SQL real que emite
  `listarEscuelasMapa`, `listarPartesVigentes`, `obtenerEvolucionMapa`, `obtenerTotalesMapa`,
  y corre `EXPLAIN ANALYZE` sobre cada SELECT capturado. 14 queries, todas `loops=1` (sin
  N+1); único `Seq Scan` sobre `ge_localizacion` completa (2005 filas, ~0,7ms) en las
  consultas que traen el padrón sin filtro — esperado por regla de producto.
- Memoria: script standalone `/tmp/claude-1000/mem-toggle.mjs` (Playwright + CDP
  `Performance.getMetrics`), 20 alternancias entre "Situación actual" y "Radar" (el botón
  "Replay" no está habilitado en esta demo). Heap 20,5→26,7 MB en el pico→14,9 MB tras GC
  forzado al final (por debajo del inicial, sin crecimiento sostenido).

### O2 — Compresión

- Helper nuevo `lib/http/respuesta-comprimida.ts` (gzip/brotli según `Accept-Encoding`,
  fallback sin comprimir). Aplicado a las 4 rutas del mapa; `evolucion/route.ts` ganó el
  parámetro `request: Request` que no tenía. Test de esa ruta actualizado (3 llamadas a
  `GET()` → `GET(new Request(...))`).
- Verificación: `pnpm exec tsc --noEmit` limpio, `pnpm vitest run app/api/mapas/infraestructura`
  7 archivos / 28 tests verdes.
- Verificación empírica en producción (worktree principal, :3204, mismo fixture): gzip
  presente en las 4 rutas, reducciones de 82% a 91% según el payload (ver tabla en O6 del doc
  de tareas).

### O3 — Bundle

- `MapInfraestructuraPage` y `EvolucionPanel` ya estaban con `next/dynamic({ ssr: false })`
  desde trabajo previo (pulido visual); no hizo falta cambio de código. Documentado como
  oportunidad futura: separar Radar/Replay del bundle principal de MapLibre (refactor mayor,
  fuera de este alcance) para mover la aguja del TBT/LCP móvil.

### O4 — Consultas PostgreSQL

- Verificado con el mismo script de EXPLAIN ANALYZE de O1: sin N+1, seq scan esperado. No se
  tocó el esquema ni se agregaron índices (no se encontró una consulta filtrada haciendo seq
  scan evitable a este volumen).

### O5 — Render/interacción

- Revisión de `<Source>`/`<Layer>` en `map-infraestructura-page.tsx`: ids fijos, sin
  `addSource`/`removeSource` manual — react-map-gl ya actualiza `data` in-place, sin
  recrear sources en cada cambio de filtro.
- N3 agregó `useDeferredValue` en `components/mapas/escuela-search-box.tsx` para diferir el
  scan de `buscarEscuelas` sin bloquear el input. `tsc --noEmit` limpio, 5/5 tests verdes.

### O5b — Memoización de callbacks

- N3 envolvió `handleClick` y `handleMapLoad` en `useCallback` en
  `components/mapas/map-infraestructura-page.tsx`. `tsc --noEmit` limpio,
  `pnpm vitest run components/mapas/map-infraestructura-page.test.tsx` 33/33 verde, eslint
  limpio.

### O6 — Medición final

- Repetición de Lighthouse desktop/móvil y de la captura de red sobre el worktree principal
  (:3204, mismo fixture). Tabla completa antes/después en `odd/tasks/optimizacion-mapa-infra.md`.
- Hallazgo honesto: el score móvil de Lighthouse (0,46) no cambió de rango pese a las mejoras
  de red — el cuello de botella móvil es tiempo de CPU (TBT) parseando/ejecutando MapLibre,
  no tamaño de payload. Documentado como próximo paso si el cliente lo prioriza.

### Verificación final (worktree principal, enos-optim)

```
pnpm exec tsc --noEmit --pretty false         # limpio
pnpm vitest run --maxWorkers=2                # 229 archivos / 2099 tests, 3 skipped, todo verde
pnpm lint                                     # eslint . — sin salida, sin errores
NODE_ENV=production pnpm build                # exitoso
```

### Demo de QA (:3204)

- `DATA_DIR=/home/gero/orca/demo-data/enos-optim`, `.env.demo` (600) con las flags de
  producto en `true`, `ENOS_JOBS_ENABLED=false`.
- Sembrada con `scripts/sync-ge.mjs --fixture` + `DEMO_OK=1 node scripts/seed-demo-partes.mjs`
  (2005 escuelas del fixture, 47 con parte vigente).
- Levantada en producción (`pnpm build && pnpm start -p 3204`), dejada corriendo. Relanzar con:
  ```
  cd /home/gero/orca/workspaces/data-hub-dashboard/enos-optim
  set -a; source /home/gero/orca/demo-data/enos-optim/.env.demo; set +a
  setsid -f pnpm start -p 3204 > /home/gero/orca/demo-data/enos-optim/mediciones/start.log 2>&1 < /dev/null
  ```
- Usuario: `demo@enos.local` (password en `.env.demo`, 600, nunca impreso).

### Pendiente / fuera de esta pasada

- Padrón sintético de tamaño real de Corrientes (todo se midió con el fixture de 2005
  escuelas).
- Re-verificación explícita de "sin pedidos duplicados" en producción (la línea base sugiere
  que el doble pedido era StrictMode de dev).
- Separar Radar/Replay del bundle de MapLibre para mejorar el score móvil de Lighthouse
  (refactor mayor).
- Worktree `enos-optim-baseline` y `/home/gero/orca/demo-data/enos-optim-baseline`: quedan
  para que N1 los revise antes de eliminarlos (`git worktree remove enos-optim-baseline`).
