# Call Center miniapp
Objective: Hub route `/call-center` listing schools whose parte is stale (>72 h) and letting an operator log each call.
Branch: GeronimoSerial/call-center. Delivery: single PR to main. Runner: vitest (pnpm), tsc, eslint.

## Specs
- S1: Access is inside the Hub. Call-center operators are `admin` ("creo que es admin, para ver el hub"). No separate host or login. Gate: new capability `callcenter.access`, added to `ALL_CAPABILITIES`, which `admin` and `editor` receive through the existing loop in `capabilitiesFor` (`lib/access/capabilities.ts:48-53`). `operador_establecimiento` (school staff) must NOT receive it.
- S2: The list shows schools whose parte is "sin actualizar", reusing `UMBRAL_SIN_ACTUALIZAR_HORAS` (72 h) from `lib/infraestructura/umbrales.ts`. Same definition as the map.
- S3: After a call is logged the school stays in the list, marked "contactada", until the director updates the parte.
- S4: A call records: CUE, author (session user, never taken from the body), caller name (prefilled from the session user, editable), justification of why the parte was not closed, what the director said, timestamp.
- S5: The miniapp does not show school phone numbers.
- S6: Schema change is additive only (new table `call_center_llamadas`, migration 0043). No existing data is touched.
- S7: Both reading the list and POSTing a call require `callcenter.access`. The author is always the session user id.

## Tasks
- T0a recon permissions/roles — S1,S7 — delegated haiku — done
- T0b recon stale-parte query in the map — S2,S3 — delegated haiku — done
- T0c recon schema/migration/route-test conventions — S4,S6 — delegated haiku — done
- T1a table + migration 0043 + drizzle schema — S4,S6 — delegated haiku — pending
- T1b stale-schools list function (`lib/call-center/escuelas-pendientes.ts`, reuses `listarPartesVigentes`) + tests — S2 — delegated haiku — pending
- T2a llamadas data helpers (`lib/call-center/llamadas.ts`: insert, history by CUE, last contact per CUE) + tests — S3,S4 — delegated haiku — pending
- T2b `GET /api/call-center/escuelas` (list + contactada flag) + tests — S1,S2,S3,S5,S7 — delegated haiku — pending
- T2c `POST /api/call-center/llamadas` + `GET /api/call-center/llamadas?cue=` + tests — S3,S4,S7 — delegated haiku — pending
- T3a capability `callcenter.access` (capabilities, guards, route manifest, tests) — S1,S7 — HIGH RISK item 2 (permissions): own commit + independent verifier — delegated haiku — pending
- T3b list page `/call-center` — S2,S3,S5 — delegated haiku — pending
- T3c call form + history component — S3,S4 — delegated haiku — pending
- T4 verification (tsc, vitest per directory, eslint), one haiku each — pending

## Batches
- B0 recon (read-only, parallel): T0a, T0b, T0c. Each writes findings to the scratchpad, 40 lines max.
- B1 data layer (parallel, disjoint files): T1a, T1b.
- B2 llamadas helpers first (T2a, needs the table from T1a), then the routes T2b and T2c in parallel.
- B3 T3a first (own commit, independent verifier), then T3b and T3c in parallel.
- B4 verification: one haiku per check.
Rules: haikus do not commit. The parent reviews each batch diff and commits it.

## Log
- L1 (2026-11-11, user): "necesito crear una miniapp que consuma de una api o de datos del mapa ENOS, para call center. La idea, es poder tener el listado de escuelas sin actualizar, y un pequeño flujo que permita ingresar el nombre del caller, y poder añadir una justificacion de por qué no se cerró y qué dijo el director al respecto."
- L2 (2026-11-11, user): access "dentro del hub con el rol que ya tienen, que viene de GE"; list = "Parte sin actualizar >72 h"; after call = "Queda en la lista, marcada como contactada"; caller = "Operador: usuario logueado + nombre editable"; phone: "lo tienen por otro lado".
- L4 (2026-11-11, user): role of call-center operators = "creo que es admin, para ver el hub". Verified in `lib/access/capabilities.ts:48-53`: `admin` gets every capability, `editor` every one except `admin`. Recon T0a found `operador_establecimiento` is school staff (only `parte.access`, CUE-scoped), so it is excluded on purpose.
- L3 (2026-11-11, user): "creame un plan de implementación por batches que agrupen subtareas, y delega haikus que lo hagan. Vos solo revisas el resultado del batch, los haikus hacen todo."
