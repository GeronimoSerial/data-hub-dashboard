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
- [x] A3 Hallazgos 2, 12: "desde" con `situacionPrincipal` + `creadaEn`, formato absoluto
- [x] A4 Hallazgo 4: tinta por gravedad + test de contraste ≥ 4,5:1
- [x] A5 Hallazgos 5, 16: sección Situaciones completa + edificio en la ficha
- [x] A6 Hallazgos 8, 14: Estadísticas con etiquetas traducidas; gravedad desde `SEVERIDADES`
- [x] A7 D1 Sin dato + hallazgos 6 y 9
- [x] A8 D2 clases/edificio + hallazgo 7
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

- **A3** — La ficha usa `situacionPrincipal` (criterio único) y `desde()` del parte (export de una palabra en `entrada-actualizar.tsx`); `creadaEn` se expone en el endpoint del mapa `parte/route.ts` y en `AfectacionFicha`. Hallazgo 2 confirmado (la API de la ficha no mandaba `creadaEn`). Evidencia: vitest ficha + endpoint parte 26/26, tsc limpio.
- **A4** — La banda usa `TINTA_POR_SEVERIDAD` (export de una palabra); test de contraste calculado WCAG ≥ 4,5:1 en los 4 niveles (6,93 / 5,84 / 4,83 / 10,02). Evidencia: vitest 25/25, tsc limpio.
- **A5** — Ficha: por situación motivo, `EstadoActualSeveridad`, alcance (`resumirAlcance`), desde absoluto, causada por, descripción (antes "Afecta"), categoría; "Última novedad" una sola vez; fila "Edificio" con `ETIQUETA_ESTABLECIMIENTO`. El endpoint del mapa expone `causadaPorId`. Evidencia: vitest 24/24 + endpoint, tsc limpio.
- **A6** — Estadísticas traduce la categoría con `CATEGORIA_META`; la gravedad se deriva de `SEVERIDADES` (`lib/infraestructura/mapa/gravedad.ts`) y reemplaza las tres tablas duplicadas; fixtures con valores reales. Evidencia: vitest components/mapas + lib/infraestructura/mapa 342/342, tsc limpio.
- **A7** — Estado `sin_dato` (asistencia null) y `brinda` (brinda sin modalidades); "No se brinda" sólo con `brinda:false`. Filtro "Asistencia pedagógica": Se brinda / No se brinda / Sin dato (se quitan las opciones virtual/cuadernillo por decisión D1; las modalidades siguen en el chip y la ficha). Panel: "N de M … brindan asistencia pedagógica" + "K sin dato"; Estadísticas con KPI de sin dato. Los identificadores `apoyo` se conservan (sólo cambia el texto visible). Evidencia: vitest 372/372, tsc limpio.
- **A8 (D2)** — Conclusión: (a) FALSO en el mapa: `listarPartesVigentes` ya descartaba partes sin situaciones abiertas (ahora con test de integración). (b) REAL: con sólo una situación de alumnos abierta, el edificio/servicio viejo del parte se mostraba (evacuado / sin clases). **Origen: el servidor del parte no resetea el edificio ni el servicio al solucionar** (`app/api/problematicas/parte/route.ts` ~774-782 sólo marca `retiradaEn`/`cierre`; el edificio sólo cambia si el envío trae `estadoEstablecimiento`), y la categoría 'alumnos' omite el paso clases/edificio. No se tocó el parte. Corrección en el mapa: clases, estado del edificio, servicio, indicadores y `alumnosAlcanzados` sólo consideran el estado del parte si hay una situación ABIERTA de categoría 'establecimiento' (`enriquecer.ts`, `parte-mapa.ts`); la ficha oculta la fila "Edificio" en el mismo caso. Evidencia: tests unitarios + integración (evacuado sin situaciones abiertas; evacuado + alumnos), vitest lib/infraestructura + components/mapas + app/api/mapas 169 archivos verdes, tsc limpio. Se informó a N1.
