# Tasks: Port matrícula map into the Next hub

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1800–2500 (includes GeoJSON copy) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | catalog+shell → map viewer → docker/ci |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | ruta + nav + full-bleed | size-exception | `pnpm build` | open `/mapas` | `lib/model.ts`, shell, card |
| 2 | MapLibre core viewer | size-exception | `pnpm build` | open `/mapas/matricula` | `components/mapas/`, `public/data/` |
| 3 | Docker + GHCR + DEPLOY.md | size-exception | `pnpm build` | `docker build` | Dockerfile, workflow, docs |

## Phase 1: Foundation

- [ ] 1.1 Add `ruta?: string` on Recurso; set r1 to `/mapas/matricula`
- [ ] 1.2 Create `lib/nav.ts` with NAV and ready hrefs `/`, `/mapas`
- [ ] 1.3 `next.config.mjs`: `output: 'standalone'`; remove ignoreBuildErrors / ignoreDuringBuilds

## Phase 2: Catalog and chrome

- [ ] 2.1 ResourceCard: Next Link when `ruta` is set; inert otherwise
- [ ] 2.2 AppShell: filter TabList; full-bleed when `/mapas/` and not `/mapas`
- [ ] 2.3 HubPage: unread format type-cards do not navigate

## Phase 3: Map viewer

- [ ] 3.1 Add `lib/map-types.ts` and `lib/use-map-data.ts` (required files only)
- [ ] 3.2 Port MapView without sobreoferta paint; GeoJSON popup only
- [ ] 3.3 Fluent overlays: title, legend, search, layers, basemap, fullscreen
- [ ] 3.4 `app/mapas/matricula/page.tsx` dynamic `ssr: false`; `setWorkerUrl`
- [ ] 3.5 Copy `public/data` core files; copy MapLibre worker to `public/`
- [ ] 3.6 Copy `scripts/extract-map-data.mjs`; add `extract` script + maplibre deps

## Phase 4: Production runtime

- [ ] 4.1 Dockerfile Node 22, pnpm, standalone, port 3000, GET `/`
- [ ] 4.2 GHCR workflow on main/master push only
- [ ] 4.3 `docs/DEPLOY.md` Coolify cutover + Fastify rollback image

## Phase 5: Verify

- [ ] 5.1 `pnpm build`
- [ ] 5.2 Manual smoke: catalog card, viewer chrome, missing-data path if feasible
