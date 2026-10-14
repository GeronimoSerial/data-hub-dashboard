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
- [ ] T0b Inventory of the four risk/priority views (Planificación list, Radar list, school sheet, markers/popups
  + verdict departments): API route, query, ordering criterion, source tables (file:line). Then one canonical model:
  'Prioridad de planificación (exposición estructural)' vs 'Riesgo actual (hoy)', both shown in the sheet with the
  same labels/numbers as each list; tests asserting list rank criterion == sheet headline for the same school.
- [ ] T1 Engine snapshot humanizer (pure lib + tests): level, conclusion, operator reasons, technical detail.
- [ ] T2 School sheet uses the engine snapshot as conclusion; hazard numbers become supporting detail;
  "Zona expuesta a crecidas" vs "Situación actual" separated.
- [ ] T3 Audit other risk surfaces (list, marker, popups, verdict, radar card) for agreement.
- [ ] T4 Visual polish pass with screenshots.

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
- T0 commit: see git log (`chore(db): ...`).
