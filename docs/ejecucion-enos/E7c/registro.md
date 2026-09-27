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

## Correcciones del gate N1 e integración

Sesión posterior: revisión N1 (vía N3) marcó **ACCEPT WITH FOLLOW-UPS** con 2
hallazgos MAYOR y 5 MENOR, y pidió integrar con `feat/renovación` (M1: padrón
completo/totales/buscador; P1: nivel de peligro provisorio). Se hizo commit
local del trabajo pendiente (`wip(e7c): interfaz del replay antes de
integrar`) y luego `git merge feat/renovación`.

### Merge con `feat/renovación`

Conflictos en 4 archivos, todos resueltos conservando ambos lados (ningún
lado se descartó):

- `app/(hub)/mapas/infraestructura/map-client.tsx`: prop `replayEnabled` (E7c)
  + prop `visible` (M1, pausa el mapa al ocultar la pestaña) coexisten en la
  llamada a `MapInfraestructuraPage`.
- `components/mapas/map-infraestructura-page.tsx`: mismo par de props en la
  firma del componente; y en `<InfraLegendPanel>`, `mostrarLeyendaPeligro`
  ahora es `radarActivo || replayActivo` (no sólo radar) y
  `hayNivelProvisorio` se calcula por modo activo — de `radarData` en Radar,
  de `cuadroReplayActual.nivelesPeligro.some(n => n.metodo ===
  'umbral_provisorio')` en Replay (nuevo, ver MAYOR 2 más abajo: P1 agregó
  `metodo` al contrato de `nivelPeligroReplaySchema`
  (`lib/infraestructura/replay/tipos.ts:123`), que E7c no leía).
- `lib/infraestructura/riesgo/flags.test.ts`: array `CLAVES` con
  `REPLAY_ENABLED` (E7c) y `SITUACION_ENABLED` (P1).
- `components/mapas/map-infraestructura-page.test.tsx`: los dos `describe`
  nuevos al final (`MapInfraestructuraPage — modo Replay` de E7c y
  `M1: hover de departamento y buscador de escuelas` de renovación)
  concatenados, ninguno reemplazó al otro.

`app/globals.css`, `risk-explanation-panel.tsx`, `legend-panel.tsx` y
`lib/infraestructura/replay/*` (`tipos.ts` con el nuevo campo `metodo`)
mergearon automáticamente sin conflicto de texto.

### MAYOR 1 — `cambiarModo` no reseteaba `playingReplay`

Sólo `volverDeReplay` (botón "Volver a la situación actual") detenía la
reproducción; salir de Replay por el CONMUTADOR (botones "Radar"/"Situación
actual") no tocaba `playingReplay`, así que al volver a entrar a Replay el
cuadro avanzaba solo con el estado de play heredado de la visita anterior.
Fix en `cambiarModo` (`map-infraestructura-page.tsx`): al salir de `'replay'`
hacia cualquier otro modo (por cualquier vía del conmutador), se llama
`setPlayingReplay(false)`. Test nuevo cubre la salida por conmutador
(la salida por "Volver" ya estaba cubierta por el test existente, que se
extendió además para probar horizonte y selección — ver MENOR 3).

### MAYOR 2 — coordenadas del replay salían de `dataVisible`, no del padrón completo

`escuelasConCoordenadas` (usada para los puntos de riesgo/afectación de
Replay) derivaba de `dataVisible.partes`, que se filtra por
`departamentoSeleccionado` — la selección de "Situación actual", ajena al
territorio elegido DENTRO de Replay (`territorioIdReplay`). Una escuela sin
parte vigente hoy (por lo tanto ausente de `dataVisible.partes`) no se
dibujaba en Replay aunque el cuadro reproducido tuviera snapshot de riesgo
para su cueAnexo; elegir en Replay un departamento distinto al filtrado en
"Situación actual" podía dejar el mapa vacío o con puntos incorrectos.

Fix: nuevo memo `escuelasConCoordenadasReplay`, derivado de
`dataEscuelasMapa` (el padrón completo de M1, `useEscuelasMapa`, sin el
filtro de `departamentoSeleccionado`), usado en `puntosRiesgoGeojsonReplay` y
`afectacionesGeojsonReplay`. Se quitó el comentario que decía que la
limitación estaba "documentada en el registro del batch" (no lo estaba —
grep sin resultados antes de este documento).

Test nuevo: agrega una escuela de otro departamento al padrón (sin parte
vigente) y un snapshot de riesgo para su cueAnexo en el cuadro reproducido;
inspecciona el GeoJSON servido a la fuente `infra-replay-riesgo-src` (vía un
mock de `Source` que expone `data` como atributo serializado, ya que
`react-map-gl` no renderiza nada inspeccionable en jsdom) y confirma que esa
escuela aparece. Ambos tests nuevos (MAYOR 1 y 2) se verificaron a mano
revirtiendo cada fix por separado: fallan sin el fix, pasan con él.

### Menores corregidos

- **`siguienteDesde` nunca se leía en la UI** (cursor de paginación, tope 120
  cuadros por consulta; una ventana de más de 30 días se truncaba en
  silencio). Fix: `replay-panel.tsx` muestra un aviso (`role="status"`) con
  el instante hasta donde llegó la consulta cuando `data.siguienteDesde` no
  es `null`. Dos tests nuevos en `replay-panel.test.tsx` (con y sin aviso).
- **Clases `map-replay-panel__*` sin CSS** (el panel dependía sólo de
  estilos heredados). Fix: bloque de layout en `app/globals.css` para
  `.map-replay-panel` y sus `__seleccion`/`__vista`/`__timeline`/
  `__contador`/`__truncado`/`__vacios`/`__export`, mismo patrón que
  `.map-radar-panel`.
- **Test de "Volver" sin aserción real de horizonte/selección restaurados**
  (sólo probaba que volvía el modo). Fix: el test ahora selecciona horizonte
  "72 h" y confirma su restauración además de la del departamento
  (`risk-explanation-departamento`) y el modo.

### Menor no corregido (queda para N1/backend)

- **Posible mismatch de nombre de departamento entre el `<select>` del
  replay y la API**: las opciones salen de `departamentosRaw` (GeoJSON,
  nombre tal cual), pero `lib/infraestructura/replay/consulta.ts` matchea
  contra `infra_geo_profile.departamento` con normalización sólo
  `UPPER+TRIM` (E7b). Un nombre con tilde distinta podría seleccionar un
  departamento que devuelve 0 filas sin error visible. No se tocó: es un
  problema de normalización en la capa de datos de E7b, no de la interfaz de
  E7c, y corregirlo a ciegas sin ver el catálogo real de nombres de
  `infra_geo_profile` arriesga introducir una normalización incorrecta.

### Type fix adicional (post-merge)

`lib/infraestructura/use-replay.ts` mantiene una interfaz `NivelPeligroReplay`
propia (espejo manual del contrato, no importado de
`lib/infraestructura/replay/tipos.ts`) que no se había actualizado cuando P1
agregó `metodo` al schema real — `tsc --noEmit` lo marcó al usar ese campo en
el fix de MAYOR 2. Se agregó `metodo?: 'percentiles' | 'umbral_provisorio'`
a esa interfaz para que coincida con el contrato real.

## Verificaciones finales (post-integración)

| Verificación | Comando | Resultado |
|---|---|---|
| Tests focalizados | `pnpm exec vitest run --maxWorkers=2 components/mapas/map-infraestructura-page.test.tsx components/mapas/replay-panel.test.tsx lib/infraestructura/riesgo/flags.test.ts` | verde |
| Suite completa | `flock heavy.lock pnpm exec vitest run --maxWorkers=2` | verde — 199 archivos, 1695 tests |
| Lint | `flock heavy.lock pnpm lint` | verde |
| Types | `flock heavy.lock pnpm exec tsc --noEmit` | verde |
| Build | `flock heavy.lock pnpm build` | verde |

## Pendientes explícitos para N1

- Mismatch de nombre de departamento entre el `<select>` de Replay y la
  normalización de `infra_geo_profile` (ver menor no corregido arriba):
  decidir si se corrige acá o en una capa de normalización compartida de
  E7b/M1.
- Decisión de producto (ya señalada por N3, sin resolver: no bloquea el
  merge de esta rama pero sí el diseño futuro): si el buscador/padrón
  completo de M1 debe seguir disponible dentro del modo Replay o si Replay
  reemplaza todo el panel izquierdo (hoy Replay reemplaza el panel, igual
  que antes del merge).
- Revisión y merge del batch integrado a `feat/renovación`.

## Gate (N1)

**Decisión: aceptado tras correcciones (2026-09-27).**

- Verificaciones de N1 sobre la rama integrada: `pnpm exec vitest run --maxWorkers=2` 199 archivos / 1695 tests, `pnpm lint` y `pnpm exec tsc --noEmit` con exit 0.
- Revisión independiente (N2 → N3): dos hallazgos mayores, corregidos. (1) Salir del Replay con el conmutador no detenía la reproducción; ahora se detiene por cualquier vía y nunca arranca sola al volver. (2) Las coordenadas del replay salían del departamento elegido en "Situación actual"; ahora salen del padrón completo de M1.
- Integración con M1 (padrón, buscador, hover) y P1 (nivel provisorio) resuelta en la misma rama.
- Pendiente: walkthrough con operadores.
