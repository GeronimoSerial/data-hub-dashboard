# integracion-situacion — coherence + visual polish before production

Objective: one source of truth for a school's risk (engine snapshot), humanized factor text, full visual
polish, and merge hygiene on the integrated branch `GeronimoSerial/integracion-situacion`.

Problem: the risk list ranks by `infra_risk_snapshot` while the school sheet built its conclusion from
`/api/infraestructura/peligro` (rain/forecast only). 1800896-00 (Ituzaingó, engine ALTO, Paraná at
evacuation 4.03 m) showed "Sin señales de riesgo por lluvia ni por río".

Scope: presentation and coherence only; no new data sources. No push/PR/deploy.

## Tasks

- [x] T0 Drizzle meta hygiene (inline). 0015 (veredicto) and 0016 (lluvia_estacion) both had prevId = 0014.
  Re-chained 0016.prevId = 0015.id and added `infra_veredicto_dia` / `infra_veredicto_enlace` table snapshots
  to 0016 and 0017. SQL untouched. `drizzle-kit check`: "Everything's fine"; `drizzle-kit generate`:
  "No schema changes".
- [x] T0b Inventory of the four risk/priority views (Planificación list, Radar list, school sheet, markers/popups
  + verdict departments): API route, query, ordering criterion, source tables (file:line). Then one canonical model:
  'Prioridad de planificación (exposición estructural)' vs 'Riesgo actual (hoy)', both shown in the sheet with the
  same labels/numbers as each list; tests asserting list rank criterion == sheet headline for the same school.
- [x] T1 Engine snapshot humanizer (pure lib + tests): level, conclusion, operator reasons, technical detail.
- [x] T2 School sheet uses the engine snapshot as conclusion; hazard numbers become supporting detail;
  "Zona expuesta a crecidas" vs "Situación actual" separated.
- [x] T3 Risk surfaces agree (`9104d67`, `36b54c2`, `7155dd7`, `4527662`): Radar markers coloured by engine
  'Riesgo actual' level only; Radar map draws only moderado+ (muy alto kept: hiding it would drop the most urgent
  schools — flagged to the user); verdict labelled as rule-based and each department row shows school counts by
  engine level (72 h).
- [x] T4 Visual polish + user feedback rounds (commits `a4c7f53`..`1350330`): level chip = legend colours, all
  planning views in the sheet, legend never over the rain scale, folded legend + 20rem panel at 1024-1279 px,
  events block layout, accented department names; no staleness text in operator views (DatoFechado tooltip,
  muted when stale); explicit 'Altura del río: X m · Estado (umbrales)' everywhere; provenance notes behind an
  info icon (NotaInfo); PDF dash bullets without raw URLs; stored verdict texts lose 'Sin datos de: …' at the DTO.
  Desktop only (1024x720, 1366x768, 1600x1000) per user; phones out of scope.

## Inventory (before the fix)

| View | Route / query | Ordering | Sources |
|---|---|---|---|
| Planificación list (`components/mapas/panel-planificacion.tsx`) | no API; client `prioridadPlanificacion` (`lib/infraestructura/mapa/planificacion.ts:91-108`) over `/api/mapas/infraestructura/territorio` (`lib/infraestructura/territorio-mapa.ts:280`) + padrón | static level 0-3 desc (river class / OSM isolation / history count, `planificacion.ts:38-63`), then enrollment (or history), then name | `infra_susceptibilidad_estatica`, `infra_aislamiento_osm`, `infra_acceso_osm_geometria`, padrón |
| Radar list (`components/mapas/panel-radar.tsx:72`) | `/api/infraestructura/radar` (`app/api/infraestructura/radar/route.ts:221,255`), vigente run, default horizon 72 h (`map-infraestructura-page.tsx:709`) | client re-sort by `nivelRiesgo` bucket, then enrollment, then name (`lib/infraestructura/mapa/radar.ts:43-66`); API itself orders `scoreRiesgo desc` | `infra_risk_run`, `infra_risk_snapshot`, `infra_geo_profile` |
| School sheet (`components/infraestructura/ficha-territorial.tsx:350-389,576`) | `/api/infraestructura/peligro`, `/hidrometria/estado`, `/fuentes` | n/a — conclusion = max hazard ≤ 72 h (`resumen-escuela.ts:101-114`) | `peligro` grid, hidrometría — NOT the engine |
| Markers | Radar tab: `coloresRadar` (`radar.ts:119-129`) = `nivelRiesgo` color, or `nivelAmenaza` color when priority bajo; Planificación tab: `coloresPlanificacion` (`planificacion.ts:140`) | — | same as the list of each tab |
| Verdict modal departments (`components/veredicto/veredicto-modal.tsx:321`) | `/api/infraestructura/veredictos` | — | independent rules `reglas-veredicto-v0.2` |
| `/situacion` page, CSV export | `lib/infraestructura/riesgo/situacion/{consulta,corte}.ts` | — | `infra_risk_snapshot` |

## Canonical model (decision)

- **Riesgo actual (hoy)** = engine snapshot (`infra_risk_snapshot` + `infra_risk_factor`) for the vigente run and the
  selected horizon (default 72 h). Source of the Radar list, Radar markers and the sheet headline.
- **Prioridad de planificación (exposición estructural)** = static `nivelPlanificacion` for the active view. Source
  of the Planificación list and markers. Never phrased as "today".
- The sheet shows both blocks with those exact labels and the same level each list uses; rain/forecast/river
  numbers from `/peligro` become supporting detail under "Situación actual".
- Verdict departments stay an independent daily verdict (rules v0.2); labelled as such, not as a school's risk.

## Checks
- `npx tsc --noEmit -p .`, `pnpm lint`, related vitest files with `timeout 300`.

## Progress / evidence
- T1 `cf4e329` (delegated, haiku): `lib/infraestructura/riesgo/explicar-snapshot.ts`, 10 tests.
- API `f1a4aca` (delegated, haiku): `GET /api/infraestructura/riesgo/escuela/[cueAnexo]?horizonte=`, 7 tests.
- List titles `d48cd05` (inline): Radar 'Riesgo actual (hoy)', Planificación 'Prioridad de planificación (exposición estructural)'.
- T2 `b57e5d6`: `RiesgoEscuela` (delegated, haiku) + panel wiring (inline). Sheet gets `horizonteEfectivo` and
  `nivelPlanificacion(escuela, vistaPlanificacion)` from the map page, i.e. the same inputs as each list. Old
  peligro-based conclusion removed from `FichaTerritorial` (kept as 'Lluvia y río: datos de apoyo'). 67 tests green.
- Pending/known: Radar marker paints `nivelAmenaza` colour when engine level is bajo (`radar.ts:119-129`) — kept,
  the list shows the same school with its threat pill; verdict modal remains an independent daily verdict.
- Visual verification: `.env.local` provided by the supervisor; dev on :3330 against dhd-verif; screenshots in
  `/home/gero/capturas/pulido-final/` (prefix s-=1024, d-=1366, w-=1600; publico, pdf-pagina-N).
- Checks: `tsc` clean; `pnpm lint` 0 errors (15 pre-existing warnings); related vitest suites green.
- T0 commit: see git log (`chore(db): ...`).
- Merge `858c1f5` of GeronimoSerial/mapa-peligro-visible (ef4e48e, 3458709, 96ba136): no textual conflicts;
  legend moved bottom-right by that branch, so `bbacae3` stacks it above the Radar rain scale and above the
  "Veredicto diario"/"Pantalla completa" buttons. Last polish: verdict technical notes and station 12 h rule behind
  NotaInfo (`a9b5c05`, `7cb4326`). Final screenshots (s-/d-/w-, publico, pdf-pagina-N) reviewed.
- Known/left: Radar legend and map keep "Muy alto" (supervisor decision: moderado, alto, muy alto only); station map labels show the bare height;
  water-crossing dots of the selected school's route look like school dots in Radar; admin pages untouched
  (internal, technical by design); stored verdict texts are cleaned at the DTO, new ones by the template.
