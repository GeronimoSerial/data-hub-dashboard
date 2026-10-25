# API standard

Objective: every app/api route handler runs through `ruta()` (request id, structured access log, traceable 500, optional rate limit) with byte-identical responses apart from `x-request-id`.
Branch: GeronimoSerial/api-standard (from GeronimoSerial/fix-issues-2). Delivery: work-unit commits, push/PR by the user. Runner: vitest (PGlite).

## Specs
- S1. User request (verbatim): "Debemos mejorar toda la parte de apis y eso que hoy no esta muy profesional y listo para sobrecargas o debugging."
- S2. Inventory every app/api/**/route.ts (methods, auth guard, rate limit, response helpers, error handling, console.* usage, PII exposure, caching headers) — see Inventory below.
- S3. Characterization before changes: per route group, a vitest test calling every exported handler (unauthenticated, authenticated when feasible, invalid input) snapshotting status + content-type + body shape with volatile values normalized. Snapshots are the contract and must never be updated with `vitest -u`.
- S4. Wrap every remaining route with `ruta('<dotted.name>', handleX)`; replace console.* in handlers with log.* (no PII: never bodies, query strings, names, DNI); add a limiter only where the route is public or expensive, justified here. Responses stay byte-identical except the added `x-request-id`.
- S5. No route unification/renaming in this phase; list consolidation candidates as a proposal.

## Inventory (2026-10-25, 79 route.ts)

Already standard (10 files, parte): problematicas/parte/** — wrapped, limiters on POST parte and matricula search.

Findings across the other 69 files:
- No handler wraps errors uniformly: 28 files have a local try/catch, the rest let errors escape to Next's default 500 (no request id, no structured log).
- console.* in route handlers: none (logging happens inside lib/**; out of scope for this phase).
- Rate limit: only problematicas/acceso (ipExcedeLimite). Public routes without any limit are listed in the limiter table.
- Caching: every route but materiales/[id]/descargar declares `dynamic = 'force-dynamic'`; about half also set `Cache-Control` explicitly (mostly `no-store`). Unchanged in this phase.
- Error envelope: mixed — `jsonError` (lib/infraestructura/respuesta-error) in infraestructura/mapas, ad hoc `NextResponse.json({ error })` elsewhere. Unification is a later phase.
- PII exposure: routes returning person data are guarded — usuarios (admin, emails), infraestructura/nominal/permisos and mapas/infraestructura/nominal (nominal data behind verificarAccesoLectura), recursos (authors), motivos/taxonomia (admin). No route logs request bodies or query strings.

| Group | Routes | Guard |
|---|---|---|
| auth | auth/[...all] (GET,POST better-auth), auth/ge-login (OPTIONS,POST) | public (login) |
| hub/gate | gate/[...path] GET, hub GET, hub/admin GET | getSessionUser |
| infraestructura (40) | accesos, adjuntos, borradores, episodios-derivados, exportar, fuentes, geo-perfiles, hidrometria, motivos, nominal/permisos, operacion/salud, peligro, radar, radar-meteo, riesgo, situacion, tendencia-estacional, veredictos, verificaciones | verificarAccesoLectura or getSessionUser |
| mapas (13) | mapas/infraestructura/** | verificarAccesoLectura; escuelas, totales and the root route are public |
| problematicas (non-parte) | acceso POST, contexto GET, verificaciones/[id]/{canjear-sesion,responder,validar-token,vincular-movimiento} POST | password / token |
| recursos/taxonomia/usuarios | recursos, recursos/[id], recursos/[id]/archivo, recursos/[id]/explain, taxonomia/[kind], usuarios, usuarios/[id] | getSessionUser (+admin) |
| public downloads | materiales/[id]/descargar GET, veredicto/compartido/[token]/pdf GET | public / share token |

### Limiter decisions (S4)
Per-IP fixed window of 60 s (lib/http/limitador.ts, in-memory per instance):
- auth/ge-login POST, 10: public login endpoint, brute-force target.
- problematicas/verificaciones/[id]/{canjear-sesion,responder,validar-token,vincular-movimiento} POST, 20: public, token-guarded; limits token guessing.
- veredicto/compartido/[token]/pdf GET, 10: public share link that renders a PDF (expensive).
- materiales/[id]/descargar GET, 30: public file download.
- mapas/infraestructura (root), escuelas, totales GET, 60: public unauthenticated map reads.
- infraestructura/exportar, situacion/export, veredictos/pdf GET, 10: authenticated but expensive exports/PDF generation.
- problematicas/acceso keeps its existing ipExcedeLimite; no second limiter.
- auth/[...all] gets no app limiter: better-auth applies its own rate limiting in production.
- All other routes are authenticated and cheap: no limiter.

### Consolidation proposal (S5, not implemented)
- infraestructura/radar-meteo/{alertas,resumen,escuela/[cueAnexo]} + radar-meteo → one resource with `?vista=` / `?cue=`.
- infraestructura/riesgo/{escuela/[cueAnexo],[snapshotId]} + riesgo → `riesgo?cue=` / `riesgo/[snapshotId]`.
- infraestructura/veredictos/{eventos,historial,pdf,enlaces} → `veredictos/[id]/{eventos,historial,pdf}`.
- infraestructura/situacion/{cambios,export} → `situacion?vista=cambios|export`.
- infraestructura/hidrometria/{estado,estaciones,estaciones/[id]/lecturas} → `hidrometria/estaciones/[id]?incluir=lecturas`.
- mapas/infraestructura/accesos/[cueAnexo]/{geometria,exposicion-inundacion} and infraestructura/accesos/[cueAnexo] → one `accesos/[cueAnexo]?capa=`.
- problematicas/verificaciones/[id]/{canjear-sesion,responder,validar-token,vincular-movimiento} → `verificaciones/[id]` with an `accion` field (POST).
- mapas/infraestructura/{totales,escuelas} + root → one `mapas/infraestructura?vista=`.

## Tasks
- T1 [S2,S5] inventory + findings — inline — done
- T2 [S3] characterization tests per group (4 files, 320 cases, 1 skipped: ge-login POST from an allowed origin needs the external GE SSO) — haiku Orca workers, sonnet-low review (1 blocker: mapas froze shape only; fixed to full bodies, regenerated against pre-wrap code) — done (0900d6ba, 82213865)
- T3 [S4] all 79 route.ts wrapped with ruta(), 13 limiters — haiku Orca workers + 2 routes inline, sonnet-low review — done (bc3490ef, d9ec943b, 1593bbbb, 21ae9c44)

## Log
- L1 (2026-10-25) user: "Debemos mejorar toda la parte de apis y eso que hoy no esta muy profesional y listo para sobrecargas o debugging."
- L2 inventory: 79 route.ts, 69 not wrapped, 0 console.* in handlers.
- L3 characterization: PDF byte length embeds the date (flaky) -> PDFs freeze status/headers and the %PDF- signature only.
- L4 several tests called handlers with no Request (GET()); ruta() needs one (Next always passes it), so tests now pass a Request. Snapshots unchanged by this.
- L5 vitest.setup.ts resets all limiters before each test (module-level state made exportar's sibling test hit 429).
- L6 checks: pnpm vitest run app/api --maxWorkers=4: 74 files, 850 passed, 1 skipped; pnpm vitest run lib/http: 21 passed; pnpm tsc --noEmit -p .: 0 errors; pnpm lint: 0 errors, 36 warnings (19 are consistent-type-imports in the new characterization tests). No .snap file changed after 82213865.
