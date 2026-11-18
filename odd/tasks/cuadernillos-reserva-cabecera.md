# Cabecera assigns its reserve to a critical school
Objective: Planeamiento sends a cabecera a reserve per grade; the cabecera splits it among critical schools without supervisor authorization.
Branch: sg/planeamiento-ui · Delivery: ask-on-risk · Runner: vitest (`npx vitest run lib/cuadernillos app/api/cuadernillos components/cuadernillos`)

## Specs
- S1: "La cabecera tambien deberia poder asignar cuadernillos (que recibio de planeamiento) a una escuela particular, afectada en estado critico. Pero, sin autorizacion obligatoria del supervisor.."
- S2: "Si planeamiento manda 100 cuadernillos a una cabecera, la cabecera puede dar 20 a una escuela, y 80 a otra."
- S3 (assumption): "Directo a cabecera" sends quantities per grade to the cabecera as a reserve (no per-school lines). Existing per-school cabecera remitos stay valid and readable.
- S4 (assumption): only quantities the cabecera already confirmed receiving count; a send never exceeds the remaining balance (received − already assigned); partial sends and several sends to one school are allowed.
- S5 (assumption): recipient must be Crítica at send time; no supervisor approval step; the supervisor sees these sends afterwards, read-only.
- S6 (assumption): the school confirms with the existing school receipt flow; global stock is not debited again.
- S7 (contract, both writers build to it):
  - Data: migration 0064 adds `booklet_remito_line.reserva boolean not null default false` and `booklet_remito.origen_cabecera_cue_anexo text null` (FK to booklet_school_assignment.cue_anexo; CHECK origin NOT NULL => modo = 'directo'). A reserve = modo 'cabecera' remito with ONE line (recipient = the cabecera's own CUE, reserva = true, skips the Crítica check). An onward send = modo 'directo' remito with origen_cabecera_cue_anexo = the cabecera, dispatched_by = the cabecera user, one line in_transit to a Crítica school; the school signs with the existing school receipt flow. Global stock is debited only at the Planeamiento dispatch.
  - Reserve line at the cabecera: the cabecera signature records cabecera_received_quantity and leaves the reserve line `at_cabecera` (it is NOT school-received).
  - Balance per product = sum(cabecera_received_quantity of reserve lines of that cabecera+campaign) − sum(dispatched_quantity of onward remitos with that origen+campaign).
  - `POST /api/cuadernillos/remitos` (Planeamiento) also accepts `{ campaignId, modo:'cabecera', cabeceraCueAnexo, reserve:true, items:[{productId,quantity}], idempotencyKey }` (no `lines`); response keeps the existing shape, one line with `reserva:true`. Existing `lines` bodies are unchanged.
  - Remito lines in every listing (remitos, recepciones, supervisor control) carry `reserva: boolean`.
  - `GET /api/cuadernillos/reserva?campaignId=` (cabecera capability, own cabecera only) -> `{ campaignId, cabeceraCueAnexo, balances:[{productId,productName,received,assigned,available}], assignments:[{remitoId,recipientCueAnexo,recipientName,dispatchedAt,status,items:[{productId,productName,quantity}]}] }`.
  - `POST /api/cuadernillos/reserva/asignaciones` body `{ campaignId, recipientCueAnexo, items:[{productId,quantity}], idempotencyKey }` -> 201 `{ remitoId, campaignId, recipientCueAnexo, recipientName, dispatchedAt, items }`. Errors (JSON `{error}`): forbidden 403, invalid_* 400, recipients_not_critical 409 (details.recipientCueAnexos), insufficient_reserve 409 (details.productIds), idempotency_conflict 409, campaign_inactive/policy_unresolved 409. No supervisor capability is required or checked; the supervisor sees these sends afterwards, read-only, in the supervisor control view.

## Tasks
- [ ] T1 (S3,S6) migration 0064 + schema: line.reserva, remito.origen_cabecera_cue_anexo — inline, high-risk item 1
- [ ] T2 (S3) dispatchRemito reserve variant + cabecera receipt keeps reserve lines at_cabecera — inline
- [ ] T3 (S1,S2,S4,S5,S6) dispatchFromReserve + balance + API — inline, high-risk items 2,4
- [ ] T4 Planeamiento wizard: quantities per grade for "Directo a cabecera" — inline
- [ ] T5 Cabecera screen: balance + "Asignar a una escuela" wizard; school/supervisor wording — inline

## Log
- L1 (2026-11-18): "La cabecera tambien deberia poder asignar cuadernillos (que recibio de planeamiento) a una escuela particular, afectada en estado critico. Pero, sin autorizacion obligatoria del supervisor.."
- L2: "Si planeamiento manda 100 cuadernillos a una cabecera, la cabecera puede dar 20 a una escuela, y 80 a otra."
- L3: Explorer map: request/approval flow is retired (410 flow_retired); live model is remitos (drizzle 0062/0063); no per-cabecera stock table; dispatchRemito lock order must be followed.
