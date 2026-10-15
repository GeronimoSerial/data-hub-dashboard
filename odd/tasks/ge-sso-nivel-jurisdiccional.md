# GE SSO + nivel jurisdiccional

## Objective
Access to the infra map / parte from ge.mec.gob.ar via GE's SSO, with roles scoped by
GE's nivel jurisdiccional, replacing the hub's own niveles taxonomy.

## Context / decisions
- GE contract (observed, browser-side fetch): `POST` JSON `{email, nombre, apellido, rol, cue?, nivelJurisdiccionalId?, api_key}` → `201 {redirectUrl}`; GE then `window.open(redirectUrl)` (`/auth/ge-callback?token=`).
- Roles: `operador_establecimiento` (+cue) → only the parte form for its CUE, CUE from session, never from URL.
  `director_nivel` (+nivelJurisdiccionalId) → parte + infra map filtered server-side to its nivel.
  `administrador` → everything.
- GE side trusted (2FA staff); harden our endpoint: constant-time api_key, Origin check, rate limit, zod, audit log, one-time 60s ticket → better-auth session.
- Source: `PADRON_PG_URL` → GE `public.secciones.nivel_jurisdiccional_id` (one per CUE in 2026).
  Catalog: 1 Secundario, 2 Privada, 4 Superior, 5 Técnico Profesional, 6 Educación Física, 7 Nivel Central, 9 Consejo General.
- Old→new mapping (user-approved 2026-10-15): secundario→{1,5}, superior→{4}, inicial/primario→{9}, transversal→no restriction. 2/6/7 have no legacy equivalent (assigned only via new admin/SSO).
- Old tables kept in parallel until validated.

## Execution
- TDD: not configured; functional checks = `pnpm vitest run <touched tests>` + `pnpm tsc --noEmit` + `pnpm lint`.
- Route: delegated direct, one Haiku writer per task (<100k context), sequential. Branch `feat/auth`.

## Tasks
- [x] T1 Import nivel jurisdiccional catalog + CUE→nivel in padrón sync (ge schema, padron-ge.mjs, import-padron.mjs) + tests
- [x] T2 Hub tables `niveles_jurisdiccionales`, `user_niveles_jur`, `recurso_audiencia_niveles_jur` (drizzle migration) + backfill script with old→new mapping + tests
- [ ] T3 ACL/usuarios/recurso-access on jurisdiccional ids + tests
- [ ] T4 Admin/UI (hub-data, taxonomia, admin pages) on jurisdiccional catalog
- [ ] T5 Map: "Dirección" filter + server-side forced scope for director_nivel
- [ ] T6 SSO endpoint `POST /api/auth/ge-login` + ticket + `/auth/ge-callback` → better-auth session, role/scope on user + hardening + tests
- [ ] T7 Parte without `?cue` for operador (CUE from session; foreign CUE → 403)

## Progress / evidence
- T1 (delegated Haiku): vitest 4 files/56 passed, tsc 0, lint 0 errors (14 pre-existing warnings). CUE with 2 niveles aborts import (deliberate); not yet run against real GE.
- T2 (delegated Haiku): migration 0013 + catalog seed + mapping + backfill; vitest 26+57 passed, tsc 0, lint 0 errors. Backfill is a one-off script (`node scripts/backfill-niveles-jur.mjs`, run once per env after deploy), not wired into seedHub to avoid re-adding admin-removed rows.

## Next step
T3.
