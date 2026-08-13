# Design: Port matrícula map into the Next hub

## Technical Approach

Port the Vite MapLibre core into this App Router hub as a client island. Catalog stays. Production chrome hides unread sections. Docker standalone replaces the Fastify runtime at the FQDN, with documented rollback.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Host repo | This Next app | Rewrite mapa-demografico in place | Hub chrome already exists; Coolify git source changes once |
| Viewer route | `/mapas/matricula` | Replace `/mapas`; overlay | Catalog can add maps later |
| Recurso link | Optional `ruta` | Hardcode r1 in CatalogPage | SSOT stays `lib/model.ts` |
| Map SSR | `dynamic(..., { ssr: false })` | Server MapLibre | MapLibre needs window + worker |
| Overlays | Fluent `makeStyles` | Keep CSS modules | Hub tokens / dark mode |
| Unread sections | Hide TabList entries | Delete routes | Direct URLs still work; no fake CRUD in nav |
| Worker | `setWorkerUrl('/maplibre-gl-worker.js')` | Vite `?worker&url` | Next has no Vite worker query |

## Data Flow

    Catalog card (r1.ruta) → /mapas/matricula
         │
         ├─ AppShell fullBleed (no footer, no 1180px)
         └─ MapMatriculaPage (client)
                │
                ├─ useMapData fetch /data/{summary,establishments,zones,localities}
                └─ MapView (react-map-gl) + Fluent overlays

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/model.ts` | Modify | `ruta?: string`; r1 path |
| `lib/nav.ts` | Create | NAV + ready hrefs |
| `lib/map-types.ts` | Create | Core types, no sobreoferta/API |
| `lib/use-map-data.ts` | Create | Required fetches only |
| `lib/map-worker.ts` | Create | `setWorkerUrl` |
| `components/resource-card.tsx` | Modify | Next Link when `ruta` |
| `components/app-shell.tsx` | Modify | Ready nav, full-bleed |
| `components/hub-page.tsx` | Modify | Unread format cards not navigable |
| `app/mapas/matricula/page.tsx` | Create | Dynamic import |
| `components/mapas/*` | Create | Viewer + overlays |
| `public/data/*` | Create | Core GeoJSON + summary |
| `public/maplibre-gl-worker.js` | Create | Copied from maplibre-gl |
| `scripts/extract-map-data.mjs` | Create | ETL (needs source HTML) |
| `next.config.mjs` | Modify | `output: 'standalone'`; drop ignoreBuildErrors |
| `Dockerfile` | Create | Node 22, port 3000 |
| `.github/workflows/ghcr.yml` | Create | Build and push GHCR |
| `docs/DEPLOY.md` | Create | Coolify cutover + Fastify rollback |

## Interfaces / Contracts

```ts
interface Recurso {
  // existing fields...
  ruta?: string
}

type OverlayKey = 'zones' | 'down' | 'up' | 'flat' | 'partial' | 'localities'
```

Ready hrefs: `'/'`, `'/mapas'`. Full-bleed when `pathname.startsWith('/mapas/') && pathname !== '/mapas'`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | none (no runner) | N/A |
| Integration | `pnpm build` typecheck | CI / local |
| E2E | catalog → viewer; missing data error; tabs | Manual smoke |

## Threat Matrix

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths | N/A: no executable-file classification | — | — |
| Git repository selection | N/A: CI uses `github.repository` | — | — |
| Commit state | N/A: no app-driven commits | — | — |
| Push state | Applicable: GHCR workflow | Push to `main`/`master` only; packages write | Workflow file review; no deploy on PR |
| PR commands | N/A: no PR automation in app | — | — |
| App routing | Applicable: `/mapas/matricula` | Prefix match must not full-bleed `/mapas` | Manual: catalog vs viewer chrome |

## Migration / Rollout

1. Build image; smoke `/` and `/mapas/matricula` on a Coolify preview or local Docker.
2. Point Coolify git/image to this repo; keep Fastify image tag recorded.
3. Switch FQDN only after map data loads.
4. Rollback: restore `ghcr.io/geronimoserial/mapa-demografico`.

Vite mapa-demografico is not deleted.

## Open Questions

- [x] Coolify MCP unavailable in this session — cutover is documented, not executed against production
