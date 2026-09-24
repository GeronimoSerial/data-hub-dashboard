# UX/visual — E0: Base operativa, contratos y recuperación

Batch E0 del plan de ejecución ENOS 2026/2027 (§6-E0, §2A, §7). Revisión de
código y del sistema de diseño existente (`design.md`, `app/globals.css`), no
auditoría visual de una instancia en ejecución: las capturas reales quedan
**pendientes** (ver sección "Pendientes"), como permite explícitamente el
plan cuando no se puede levantar la app dentro del dispatch.

## Alcance visible de E0

E0 no agrega ninguna pantalla operativa nueva de cara a directores,
Planeamiento ni jerarquías superiores: los flags `RISK_ENGINE_ENABLED`,
`RISK_RADAR_ENABLED` y `AI_BRIEFING_ENABLED` están apagados por defecto, así
que el único artefacto de UI nuevo es el **panel interno de operación**
(`/admin/operacion`), exclusivo para operadores autorizados (roles `admin` y
`editor`, vía `adminPageGate`/`staffGuard`, los mismos guards que ya protegen
`/admin`). No hay cambios en el home del hub, en el mapa de infraestructura ni
en los formularios de parte/verificación.

## Inventario de pantallas y componentes existentes (relevantes para audiencias de riesgo)

| Pantalla/componente | Ruta/archivo | Audiencia actual | Rol en el plan ENOS |
|---|---|---|---|
| Mapa de infraestructura | `components/mapas/map-infraestructura-page.tsx`, `app/api/mapas/infraestructura/route.ts` | Planeamiento / jerarquías (vía guarda de acceso por recurso) | Base sobre la que E4 monta el Radar (Ahora/+24/+48/+72) |
| Indicadores (panel de 8 cifras) | `components/infraestructura/indicadores.tsx` | Igual que el mapa | E4 lo reemplaza por un resumen contextual acotado (§2A) |
| Lista de alertas | `components/infraestructura/lista-alertas.tsx` | Igual que el mapa | Base de la futura cola priorizada (E4/E5) |
| Ficha de parte | `components/infraestructura/ficha-parte-modal.tsx`, `historial-parte-modal.tsx` | Igual que el mapa | Base de la ficha contextual ampliada (riesgo/verificación) de E3/E4 |
| Reporte inicial (director) | `components/infraestructura/reporte-inicial-form.tsx` | Sesión escolar (`acceso-publico.ts`) | E1 agrega el fast path de verificación sin afectación, sin tocar este flujo |
| Actualización de parte | `components/infraestructura/actualizacion-form.tsx` | Sesión escolar | E1/E3 deben desacoplar detalle técnico del riesgo de esta pantalla |
| Panel de administración | `app/(hub)/admin/page.tsx`, `components/admin-page.tsx`, `components/admin-shell.tsx` | `admin`/`editor` (`adminPageGate`) | **Nuevo en E0**: se agrega la sección "Operación → Salud" |
| **Panel de salud operativa (nuevo)** | `app/(hub)/admin/operacion/page.tsx` | `admin`/`editor` | Entregable de E0: flags + estado de `infra_job_run` |

## Mapa de tareas por persona y permisos existentes

| Persona | Permiso existente que la identifica | Tarea principal | ¿Ve el panel de operación E0? |
|---|---|---|---|
| Director | Sesión escolar por CUE (`lib/infraestructura/acceso-publico.ts`), sin rol `admin`/`editor` | Responder/actualizar su escuela | No — `adminPageGate` la rechaza (`forbidden`) |
| Planeamiento | Rol `editor` (o `admin`) + acceso al recurso `/mapas/infraestructura` (`recursos`/`acceso-lectura.ts`) | Analizar territorio, priorizar | Sí, si además tiene rol `editor`/`admin` (no todo lector del mapa lo tiene: la audiencia del recurso ABM es independiente del rol de staff) |
| Jerarquías superiores | Igual que Planeamiento, vía audiencia del recurso | Lectura ejecutiva | Igual que Planeamiento |
| Responsable de seguimiento | Sin tabla propia todavía (E1/E5 la introducen); hoy se superpone con Planeamiento | Gestionar verificaciones | No aplica en E0 (no hay verificaciones todavía) |
| Operador técnico (nuevo, implícito en E0) | Rol `admin`/`editor` (`staffGuard`) | Ver estado de jobs/flags | Sí — es la audiencia exclusiva del panel nuevo |

**Restricción verificada por código, no sólo documentada**: `staffGuard` en
`GET /api/infraestructura/operacion/salud` devuelve 401 sin sesión y 403 para
rol `consulta` (cubierto por `route.test.ts`); `adminPageGate` en
`/admin/operacion` redirige a `/login` o `/forbidden` en los mismos casos. Un
lector del mapa con rol `consulta` (acceso sólo por audiencia del recurso, sin
rol de staff) no ve el panel ni puede llamar al endpoint — el permiso de
lectura del mapa no habilita el panel de operación, tal como exige §1.

## Bocetos en texto (tokens actuales, `app/globals.css`)

### Panel de operación (`/admin/operacion`, entregado en E0)

```text
Operación                                    [breadcrumb: Administración]
────────────────────────────────────────────────────────────────────────
Flags
  riskEngineEnabled: false
  riskRadarEnabled:  false
  aiBriefingEnabled: false
  riskMode:          shadow
────────────────────────────────────────────────────────────────────────
Jobs
  tipo          estado       intento  actualizadaEn            error
  diagnostico   completado   1        2026-09-23T21:00:00Z     —
  (fila con estado='fallido' o leaseVencido=true se resalta en var(--danger))

  [vacío legítimo] "Sin ejecuciones registradas todavía"
────────────────────────────────────────────────────────────────────────
Generado en: 2026-09-23T21:05:00Z
```

Reutiliza filas/divisores (`var(--line)`) en vez de tarjetas anidadas, sin
sombras decorativas, colores reservados a estado (`var(--danger)` sólo para
fallas), consistente con la regla de §2A. No introduce iconografía nueva más
allá de un ícono ya presente en `lucide-react` (`Activity`, usado sólo en el
ítem de navegación del sidebar de administración).

### Centro de Situación, ficha y fast path (E0 no los construye; boceto de referencia para E2–E5)

E0 no implementa estas pantallas — son composición futura sobre el mapa
existente (E2 ficha territorial, E3 ranking interno, E4 Radar, E5 Centro de
Situación). El boceto funcional ya está fijado en el plan de ejecución §2A
("Composición ideal para Planeamiento y jerarquías superiores") y no se
repite aquí para no duplicar una fuente de verdad; el trabajo de E0 en esta
área es **preparatorio**: los contratos de `lib/infraestructura/riesgo/`
(clases observado/pronosticado/calculado/confirmado, tiempos UTC) son los que
E2/E3 usarán para que la ficha distinga "Situación confirmada" de "Riesgo
calculado" sin inventar una taxonomía nueva en cada batch.

## Qué reemplaza cada bloque nuevo

| Bloque nuevo (E0) | Reemplaza / convive con | Justificación |
|---|---|---|
| Sección "Operación → Salud" en `admin-shell.tsx` | Nada existente — es una sección nueva en el sidebar, visible sólo para `role==='admin'` (mismo filtro que ya aplica a "Organización"/"Accesos") | No agrega ruido al home del hub; vive exclusivamente dentro de `/admin`, ya gateado |
| Página `/admin/operacion` | Nada existente | Primera superficie de "salud técnica" que exige el plan (§2A: "Salud técnica y administración se consultan desde herramientas internas") |

## Matriz de estados (panel de operación)

| Estado | Disparador | Tratamiento visual |
|---|---|---|
| Sin ejecuciones | `jobs.length === 0` | Texto "Sin ejecuciones registradas todavía" (vacío legítimo, no error) |
| Job completado | `estado === 'completado'` | Fila normal |
| Job en progreso | `estado === 'en_progreso'`, lease vigente | Fila normal |
| Job fallido | `estado === 'fallido'` | Fila resaltada `var(--danger)` |
| Lease vencido (proceso muerto) | `leaseVencido === true` | Fila resaltada `var(--danger)` |
| Sin acceso | rol sin `staffGuard`/`adminPageGate` | 401 (sin sesión) / 403 o redirect a `/forbidden` (sin rol) — nunca contenido parcial |

## Recorridos probados (evidencia técnica, no gate humano)

- `app/api/infraestructura/operacion/salud/route.test.ts`: sin sesión → 401;
  rol `consulta` → 403; rol `editor`/`admin` → 200 con la forma esperada; el
  GET no inserta filas en `infra_job_run` (verificado contando filas antes y
  después).
- Recorrido de código de `/admin/operacion` (`page.tsx`): mismo gate que
  `/admin`, ya cubierto por el patrón existente de esa página; no se agregó
  un test de componente para este server component en este dispatch (ver
  Pendientes).

## Pendientes

- **Capturas baseline reales** (desktop 1366×768, móvil 390×844, 320px,
  zoom 200%, tema oscuro) del panel `/admin/operacion`: pendientes porque
  este dispatch no levantó la app en un navegador. Comando exacto para
  producirlas: `pnpm dev` (o `docker run` con la imagen ya construida) y
  navegar a `/admin/operacion` autenticado con un usuario `admin`/`editor`
  de prueba (ver `ADMIN_EMAIL`/`ADMIN_PASSWORD` en `lib/db/seed.ts`).
- **Gate UX con participantes**: no aplica a este batch tal como lo permite
  §7 ("en batches puramente técnicos se valida el flujo afectado... sin
  nuevo estudio") — E0 no introduce ninguna tarea nueva para director,
  Planeamiento ni jerarquías superiores; el único público del panel nuevo es
  el operador técnico interno, y su recorrido ya está cubierto por los tests
  de la sección anterior. Queda explícito que **ninguna prueba con
  participantes humanas** se ejecutó, consistente con la restricción del
  batch.
- **Test de componente para `/admin/operacion`**: no se escribió un test de
  React Testing Library para el server component (requiere mockear
  `next/navigation` y `getSessionUser`); la cobertura de acceso equivalente
  ya existe indirectamente vía `route.test.ts` del mismo guard. Queda como
  mejora menor sin dueño de fecha asignado.
