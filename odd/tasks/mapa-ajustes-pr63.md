# Ajustes del mapa tras la PR #63 (parte)

Rama `feat/mapa-ajustes` (base `feat/staging` ab07529). Coordina N1; lidera N2; implementa N3 (Codex gpt-6-luna, effort high).

## Objetivo
Alinear el mapa de infraestructura con el modelo del parte (PR #63): historial y ficha correctos, vocabulario único, asistencia pedagógica "Sin dato", situaciones recién solucionadas, un solo sidebar sin movimiento en hover y Capas como pestaña.

## Decisiones del usuario
D1 Sin dato de asistencia pedagógica · D2 verificar clases/edificio desactualizados · D3 vocabulario del parte en todo el mapa · D4 situaciones recién solucionadas (`recientes`, excluir `cierre='retirada'`) · D5 sidebar único, nada se mueve en hover · D6 Capas como quinta pestaña.

## Restricciones
- No tocar el flujo del parte (`components/infraestructura/**`, `lib/infraestructura/parte/**`, `app/api/problematicas/**`, `app/problematicas/**`, `movimiento-descripcion*`, `estado-actual-textos.ts`), salvo un `export` de una línea.
- `layer-control`, `legend-panel`, `basemap-control`, `title-panel` los usa el mapa de matrícula: no borrar.
- `app/globals.css`: sólo reglas `.map-*` y `.radar-*`.
- TDD: activo por pedido (test primero). Runner: `pnpm exec vitest run <archivos>` vía `heavy.sh`.
- Route: cada task = un N3 nuevo (inline: ninguna; N2 sólo verifica y commitea). Disparador: escritor para 2+ archivos no triviales → N3.

## Tasks
- [x] A1 ODD + verificación de los 17 hallazgos
- [x] A2 Hallazgos 1, 3, 13: historial de la ficha (`situacionesHistoricas` sin retiradas, `LineaDeTiempo`)
- [ ] A3 Hallazgos 2, 12: "desde" con `situacionPrincipal` + `creadaEn`, formato absoluto
- [ ] A4 Hallazgo 4: tinta por gravedad + test de contraste ≥ 4,5:1
- [ ] A5 Hallazgos 5, 16: sección Situaciones completa + edificio en la ficha
- [ ] A6 Hallazgos 8, 14: Estadísticas con etiquetas traducidas; gravedad desde `SEVERIDADES`
- [ ] A7 D1 Sin dato + hallazgos 6 y 9
- [ ] A8 D2 clases/edificio + hallazgo 7
- [ ] A9 D3 vocabulario + hallazgos 10, 11 + comentarios viejos
- [ ] A10 D4 recién solucionadas + hallazgo 15
- [ ] A11 D5 sidebar único + sin movimiento en hover
- [ ] A12 D6 Capas como pestaña
- [ ] A13 Header compacto en /mapas/* (sin franja de logos, pestañas + filtros en una fila, búsqueda como lupa); resto de la app sin cambios
- [ ] A14 Bug: cruces de agua del sidebar vs marcadores de la ruta (causa raíz en el ODD)

## A1 — Verificación de los hallazgos (lectura de código, 2026-10-05)
| # | Veredicto | Evidencia |
|---|-----------|-----------|
| 1 | Real | `ficha-escuela-panel.tsx:117` filtra `reporte_inicial`; el servidor lo emite sólo para parte nuevo (`route.ts:882`). `situacionesHistoricas` llega a la ficha. |
| 2 | Real | `fechaSituacionPrincipal` (`ficha-escuela-panel.tsx:41-53`) reordena con gravedad desc + `rigeDesde` asc; el mapa usa `situacionPrincipal`. |
| 3 | Real | Tests con fixtures imposibles (dos `reporte_inicial` en un parte). Se reescriben en A2/A3. |
| 4 | Real | `TINTA_POR_SEVERIDAD` existe sin exportar en `estado-actual-severidad.tsx:7-12`; la ficha usa texto blanco. |
| 5 | Real | Sección Situaciones muestra Categoría / "Afecta" (descripción) / Última novedad (`ficha-escuela-panel.tsx:178-198`). |
| 6 | Real | `derivarApoyo` devuelve `'no'` con asistencia null (`enriquecer.ts:35-36`). |
| 7 | **Parcial** | (a) FALSO en el mapa: `listarPartesVigentes` descarta partes sin afectaciones vigentes (`parte-mapa.ts` "Regla de dominio", `vigentes.length === 0 → continue`), así que una escuela sin situaciones abiertas no llega con clases afectadas. (b) REAL: con sólo una situación de alumnos abierta, `derivarClases` aplica el edificio/servicio viejo del parte (el servidor no resetea al solucionar: `route.ts:774-782` sólo marca `retiradaEn`/`cierre`). Origen en el servidor; no se toca el parte, se corrige del lado del mapa (A8). Además D4 introduce escuelas sin situaciones abiertas, que deben derivar `normal`. |
| 8 | Real | `categoriaPrincipal` vale `establecimiento`/`alumnos` (`enriquecer.ts`); `agregar.ts:68` y `etiquetaFila` no traducen. |
| 9 | Real | Mapa usa "Apoyo", "Sin apoyo", "Brinda/No brinda" (`etiquetas.ts`, `etiqueta-apoyo.ts`). |
| 10 | Real | Eje mezclado en `ETIQUETA_CLASES` del mapa; colisión de nombre con la del parte (`estado-actual-textos.ts:107`). |
| 11 | Real | "Sin reporte" (`etiquetas.ts:50`, `leyenda-mapa.tsx:96`), "Sin reportes abiertos", "Cargar o actualizar el parte". |
| 12 | Real | "desde hace…" en la ficha (`tiempo-relativo.ts`). |
| 13 | Real | La ficha usa `HistorialMovimiento`; el canónico es `LineaDeTiempo`. |
| 14 | Real | Tres tablas de gravedad duplicadas (`enriquecer.ts`, `panel-situacion-actual.tsx`, `etiquetas.ts`). |
| 15 | Real | `situacionesHistoricas` es `COUNT(a.id)` sin excluir `cierre='retirada'` (`parte-mapa.ts` ~690). `cierre`/`recientes` no se leen en el mapa. |
| 16 | Real | `punto.ts` y chips no muestran edificio "Uso parcial"/"Sin daños". |
| 17 | Real | `FichaParteModal` sólo aparece en un comentario (`map-infraestructura-page.tsx:827`). No se borra `ficha-escuela-modal*`; sólo se revisa el comentario. |
| extra | Matiz | Hay comentarios con "sin reportar"/`sinReportar` en `umbrales.ts:14`, `construir-escuelas-mapa-feature-collection.ts:46`, `map-infraestructura-page.tsx` (185, 201, 664, 1539, 1685), `severidad-visual.test.ts` y `seed-demo-partes.mjs`; se actualizan en A9. |

## Evidencia por task
(se completa a medida que se cierran)

- **A2** — `situacionesHistoricas` excluye `cierre='retirada'` (conserva NULL); ficha: encabezado "N situación(es) registrada(s)" desde `situacionesHistoricas` + `LineaDeTiempo limite=5`; fixtures reales de `MovimientoHistorial`. Evidencia: vitest ficha + parte-mapa 43/43 verde, tsc limpio. Ruta: delegada (N3 + un N3 de corrección por tests síncronos sobre un encabezado que espera la carga).
