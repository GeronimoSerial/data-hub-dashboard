# Registro de ejecución — Batch E7c (interfaz de Replay en el mapa)

Batch E7c del plan de ejecución ENOS 2026/2027: interfaz de usuario para el
motor de replay de solo lectura construido en E7b (`lib/infraestructura/replay`,
`GET /api/infraestructura/replay`). Agrega un tercer modo de análisis al mapa
de infraestructura ("Replay"), detrás del flag `REPLAY_ENABLED`, con el mismo
principio rector que E7b: es puramente analítico, de solo lectura, y no agrega
ningún ingreso manual — el único ingreso manual del sistema sigue siendo el
parte que carga la escuela.

Rama `feat/enos-e7c`, worktree propio, base `d2ab5a4` (merge de `feat/enos-e7b`:
motor de replay backend + evaluación temporal).

Nota de proceso: este batch se retomó de una sesión anterior interrumpida por
límite de gasto. Al empezar ya existían, sin commitear: `lib/infraestructura/use-replay.ts`
(hook de lectura del endpoint de replay), `components/mapas/replay-panel.tsx`
(panel de UI: territorio/ventana/vista, línea de tiempo con play/pausa/paso,
export, botón de volver) y su integración completa en
`components/mapas/map-infraestructura-page.tsx` (conmutador de modo con
"Replay" gateado por `props.replayEnabled`, snapshot/restore del estado previo
al entrar y salir de Replay), junto con sus tests unitarios
(`lib/infraestructura/use-replay.test.tsx`, `components/mapas/replay-panel.test.tsx`).
Todo ese trabajo se conservó íntegro. Faltaba únicamente:

1. Pasar `replayEnabled` desde `app/(hub)/mapas/infraestructura/page.tsx` hasta
   `map-client.tsx` (que ya lo aceptaba y reenviaba, sin tocar) — el flag se
   leía y se importaba en `page.tsx` pero nunca llegaba como prop al cliente,
   así que el modo Replay era en la práctica inalcanzable aunque
   `REPLAY_ENABLED=true`.
2. Tests de integración a nivel de página en
   `components/mapas/map-infraestructura-page.test.tsx` (464 líneas antes de
   esta sesión, sin ninguna mención a "replay"): la cobertura existente vivía
   toda en `replay-panel.test.tsx` (aislada del hook real de la página) y
   `use-replay.test.tsx` (aislada del componente).
3. Dos hallazgos de `pnpm lint` sobre el código heredado de la sesión
   anterior (no introducidos por esta sesión, pero bloqueaban el criterio de
   aceptación): un `setState` síncrono dentro de un `useEffect`
   (`react-hooks/set-state-in-effect`) al clampear `frameIndexReplay` cuando
   cambia `replayData`, y un `eslint-disable-next-line` sin efecto en
   `use-replay.ts`.

## Corrección 1 — wiring del flag

`app/(hub)/mapas/infraestructura/page.tsx`: se agregó
`replayEnabled={replayEnabled()}` a la llamada de `<InfraestructuraMapClient>`,
junto a `hazardContextEnabled`, `riskRadarEnabled` y `seasonalEnabled` que ya
se pasaban. Sin cambios en `map-client.tsx` (ya reenviaba la prop
correctamente a `MapInfraestructuraPage`).

## Corrección 2 — tests de integración (modo Replay)

Se agregó, siguiendo el mismo patrón que el mock existente de
`@/lib/infraestructura/use-radar` (`llamadasRadar`), un mock análogo de
`@/lib/infraestructura/use-replay`: registra cada `activo` recibido en
`llamadasReplay.activos` y devuelve un `FIXTURE_REPLAY` con forma real
(`cuadros[].instante`, `nivelesPeligro`, `snapshotRiesgo.{runId,publicadoEn,porEscuela}`,
`afectacionesConfirmadas`, `lluviaObservada`, `saludFuentes`, `vacios`,
`siguienteDesde`) cuando `activo=true`, y `data: null` cuando `activo=false`.
`renderMapa` acepta ahora `replayEnabled?: boolean`; el `beforeEach` resetea
`llamadasReplay.activos`.

Nuevo `describe('MapInfraestructuraPage — modo Replay', ...)` con dos tests:

- **Flag apagado**: sin `replayEnabled`, el botón "Replay" del conmutador de
  modo no existe en el DOM y el hook `useReplay` nunca recibe `activo=true`
  (cubre "flag apagado ⇒ sin modo Replay", a nivel de página — el resto de
  los comportamientos pedidos — sin reproducción automática, play/pausa/paso
  por teclado, etiquetas de las dos vistas, vacíos visibles, enlace al
  export — ya estaban cubiertos de forma aislada por
  `replay-panel.test.tsx`, que no se tocó).
- **Volver restaura el estado**: entrando primero a Radar con una selección
  de departamento activa (click sobre `mock-click-peligro`), luego a Replay,
  y clickeando "Volver a la situación actual" (texto exacto del botón real
  en `replay-panel.tsx:318`), el mapa vuelve al modo Radar con
  `aria-pressed="true"` (nunca fuerza "Situación actual") — ejercita
  `estadoPrevioReplayRef`/`volverDeReplay` de punta a punta, no solo el
  callback aislado que ya testeaba `replay-panel.test.tsx`.

## Corrección 3 — hallazgos de lint sobre código heredado

- `map-infraestructura-page.tsx`: el `useEffect` que clampeaba
  `frameIndexReplay` al cambiar `replayData` llamaba `setFrameIndexReplay`
  síncronamente en el cuerpo del efecto. Se reemplazó por el patrón oficial
  de React "ajustar estado durante el render" (sin efecto): un estado
  `replayDataAnterior` comparado por referencia contra `replayData` en cada
  render, que dispara el clamp inline cuando cambian. Mismo comportamiento
  (nunca deja `frameIndexReplay` apuntando fuera de rango), sin el
  antipatrón de cascading renders que señala `react-hooks/set-state-in-effect`.
- `use-replay.ts:213`: se quitó un `eslint-disable-next-line
  react-hooks/exhaustive-deps` que ESLint marcaba como directiva sin efecto
  (no había ningún warning real que silenciar en esa línea).

## Verificaciones finales

| Verificación | Comando | Resultado |
|---|---|---|
| Test focalizado | `pnpm exec vitest run --maxWorkers=2 components/mapas/map-infraestructura-page.test.tsx` | verde — 16/16 (incluye los 2 tests nuevos de modo Replay) |
| Suite completa | `pnpm exec vitest run --maxWorkers=2` | verde — 187 archivos, 1575 tests |
| Lint | `pnpm lint` | verde |
| Types | `pnpm exec tsc --noEmit` | verde |
| Build | `pnpm build` | verde |

## Archivos tocados en E7c (esta sesión)

- `app/(hub)/mapas/infraestructura/page.tsx`: wiring de `replayEnabled`.
- `components/mapas/map-infraestructura-page.tsx`: fix del clamp de
  `frameIndexReplay` (render-time en vez de efecto).
- `lib/infraestructura/use-replay.ts`: eliminación de directiva ESLint sin
  efecto.
- `components/mapas/map-infraestructura-page.test.tsx`: mock de
  `use-replay`, extensión de `renderMapa`, dos tests nuevos de integración
  del modo Replay.
- `docs/ejecucion-enos/E7c/registro.md`: este documento.

Sin cambios en `replay-panel.tsx`, `replay-panel.test.tsx`, `use-replay.test.tsx`
ni `map-client.tsx`: ya estaban terminados y verificados por la sesión
anterior.

## Pendientes explícitos para N1

Ninguno funcional. Queda pendiente la decisión de producto/UX de si el modo
Replay necesita algo más allá de lo ya cubierto por los tests pedidos, y la
revisión y el merge del batch.
