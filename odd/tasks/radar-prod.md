# Radar en producción: que funcione bien (QA de N1)

Rama `feat/radar-prod` (base `origin/staging` 417d058). N1 coordina; N2 lidera; N3 (Codex gpt-6-luna, effort high) implementa.

## Objetivo
Corregir el Radar con el código de producción y datos reales (7 días, 9 alertas SMN próximas).

## Problemas
- R1 (bloqueante) Las alertas del SMN tapan el mapa: una pastilla compacta sobre el mapa; listado completo, agrupado por evento+horario, en el sidebar (sección "Alertas del SMN").
- R2 (bloqueante) El panel dice "Todavía no hay un pronóstico disponible" aunque hay pronóstico: mostrar resumen del pronóstico (`/radar-meteo/resumen`) por horizonte cuando el motor de riesgo no tiene datos.
- R3 (verificación) La capa de lluvia: test con payload real reducido; corregir si hay bug.

## Restricciones
- No tocar el flujo del parte (`components/infraestructura/**`, `lib/infraestructura/parte/**`, `app/api/problematicas/**`, `app/problematicas/**`, `movimiento-descripcion*`, `estado-actual-textos.ts`). `app/globals.css`: sólo `.map-*` y `.radar-*`.
- TDD: activo por pedido. Runner: `pnpm exec vitest run <archivos>` vía `heavy.sh`.
- Ruta por task: delegada (N3 nuevo por task); N2 sólo verifica y commitea. Disparador: escritor para 2+ archivos no triviales.

## Diseño
- Estado de alertas elevado a `map-infraestructura-page`: hook `useResumenRadarMeteo` (extrae el fetch de `RadarMeteo`) alimenta `RadarMeteo` (pastilla + resaltado) y `PanelRadar` (sección + resumen de pronóstico). La alerta seleccionada es estado de la página.
- Horizontes sobre `departamentos[].dias[]` del resumen: 24 h = día 1; 72 h = 3 días; 10 días = todos los disponibles (máx. 7). Probabilidad máx. sólo de `proximas48h`.

## Tasks
- [x] T1 R1: lib `alertas-agrupadas` (agrupar por evento+severidad+onset+expires, texto de la pastilla) + hook `useResumenRadarMeteo`
- [ ] T2 R1: pastilla sobre el mapa + `RadarMeteo` controlado (resumen/alerta por props) + wiring en la página
- [ ] T3 R1: sección "Alertas del SMN" en el sidebar (`PanelRadar`), detalle expandible, CSS
- [ ] T4 R2: lib `pronostico-horizonte` (agregación por horizonte desde el resumen) + tests
- [ ] T5 R2: `PanelRadar` con resumen de pronóstico + clic en departamento centra el mapa
- [ ] T6 R3: test de la capa de lluvia con payload real reducido (+ fix si hay bug)
- [ ] T7 Gate final (tsc, lint, suite completa) y reporte

## Evidencia
- T1: tsc limpio; vitest alertas-agrupadas + use-resumen + components/mapas/radar-meteo: 34 pasan. Ruta: delegada (N3).
