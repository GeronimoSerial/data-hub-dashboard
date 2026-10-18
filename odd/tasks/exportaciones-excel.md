# Exportaciones Excel

## Objective
Download institutional Excel (.xlsx) lists of schools by state, honoring the map filters.

## Problem / why
Staff need school lists (afectadas, sin clases, con clases, asistidas, en riesgo) as spreadsheets with the ministry branding. No xlsx library or school-list export exists today.

## Scope
- Stage 1 types: `afectadas`, `sin-clases` (clases !== 'normal'), `con-clases` (clases === 'normal'), `asistidas` (apoyo pedagógico), `en-riesgo` (radar logic, `lib/infraestructura/mapa/radar.ts`).
- Filters: same as the map (`FiltrosMapa`, `lib/infraestructura/mapa/filtrar.ts`): departamento, dirección (nivel jurisdiccional), clases, apoyo, gravedad, q.
- Out of scope (stage 2): `bajo-lluvia` (needs rain grid × school coordinates).

## Constraints
- Library: `exceljs`, server side only.
- Fonts: Arial only (Excel does not embed fonts). Colors from `app/globals.css` tokens.
- Logo: `public/marca/escudo.png` (ExcelJS cannot embed SVG).
- Respect role scope (`lib/infraestructura/alcance-mapa.ts`) exactly like `app/api/mapas/infraestructura/escuelas/route.ts`.
- Workers: Haiku, under 100k tokens each (user instruction).

## Tasks
- [x] T1 — `exceljs` dependency + `lib/exportaciones/libro-institucional.ts`: generic institutional workbook builder (escudo, title, generated date, applied filters, styled header row, frozen header, autofilter, zebra rows, column widths, print setup). Unit tests.
- [x] T2 — `lib/exportaciones/escuelas.ts`: export type catalog (predicate + columns + title per type) over `EscuelaMapaEnriquecida`; en-riesgo uses radar logic. Unit tests.
  - Evidence: RED observed (module missing). GREEN: `pnpm vitest run lib/exportaciones` → 2 files, 18 passed. `pnpm tsc --noEmit -p .` → exit 0. `pnpm eslint lib/exportaciones` → exit 0.
  - Afectada = `escuela.parte !== undefined` (the enriched type has no `estado`). Asistidas = apoyo in {virtual, cuadernillo, ambos, brinda}, the same set as the map's "brinda" filter.
  - en-riesgo takes its data from `ContextoExportacionEscuelas.riesgoPorCue`, built with `riesgoPorCueDesdeRadar(puntos, escuelas, horizonte)`. T3 must load the radar points for the horizon and pass that map in.
  - "Dirección" column = `nivelJurisdiccionalNombre`. The type has no postal address field.
- [x] T3 — `app/api/infraestructura/exportar/route.ts`: GET `?tipo=&departamento=&direccion=…`, auth + role scope, returns xlsx with Content-Disposition (`lib/archivo.ts`). Tests.
  - Evidence: RED observed for both `lib/exportaciones/solicitud.test.ts` (module missing) and `app/api/infraestructura/exportar/route.test.ts` (route missing). GREEN: `pnpm vitest run lib/exportaciones app/api/infraestructura/exportar` → 4 files, 33 passed. `pnpm tsc --noEmit -p .` → exit 0. `pnpm eslint lib/exportaciones app/api/infraestructura/exportar` → exit 0.
  - Files: `lib/exportaciones/solicitud.ts` (`parsearSolicitudExportacion`, `etiquetasFiltros`, `nombreArchivoExportacion`), route, both tests. Changes left uncommitted.
  - Query params: `tipo` (required), the map's filter params via `parsearContextoMapaDeQuery` (`q`, `depto`/`departamento`, `direccion`, `severidad`/`gravedad`, `clases`, `apoyo`, `sinActualizar`, `solucionadasRecientes`), `horizonte` (24|72|240, default 72; invalid → 400).
  - Status codes: 401 no session, 403 role without scope, 400 bad `tipo` or `horizonte`, 500 when the radar fails for en-riesgo. Scope is passed to `listarEscuelasMapaEnriquecidas(filtrosDeAlcance(alcance))`.
  - Deviation: `radar/route.ts` has no reusable loader; its snapshot query lives inline in `GET`. T3 calls that `GET` handler internally with `?horizonte=` and reads `puntos`, so no SQL is copied. Extracting a `cargarPuntosRadar(horizonte)` into `lib/infraestructura` would be cleaner; that touches a file outside this task's surface.
  - Deviation: the auth/scope steps are repeated inline from `mapa-ruta.ts`, which is outside this task's surface and returns JSON only.
- [x] T4 — Exportaciones tab in the hub nav with export UI.
  - Scope: `Exportaciones` tab (signed-in users) in `components/app-shell.tsx` `NAV_SESION`; page `app/(hub)/exportaciones/page.tsx` with the map's access gate (`/mapas/infraestructura` recurso + alcance, else `/forbidden`); panel `components/exportaciones/panel-exportaciones.tsx` with the five types, description, departamento and dirección multi-selects (`MultiSelect`), horizonte `Segmentado` on en-riesgo only, and "Descargar Excel" per type with loading and server-error states.
  - Pure URL helper `lib/exportaciones/url.ts` (`urlExportacionEscuelas`, reuses `serializarContextoMapaEnQuery`: `depto`, `direccion`; `horizonte` only for en-riesgo). RED observed (module missing), GREEN 4/4.
  - Download helper `components/exportaciones/descarga.ts` takes the filename from `Content-Disposition` and shows the server's `error` message on non-2xx.
  - Evidence: `pnpm vitest run lib/exportaciones components/exportaciones components/app-shell.test.tsx` → 6 files, 40 passed. `pnpm tsc --noEmit -p .` → exit 0. `pnpm eslint lib/exportaciones components/exportaciones 'app/(hub)/exportaciones' components/app-shell.tsx components/app-shell.test.tsx` → exit 0 (1 pre-existing `<img>` warning in the app-shell test mock).
  - Panel and nav tests were written after the implementation, so their RED was not observed.
  - Nav file touched: `components/app-shell.tsx` (+ `components/app-shell.test.tsx`). Nav visibility is session-only; access is enforced by the page and the API, not by the nav.
  - Options come from `/api/mapas/infraestructura/escuelas` (same scope as the map), fetched once per mount, not polled.

- [x] T5 — Combinable export filters + JSON preview (backend only).
  - `estado` replaces `tipo`: repeatable or comma-separated; values `afectadas | sin-clases | con-clases | asistidas | en-riesgo`; empty = all schools. Estado group is OR (a school matches if it matches any selected estado); map filters (`departamento`, `direccion`, `clases`, `apoyo`, `gravedad`, `q`, …) are AND across the group.
  - Columns: base + union of the selected estados' extra columns (catalog order, no duplicates). No estado: base + gravedad + estado de clases + asistencia, plus nivel de riesgo only when radar data is loaded.
  - Radar loads only when `en-riesgo` is selected or `horizonte` is given (default 72 when `en-riesgo` alone).
  - Title "Escuelas <estados unidos>" (e.g. "Escuelas sin clases y en riesgo"); filename slug from that title + date. Filtros block lists `Estado` plus every applied map filter.
  - `GET /api/infraestructura/exportar?formato=json` returns `{ total, columnas: [{clave, encabezado}], filas }` with the first 200 rows; default `formato` is `xlsx`, other values 400.
  - Evidence: RED observed (27 failing: new API missing). GREEN: `pnpm vitest run lib/exportaciones/escuelas.test.ts lib/exportaciones/solicitud.test.ts app/api/infraestructura/exportar` → 3 files, 45 passed. `pnpm tsc --noEmit -p .` → 1 error, `components/exportaciones/panel-exportaciones.tsx(70,41)` uses removed `nombreArchivo`; the panel is out of this task's surface and is replaced by the next task. `pnpm eslint lib/exportaciones app/api/infraestructura/exportar` → exit 0.
  - Open point: the brief's "Why" example ("sin clases AND en riesgo") reads as intersection, but the Semantics line (OR within a group) is implemented. Confirm before the UI task.

## Acceptance criteria
- Each stage-1 type downloads a valid .xlsx opening in Excel/LibreOffice, Arial, branded header, filters listed.
- Filtered export rows equal what the map shows for the same filters.
- Unauthorized users get 401/403; scoped users never see schools outside their scope.

## Checks
`pnpm vitest run <files>`, `pnpm tsc --noEmit`, `pnpm lint`.

## Delivery
Strategy: ask-on-risk. Forecast ~700 authored lines → chain decision asked when the running count passes ~400.
Chain strategy chosen by the user: `feature-branch-chain`.

## Progress
- Worktree `../exportaciones-excel`, branch `GeronimoSerial/exportaciones-excel` from `origin/dev` (5cd5d781).
- T1 done: `exceljs@4.4.0` added; `lib/exportaciones/libro-institucional.ts` + tests (RED observed: module missing; GREEN: 5/5).
  - `pnpm vitest run lib/exportaciones` → 5 passed
  - `pnpm tsc --noEmit -p .` → exit 0, no errors
  - `pnpm eslint lib/exportaciones` → exit 0
  - Deviation: builder returns `Promise<ArrayBuffer>` (exceljs global `Buffer` typing rejects Node `Buffer`).

## Next step
Commit T4 (`feat(exportaciones): add the exports tab with filters and downloads`), then review with the user.
