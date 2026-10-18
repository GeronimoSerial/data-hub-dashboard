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
- [ ] T3 — `app/api/infraestructura/exportar/route.ts`: GET `?tipo=&departamento=&direccion=…`, auth + role scope, returns xlsx with Content-Disposition (`lib/archivo.ts`). Tests.
- [ ] T4 — Download control on `/mapas/infraestructura` that exports with the active filters.

## Acceptance criteria
- Each stage-1 type downloads a valid .xlsx opening in Excel/LibreOffice, Arial, branded header, filters listed.
- Filtered export rows equal what the map shows for the same filters.
- Unauthorized users get 401/403; scoped users never see schools outside their scope.

## Checks
`pnpm vitest run <files>`, `pnpm tsc --noEmit`, `pnpm lint`.

## Delivery
Strategy: ask-on-risk. Forecast ~700 authored lines → chain decision asked when the running count passes ~400.

## Progress
- Worktree `../exportaciones-excel`, branch `GeronimoSerial/exportaciones-excel` from `origin/dev` (5cd5d781).
- T1 done: `exceljs@4.4.0` added; `lib/exportaciones/libro-institucional.ts` + tests (RED observed: module missing; GREEN: 5/5).
  - `pnpm vitest run lib/exportaciones` → 5 passed
  - `pnpm tsc --noEmit -p .` → exit 0, no errors
  - `pnpm eslint lib/exportaciones` → exit 0
  - Deviation: builder returns `Promise<ArrayBuffer>` (exceljs global `Buffer` typing rejects Node `Buffer`).

## Next step
T2.
