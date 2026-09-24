# Gate E0 — Base operativa, contratos y recuperación

| Campo | Valor |
|---|---|
| Decisión N1 | **Aceptado técnicamente para merge a `main` local.** Pendiente de revisión del usuario antes de habilitar E1. |
| Estado | Implementado · validado técnicamente · **no** habilitado operativamente |
| Responsable | N1 (coordinador raíz) |
| Base | `f4cc0eb` (main) → rama `feat/enos-e0` |
| Fecha | 2026-09-24 |
| Run Orca | `run_3ae1abf38965` |

## Rondas de gate

| Ronda | Dispatch | Resultado | Motivo |
|---|---|---|---|
| 1 | `ctx_52e4a1ad2de7` (E0) | Devuelto | **Bloqueante:** el lease no tenía fencing (`leaseOwner` no se devolvía ni se exigía en `renovarLease`/`publicarResultado`): un proceso colgado podía publicar sobre el lease que otro había recuperado. Menores: faltaba `Cache-Control: private, no-store` en la API de salud; un comentario del esquema contradecía el `notNull`. |
| 2 | `ctx_878f4b155b61` (E0-fix1) | Devuelto | Fixes de la ronda 1 verificados. **Bloqueante:** el backup hacía checkpoint y luego `copyFileSync` sin lock; un auto-checkpoint concurrente podía dejar una copia corrupta (clase «pérdida de datos», §7). Menor: `job-diagnostico` salía con exit 0 aunque perdiera el lease. |
| 3 | `ctx_47a8defb7948` (E0-fix2) | **Aceptado** | Backup con `VACUUM INTO` (integridad verificada por test) y exit 3 ante lease perdido. |

## Verificación global ejecutada por N1 (ronda 3)

| Comando | Exit | Resultado |
|---|---|---|
| `pnpm test` | 0 | 103 archivos, 821/821 tests (baseline: 811) |
| `pnpm lint` | 0 | sin errores |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build de producción completo |

## Evidencia revisada por N1

- Diff completo de la rama contra `f4cc0eb`.
- Lease (`lib/infraestructura/riesgo/job-run.ts`): inserción con `onConflictDoNothing` + recuperación CAS condicionada a `fallido` o lease vencido; fencing por `leaseOwner` en renovación y publicación; tests de proceso colgado (publicar/renovar con token viejo → `false`).
- Migración aditiva: `CREATE TABLE/INDEX IF NOT EXISTS` en `HUB_DDL` (`lib/db/seed.ts`) junto al esquema Drizzle; tests de instalación vacía y upgrade.
- API de salud: `staffGuard` (admin/editor), mismo criterio que `adminPageGate` del panel; 401/403/200 y `Cache-Control` probados. El GET sólo lee.
- Flags apagados por defecto; `RISK_MODE` inválido cae a `shadow`.
- Job de diagnóstico probado dentro de la imagen Docker (`evidencias/docker-diagnostico.log`): exit 0 y segunda invocación sin efecto.

## Autoría (para la revisión del usuario)

Los N3 (opencode `deepseek-v4.1-flash`; los primeros con `v4-flash`) implementaron contratos, flags, esquema/DDL, el `route.ts` de salud y todas las correcciones de fix1 y fix2. El N2 escribió directamente, tras timeouts repetidos de N3 con el límite original de 420 s: `job-run.ts` (versión inicial), backup/restore (versión inicial), `job-diagnostico`, `Dockerfile`, `salud.ts` y retoques del panel (`admin-shell.tsx`). Causa corregida en fix1: timeout 560 s y N3 sin `tsc` global. Detalle en `dispatches.json`.

## Pendientes con dueño

| Pendiente | Dueño | Bloquea |
|---|---|---|
| Ensayo de backup/restore y scheduler en staging real (host no definido) | Usuario/operación | Habilitación operativa, no E1 |
| Capturas UX baseline en 390×844 / 1366×768 y recorridos | N2-E1 (primer batch con UI de usuario) | Gate UX de E1 |
| Pruebas con participantes | Usuario | Gates UX con participantes (E1 en adelante) |
| `ensureSeeded()` corre antes del guard en todos los route handlers (patrón transversal existente) | N1, decisión futura | No |
| Archivo temporal de restore puede quedar huérfano si el proceso muere | Quien opere el próximo restore | No |
| Panel de salud usa estilos inline, no componentes de `components/ui` (panel interno) | N2 del batch que toque ese panel | No |

## Siguiente paso

Merge de `feat/enos-e0` a `main` local (sin push). **E1 no se abre hasta que el usuario revise E0 y lo apruebe.**
