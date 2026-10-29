# Linktree sistemas.mec.gob.ar

Objective: public links page in the Gobierno de Corrientes brand plus an admin customization module built only from existing shadcn/Base UI/Arc primitives.
Branch: serialgeronimo/feat-linktree-sistemas-mec. Delivery: ask-on-risk (one PR expected, under ~400 lines per slice). Runner: `pnpm vitest run <file>`.

## Specs

- S1: "linktree custom en *.sistemas.mec.gob.ar, para añadir links y esas cosas"
- S2: "bien lindito, con la estética del gobierno pero sin slop y detalles esteticos modernos", "sutil y sin estar sobrecargado". Brand source: `design.md` (Gobierno de Corrientes V1.1): Barlow family, official palette, no gradients, official logo files only.
- S3: "Va a ser una página publica"
- S4: "módulo de customizacion total", "usar primitivas existentes de shadcn o base ui o arcui", "no quiero nada custom y a mano". Assumption: "total" means texts, official accent, logo and domain toggles, groups, links, icons, order, visibility. Colors are limited to official palette tokens.
- S5: "levantame un cloudflared"
- A1 (assumption): config is one jsonb row (`linktree_config`), validated with zod on read and write; invalid or missing row falls back to defaults.
- A2 (assumption): only `admin` role can write; the public page needs no session.
- A3 (assumption): public path is `/links`; mapping `links.sistemas.mec.gob.ar` to it is ingress work, not part of this feature.
- A4 (assumption): live status indicator per link is deferred.

## Tasks

- [x] T1 (S1, A1) data layer: table, migration 0038, `lib/linktree` schema/defaults/read/write. Route: inline. Risk: item 1 (migration, additive new table), own commit 9b218836. RED then GREEN: 16 config tests, 4 store tests, migration order test.
- [x] T2 (S4, A2) admin-only write API `PUT /api/linktree`. Route: inline. Risk: item 2 (auth guard), commit 3078e78e. RED then GREEN: 7 route tests (401, 403 editor/consulta/banned admin, 400 invalid JSON, 400 javascript: url, 200 save and read).
- [x] T3 (S1, S2, S3) public page `/links`. Route: inline. Risk: none. Commit 33d525b0. 9 component tests + 2 page tests (anonymous render, tab title).
- [x] T4 (S4) admin section `links` in `/admin`. Route: inline. Risk: none beyond T2 guard (page gate reuses the adminOnly redirect in `[seccion]/page.tsx`). 11 edit-helper tests + 9 admin component tests. Found and fixed during GREEN: Base UI Switch is a span, so the row click-to-edit opened the dialog when toggling visibility.
- [ ] T5 (S5) production build, local PGlite, cloudflared quick tunnel. Route: inline, runtime only, no repo change.

## Log

- L1 (2026-10-29): "Necesito crear un linktree custom en *.sistemas.mec.gob.ar, para añadir links y esas cosas, pero bien lindito, con la estética del gobierno pero sin slop y detalles esteticos modernos. Dame ideas"
- L2 (2026-10-29): "Si pero sutil y sin estar sobrecargado. Hacelo y levantame un cloudflared. Va a ser una página publica pero si me gustaria tener un módulo de customizacion total, para el modulo voy a necesitar que uses primitivas existentes de shadcn o base ui o arcui no se q estamos usando, pero no quiero nada custom y a mano"
- L3 (2026-10-29): antislop mode chosen by the user: "DURANTE"
- L4: Evidence: no `DATABASE_URL` in shell and no `.env` in the worktree, so the app runs on PGlite (`lib/db/driver.ts`). Never run against the prod RDS.
- L5: Design Read: public access page for ministry staff and citizens, Gobierno de Corrientes brand, dial ENERGY 1 / RHYTHM 1 / MOTION 1. Identity motif: the brand yellow marker as the state highlight on the active row.
