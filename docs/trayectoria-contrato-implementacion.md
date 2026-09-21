# Contrato de implementación — Trayectoria hidrometeorológica

> Documento de trabajo. Todo agente o persona que implemente un batch de esta funcionalidad
> debe leerlo antes de escribir código. Es la única fuente de verdad sobre nombres y estructura.
> Si algo acá contradice a la especificación funcional, gana este documento: registra decisiones
> ya tomadas sobre ambigüedades de la especificación.
>
> Especificación funcional: `docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md`
> PR de referencia: #24


## Resolved ambiguity (product owner decision)

The "situación hidrometeorológica" is **one provincial period** (ENOS protocol 2026/2027,
~6 months), NOT a per-establishment episode and NOT multiple concurrent episodes.

What each director opens and updates is a **parte** within that period: one per CUE per período.

Consequences:
- Spec §14 "Continuar como otro episodio" is DEAD. There is no secondary escape hatch.
  Attempting to start a report when a parte already exists resolves to "update the parte".
  The duplicate-motivo reminder still applies *within* the parte (§9: "un motivo ya presente
  en la situación no debe agregarse nuevamente por accidente").
- Unrelated events months apart share the same parte. They are distinguished by the historial
  and by retiring afectaciones that no longer apply. The director cannot close/resolve (§18.9).

## Domain model (canonical names)

```
infra_periodo            provincial, one row vigente at a time, ~6 months
  └── infra_parte        one per (cueAnexo, periodoId) — what the director sees and updates
        ├── infra_afectacion            N per parte; own categoria, motivo, severidad, alcance
        │     ├── infra_afectacion_seccion
        │     └── infra_afectacion_alumno
        ├── infra_servicio_alcance      N per parte; suspension scope
        ├── (column) estadoEstablecimiento   habitual | evacuado | centro_evacuados
        └── infra_movimiento            N per parte; append-only audit of changes
```

### Enums / unions (TypeScript + DB text columns)

- `Severidad` — reuse existing `lib/infraestructura/severidad.ts`: `'Baja'|'Media'|'Alta'|'Crítica'`
- `Categoria` — reuse existing `lib/infraestructura/categorias.ts`: `'establecimiento'|'alumnos'`
- `EstadoEstablecimiento` = `'habitual' | 'evacuado' | 'centro_evacuados'`
- `ServicioEstado` = `'normal' | 'suspendido'` (what the director picks — only two options, §3.4)
- `ServicioAlcanceTipo` = `'establecimiento' | 'turno' | 'seccion'`
- `TipoMovimiento` = `'reporte_inicial' | 'actualizacion' | 'cambio_servicio' | 'cambio_establecimiento' | 'resolucion'`
  (`'resolucion'` is reserved for the future supervisor flow; never produced in this stage)
- `RolMovimiento` = `'director' | 'supervisor'`

### Derived, never stored

`EstadoServicioGeneral` = `'normal' | 'parcial' | 'suspendido'` is COMPUTED from the vigente
alcance rows against the parte's sections (§10). It is display-only. The director never picks
"parcialmente suspendidas" (§3.4).

### Timestamps — two distinct concepts (§12)

Every movimiento and every state-bearing row carries BOTH:
- `creadaEn` — when it was loaded into the system (server clock, never client-supplied)
- `rigeDesde` — when the change takes effect (defaults to now; director may set past or future)

They are frequently different. Never conflate them. Never derive one from the other.

## Migration strategy: ADDITIVE

`infra_problematica` (lib/db/schema.ts:206-250) maps ~1:1 to "afectación". Do NOT drop it and
do NOT rewrite the existing `POST /api/problematicas` contract in the schema batch. Backfill:
one `infra_periodo`, one `infra_parte` per distinct `cueAnexo`, and link existing rows.

Existing tests under `app/api/problematicas/*.test.ts` must keep passing.

## Hard constraints from the existing codebase (verified)

- ORM: **Drizzle over libSQL/SQLite** (`lib/db/index.ts`, `getDb()`). NOT Prisma.
- A second attached DB holds the padrón: `ge.sqlite`, attached via `asegurarGeAdjuntada`
  (`lib/infraestructura/ge-db.ts`). Sections/students come from the **corte vigente**.
- There is **no `director` role in auth**. `lib/acl.ts` has only `admin|editor|consulta`.
  The director is anonymous: `?cue=<CUE>` + shared password → HMAC cookie 12h
  (`lib/infraestructura/acceso-publico.ts`, marked PROVISORIO). Do not attempt to add a role.
- Categoría is **resolved server-side from the motivo name** (`resolverCategoria`,
  `lib/infraestructura/validacion.ts:101`). The client never sends categoría. Preserve this.
- Student names are **encrypted at rest**, decrypted in batch via
  `listarIdentidadesPorPersonasDesdeGeDb` (`lib/infraestructura/identidad.ts`).
  Exposing names on the public route is a documented exception tied to the password gate.
- Validation: **Zod, server-side only** (`lib/infraestructura/validacion.ts`).
  No react-hook-form in the project. Forms use plain `useState`.
- No server actions. Everything is Route Handlers under `app/api/`.
- Rate limiting + idempotency already exist (`lib/infraestructura/limites.ts`,
  `idempotencyKey`). Reuse, do not reinvent.
- UI kit: shadcn-style in `components/ui/` (`components.json`, style `base-nova`, lucide icons).
  Present: alert-dialog, breadcrumb, button, checkbox, dialog, field, input, label, menu,
  multi-select, radio, select, sheet, switch, tabs, textarea, tooltip.
  **Absent**: Card, Badge, Combobox, DateTimePicker.
- Tests: **Vitest** (`pnpm test` → `vitest run`), `@testing-library/react` + `user-event`
  + `jest-dom`, setup in `vitest.setup.ts`.

## Language rules for artifacts

- Identifiers, types, functions, file names, comments, commit messages: **English**.
- User-facing UI copy: **Spanish**, matching the spec's exact wording (§5.4, §17).
  Use "Situación en seguimiento", "Actualizar el parte", "¿Qué cambió?", "Rige desde",
  "Secciones y alumnos afectados". Avoid "versión", "entidad", "registro histórico",
  "persistencia". Neutral/professional Spanish — no regional slang.
- Mobile-first. The director is a non-technical user on a phone.

## Batch map

| # | Batch | Depends on |
|---|-------|-----------|
| 0 | DateTimePicker + "Ahora / Cambiar" vigencia primitive | — |
| 1 | Schema + Drizzle migration + backfill | — |
| 2 | Domain layer: types, Zod contracts, estado general, movement diffing | 1 |
| 3 | API route handlers | 2 |
| 4 | Pantalla "estado actual" (§6, §17) | 3 |
| 5 | Reporte inicial + gestión de afectaciones (§7, §9) | 3 |
| 6 | Actualización + resumen de cambios + antiduplicado (§8, §13, §14) | 5 |
| 7 | Historial (§15) | 3 |

---

## UX contract (applies to all UI batches: 0, 4, 5, 6, 7)

Every UI batch MUST read, before writing components:
- `ux-heuristics/SKILL.md` — Krug + Nielsen framework
- `ux-heuristics/references/wcag-checklist.md` — WCAG 2.1 AA checklist
- `ux-heuristics/references/audit-template.md` — the per-screen audit format
- `ux-heuristics/references/nielsen-heuristics.md` — per-heuristic detail

The framework is NOT vendored into this repo. Regenerate it on demand with:

```
npx skills use "https://github.com/wondelai/skills" --skill "ux-heuristics"
```

It prints `SKILL.md` and reports the directory holding `references/`.
The table below is the binding part and stands on its own if the skill is unavailable.

### Why this matters here

The user is a school director: non-technical, on a phone, often during an actual flood.
Cognitive bandwidth is low and the stakes are real. "Don't Make Me Think" is not a nicety.

### Heuristics that bind directly to this spec — non-negotiable

| Heuristic | Spec section | Concrete requirement |
|---|---|---|
| Recognition over recall (N6) | §5.1 "Mostrar antes de pedir" | Landing shows current state BEFORE any form. Never open a blank form over existing data. |
| Match system & real world (N2) | §5.4 | Use the spec's exact Spanish wording. Banned: "versión", "entidad", "registro histórico", "persistencia". |
| Error prevention (N5) | §14, §9 | Warn on a motivo already present in the parte. Recommend, never auto-decide (§18.14). |
| Visibility of system status (N1) | §17 | Every state has copy: sin situación, sin cambios guardables, guardado exitoso, error de conexión. Use the spec's exact strings. |
| Recognize/diagnose/recover (N9) | §17 error | On connection failure the entered data MUST be preserved. "La información ingresada se mantiene…" is a functional promise, not decoration. |
| User control & freedom (N3) | §13 | "Volver y corregir" must actually return with state intact. Back button must never break. |
| Aesthetic & minimalist (N8) | §5.3 | Current info summarized; only the section being changed expands. One primary CTA per screen. |
| Progressive disclosure | §12 | Date/time hidden until "Cambiar". This is the Simplicity-vs-Flexibility resolution. |
| Krug #3 "half the words" | §13 | The change summary lists ONLY what changed. Never re-list unchanged data. |
| Tiny tap targets | mobile | Minimum 44x44px. Non-negotiable — phone use is the primary context. |
| Hover-only info | mobile | Forbidden. No critical information behind hover. |
| Low contrast | a11y | WCAG AA 4.5:1 minimum. Severity badges must not rely on color alone. |
| Inline validation | forms | Validate on blur with a specific message. No submit-error-scroll cycle. |

### Dark-pattern boundary

The duplicate-motivo reminder (§14) recommends updating. It must NOT be confirmshaming and must
NOT trap the director. The spec is explicit: "La coincidencia funciona como recomendación.
La decisión final corresponde al director." (§18.14)

### Deliverable addition for every UI batch

Alongside the code, produce a short heuristic audit of the screen you built, using
`references/audit-template.md`, with a severity rating per issue and the 1-10 score.
Fix everything at severity 3+ before reporting done. Report remaining severity 1-2 items.

---

## POST-BATCH STATE (updated as batches land — read this, it overrides earlier guesses)

### Batch 1 — LANDED. Schema exists. Do not redesign it.

Tables now exist in `lib/db/schema.ts` with these EXACT columns (all timestamps are `text()` ISO 8601):

- `infra_periodo`: id, nombre, inicioEn, finEn (nullable), estado, creadaEn.
  Partial unique index `WHERE estado = 'vigente'` — exactly one vigente period.
- `infra_parte`: id, periodoId (FK), cueAnexo, estadoEstablecimiento (default 'habitual'),
  estadoEstablecimientoRigeDesde, corteId, creadaEn, actualizadaEn.
  Unique on `(cueAnexo, periodoId)`.
- `infra_afectacion`: id, parteId (FK cascade), motivo, categoria, severidad, descripcion,
  rigeDesde, creadaEn, retiradaEn (nullable — soft delete, keeps historial intact).
- `infra_afectacion_seccion` / `infra_afectacion_alumno`: mirror the `infra_problematica_*`
  shape exactly (composite PK, cascade, "absence of an alumno row = whole section").
- `infra_servicio_alcance`: id, parteId (FK cascade), tipo, referenciaId (nullable text),
  estado, rigeDesde, creadaEn, retiradaEn (nullable).
- `infra_movimiento`: id, parteId (FK cascade), tipo, rol,
  `resumen` (JSON in a text column, typed `.$type<Record<string, unknown>>()`),
  rigeDesde, creadaEn. **APPEND-ONLY — never UPDATE or DELETE a movimiento.**
- `infra_problematica.parteId`: nullable text FK to `infra_parte.id` (the additive link).

### Migration mechanism — IMPORTANT, this project has no drizzle-kit

There is no `drizzle.config.ts` and no `drizzle-kit generate/push` workflow.
The real migration is a hand-maintained `HUB_DDL` string in `lib/db/seed.ts`, applied
idempotently via `executeMultiple` on every app start (`ensureSeeded()`).
Schema changes to EXISTING populated tables go through the `ensureXColumn()` pattern
(PRAGMA check + `ALTER TABLE ADD COLUMN`, nullable — SQLite cannot add NOT NULL to a
populated table). Follow this. Do NOT introduce drizzle-kit.

`backfillPeriodoYPartes()` in `lib/db/seed.ts` runs automatically inside `seedHub()` and is
idempotent (only touches `infra_problematica` rows where `parte_id IS NULL`).

### Known caveat inherited from the backfill — Batch 3 must address

The backfill sets each new `infra_parte.corteId` from the `infra_problematica` row with the
max `creadaEn` for that `cueAnexo`, because no "corte vigente per cue" source existed at
backfill time. This is a heuristic for legacy rows only.
**Batch 3 must set `corteId` explicitly on parte creation, from the actual corte vigente
(`getCorteVigente`), and must never rely on this heuristic for new partes.**

### Batch 0 — LANDED. Reuse it, do not rebuild it.

`components/infraestructura/vigencia-field.tsx`:
```ts
export interface VigenciaFieldProps {
  value: string                 // ISO 8601, e.g. new Date().toISOString()
  onChange: (value: string) => void
  label?: string                // default "Rige desde"
  id?: string
  disabled?: boolean
}
```
Controlled. Emits ISO 8601 strings that plug straight into the `rigeDesde` text columns.
Styles live in `app/globals.css` under `.vigencia-field*`.

Testing gotcha for consumers: native date/time inputs cannot be driven with
`userEvent.type()` in jsdom. Use
`fireEvent.change(input, { target: { value: 'YYYY-MM-DD' | 'HH:mm' } })`.

### Baseline to protect

`pnpm test` is currently **459/459 passing across 57 files**. Any batch that lands fewer
passing tests than that has broken something. Report the real number.

Pre-existing unrelated TS errors live in `scripts/padron-ge.test.ts` and
`components/infraestructura/formulario-problematica.test.tsx`. Not yours, do not "fix" them.

### Batch 2 — LANDED. Pure domain layer exists. Call it, do not reimplement it.

All in `lib/infraestructura/`, framework-free (no DB, no React, no fetch) so route handlers
and components can share them:

| Module | Responsibility |
|---|---|
| `trayectoria-tipos.ts` | Domain types. Reuses the existing `Severidad` and `Categoria` unions. |
| `servicio-educativo.ts` | `calcularEstadoServicioGeneral` → normal / parcial / suspendido. Derived, never persisted, never offered to the director as a choice (§3.4). Suspending one section does not mark its siblings (§10). |
| `vigencia-alcance.ts` | `resolverAlcanceVigente` — which rows are in effect at a given instant, honouring future `rigeDesde` and soft deletes. |
| `movimiento-diff.ts` | Diff engine between two snapshots of a parte. Feeds `infra_movimiento.resumen`. An unchanged parte must produce an EMPTY diff so the UI can disable saving (§17). |
| `movimiento-descripcion.ts` | Renders a diff into the plain Spanish of §13 and §15. |
| `duplicado-motivo.ts` | Detects an already-present motivo. Recommends, never decides (§18.14). |
| `validacion-trayectoria.ts` | Server-side Zod schemas. Categoría is still resolved from the motivo; the client never sends it. |

### Current baseline — protect it

`pnpm test` → **530 passing across 63 files**. Any batch landing fewer has broken something.
Report the real number.

### Outstanding before this leaves draft

No adversarial fresh-context review has been run on the batch 0-2 diff — it was paused for
time. Do it before taking PR #24 out of draft, focused on `movimiento-diff.ts` and
`calcularEstadoServicioGeneral`: if those two lie, all four remaining screens display false data.

### Batches 3 a 7 — LANDED. El mapa de batches esta completo.

| Batch | Commit | Que dejo |
|---|---|---|
| 3 | `362cfef` | Route handlers del parte y del historial, `parte-consulta.ts`, `secciones-cue.ts`. `corteId` se fija desde `getCorteVigente` al crear el parte: la heuristica del backfill ya no se usa para partes nuevos. Agrega `infra_movimiento.idempotency_key` via `ensureXColumn`. |
| 4 | `26ca101` | Pantalla de estado actual (`estado-actual-*`, `app/problematicas/parte/page.tsx`). |
| 7 | `0dd6b78` | Historial (`historial-*`, `app/problematicas/parte/historial/`). |
| 5 | `80fb40d` | Reporte inicial y gestion de afectaciones (`reporte-inicial-form`, `afectacion-borrador`, `app/problematicas/parte/nuevo/`). |
| 6 | `76f5f7b` | Actualizacion, resumen de cambios y antiduplicado (`actualizacion-form`, `actualizacion-parte.ts`, `app/problematicas/parte/actualizar/`). |

### La revision adversarial pendiente — HECHA, y encontro cosas. Commit `11c745c`.

Era el punto que este documento dejaba abierto antes de sacar el PR #24 de draft. Tres hallazgos confirmados, los tres con test que fallaba:

1. **`diffParte` daba diff vacio ante cambios reales.** Para una afectacion existente solo comparaba severidad y alcance: motivo, categoria, descripcion y `seccionCompleta` pasaban sin ser vistos. Como un diff vacio deshabilita el guardado (§17), el director perdia la edicion en silencio. Se agrego la variante `datosCambiados`, aditiva: los `infra_movimiento.resumen` ya persistidos se siguen leyendo, con guarda `?? []` en `movimiento-descripcion.ts`.
2. **`calcularEstadoServicioGeneral` era no-determinista.** Ante empate exacto de `rigeDesde`, ganaba la ultima fila del array. La misma base podia mostrar `normal` o `suspendido` segun como volviera la consulta.
3. **`resolverAlcanceVigente` tenia el mismo patron.** Mismo arreglo en los dos: desempate estable por `creadaEn` y luego por `id`. Esta comentado en el codigo: no lo quiten "simplificando".

Los tests adversariales quedan en el repo (`*.adversarial.test.ts`) como cobertura permanente.

### Auditorias UX — HECHAS para las pantallas que se habian saltado. Commit `c90d964`.

`docs/auditoria-ux-estado-actual.md` y `docs/auditoria-ux-historial.md`. Tres hallazgos de severidad 3 corregidos; los de severidad 1 y 2 quedan documentados sin corregir. El mas relevante: `historial-formato.ts` formateaba con la hora del dispositivo mientras `estado-actual-textos.ts` usaba el huso de la provincia, asi que dos pantallas del mismo parte podian mostrar horas distintas del mismo movimiento.

### Baseline actual — protegerla

`pnpm test` → **678 pasando en 84 archivos**. Cualquier batch que deje menos rompio algo. Reporta el numero real.
