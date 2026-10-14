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
- [ ] T1 Engine snapshot humanizer (pure lib + tests): level, conclusion, operator reasons, technical detail.
- [ ] T2 School sheet uses the engine snapshot as conclusion; hazard numbers become supporting detail;
  "Zona expuesta a crecidas" vs "Situación actual" separated.
- [ ] T3 Audit other risk surfaces (list, marker, popups, verdict, radar card) for agreement.
- [ ] T4 Visual polish pass with screenshots.

## Checks
- `npx tsc --noEmit -p .`, `pnpm lint`, related vitest files with `timeout 300`.

## Progress / evidence
- T0 commit: see git log (`chore(db): ...`).
