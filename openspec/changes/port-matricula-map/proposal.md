# Proposal: Port matrícula map into the Next hub

## Intent

The enrollment map lives in a Vite SPA. The product shell is this Next.js Fluent hub. Operators need one site at analisis.sistemas.mec.gob.ar: catalog, then a full-bleed MapLibre viewer, without publishing in-memory admin CRUD as production.

## Scope

### In Scope
- Catalog card «Mapa de matrícula provincial» opens `/mapas/matricula`
- Core MapLibre viewer (establishments, zones, localities, search, trend layers, legend, basemap, GeoJSON popup)
- AppShell full-bleed on that route; hide Reportes / Tableros / Admin from production nav
- Static GeoJSON under `public/data/` plus extract script
- Standalone Docker (Node 22, port 3000), GHCR workflow, Coolify cutover runbook and Fastify rollback

### Out of Scope
- Sobreoferta overlay and PowerBI pipeline
- API GE enrichment / real-enrollment timeline
- Fastify, Postgres, cookie auth, uploads
- Other maps (alertas)
- Catalog redesign; admin persistence

## Capabilities

### New Capabilities
- `resource-catalog`: optional `ruta` on Recurso; cards with a path navigate; cards without stay inert
- `hub-nav-fullbleed`: ready-only TabList; map viewer drops footer and 1180px max-width
- `map-viewer`: core MapLibre island at `/mapas/matricula`
- `production-runtime`: standalone Node image, health on `/`, documented Coolify cutover/rollback

### Modified Capabilities
- None

## Approach

Keep `/mapas` as CatalogPage. Add a client-only MapLibre route. Restyle overlays with Fluent tokens; keep trend colors. Hide unread hub sections so seed CRUD is not the live product. Retarget Coolify git/image to this repo; leave the Vite repo archived.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/model.ts` | Modified | Optional `ruta` on Recurso; seed r1 |
| `components/resource-card.tsx` | Modified | Link when `ruta` set |
| `components/app-shell.tsx` | Modified | Ready nav + full-bleed |
| `app/mapas/matricula/` | New | Thin page + dynamic import |
| `components/mapas/` | New | Viewer and overlays |
| `public/data/` | New | Core GeoJSON + summary |
| `Dockerfile`, `.github/` | New | Standalone + GHCR |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| MapLibre worker blank canvas | High | `setWorkerUrl` + public worker file |
| Cutover drops Fastify reports | High | Hide unread sections; rollback image |
| TS ignored in current Next config | Med | Remove `ignoreBuildErrors` before image |

## Rollback Plan

Coolify restores `ghcr.io/geronimoserial/mapa-demografico` (Fastify). This repo stays; Vite mapa-demografico is untouched.

## Dependencies

- GeoJSON already extracted in mapa-demografico `public/data/`
- Coolify app `pts681lz0kazhs1dph8wjaxt`, owner GeronimoSerial
- GHCR package for this repo (created on first workflow run)

## Success Criteria

- [ ] Catalog card opens `/mapas/matricula` full-bleed with core map
- [ ] Light/dark applies to Fluent overlays; trend colors unchanged
- [ ] Reportes/Admin not in production TabList
- [ ] `pnpm build` succeeds; image listens on 3000
- [ ] Documented Coolify cutover and Fastify rollback
