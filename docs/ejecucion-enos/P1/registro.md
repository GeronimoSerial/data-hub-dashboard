# P1 — Umbrales provisorios de peligro mientras se calcula la climatología

## 0. Objetivo

El Radar pinta gris ("Sin dato") toda la provincia porque falta la climatología de
precipitación ERA5 (P90/P95/P99 por celda), que tarda ~7 días en calcularse
respetando los límites de Open-Meteo. Puente aprobado por el usuario: umbrales
fijos en mm/24h, rotulados "provisorio", que se reemplazan solos por el método
de percentiles en cuanto exista la climatología de cada celda.

Rama: `feat/enos-p1` (desde `feat/renovación`, commit `5216011`). N2 = sonnet,
delegó toda la implementación a N3 (`opencode-go/deepseek-v4.1-flash`, sin
herramienta Agent).

## 1. Decisiones

### 1.1 Umbrales fijos (N1, versionados, NO oficiales)

Nuevo archivo `lib/infraestructura/riesgo/peligro/umbrales-provisorios.ts`
(`VERSION_UMBRALES_PROVISORIOS = 'umbrales-provisorios-v0.1'`):

| Horizonte | Amarillo (>mm) | Naranja (>mm) | Rojo (>mm) |
|---|---|---|---|
| 24h  | 50  | 80  | 120 |
| 72h  | 80  | 120 | 180 |
| 240h (7-10 días, tendencia) | 120 | 180 | 270 |

240h se deriva de 72h ×1.5 en código (una sola fuente editable, no valores
duplicados). Bordes estrictos: igualar el umbral NO supera (mismo criterio que
`nivelDesdeDeterministico`). Documentado en el archivo como "decisión razonable
de arranque, NO un umbral oficial".

### 1.2 Contrato (`lib/infraestructura/riesgo/peligro/nivel.ts`)

- `NivelPeligroCelda.metodo?: 'percentiles' | 'umbral_provisorio' | 'sin_dato'`
  — campo nuevo, opcional (retrocompatible).
- `VERSION_REGLA_PELIGRO`: `'peligro-v0.1'` → `'peligro-v0.2'`.
- `calcularNivelCeldaSync`:
  - Ensemble (`base: 'ensemble'`) → siempre `metodo: 'percentiles'` (la fila de
    `hazardEnsembleProb` sólo existe si hubo climatología al momento de la
    ingesta — ver §1.3, no se tocó el job).
  - Determinístico con climatología completa → `metodo: 'percentiles'` (sin
    cambios de comportamiento).
  - Determinístico SIN climatología pero CON pronóstico → NUEVO: usa
    `nivelDesdeUmbralProvisorio(precipitacionMm, horizonte)`, `metodo:
    'umbral_provisorio'`, `base` se mantiene `'deterministico'`,
    `percentilReferencia: null` (no hay percentil real).
  - Sin pronóstico → sigue `sin_dato` (nunca inventa un nivel), `metodo:
    'sin_dato'`.
  - Nunca se mezcla dentro de la misma celda+horizonte: si hay climatología,
    JAMÁS se usa el umbral provisorio, sin importar el valor pronosticado.

### 1.3 Ensemble: por qué no se tocó (decisión de alcance, N2)

`sync-ensemble.ts`/`obtenerProbabilidadesEnsemble` ya marca `'sin_climatologia'`
y NO persiste ninguna fila en `hazardEnsembleProb` para una celda sin
climatología. Por lo tanto la rama ensemble de `calcularNivelCeldaSync` nunca
dispara para esas celdas; el candidato provisorio entra únicamente por la rama
determinística. La frase de N1 "si con ensemble hay miembros, se puede usar la
probabilidad de superar el umbral fijo equivalente" queda cubierta como
no-aplicable en este batch: implementarla exigiría cambiar el job de ingesta
para persistir probabilidades contra un umbral fijo (no contra climatología),
sin llamadas nuevas a Open-Meteo pero sí un cambio de esquema/job fuera del
alcance de un puente temporal. Pendiente explícito para N1 (§4).

### 1.4 Motor de riesgo (`lib/infraestructura/riesgo/motor/calculo.ts`)

Cuando `nivelCelda.metodo === 'umbral_provisorio'` y el factor de peligro-celda
se agrega (PASO 2a), se suma 1 a `cantidadFaltantes` (mismo contador que ya usan
las ausencias reales en PASO 5 para bajar confianza), aunque el factor de
amenaza se agrega igual al score — no se descarta evidencia, sólo se trata como
menos confiable que un percentil de climatología real. Test `T-UP1` confirma
que el mismo escenario baja de `alta` a `media` sólo por el método.

### 1.5 Replay (`lib/infraestructura/replay/consulta.ts`)

Antes: si faltaba cualquier percentil de climatología, la celda se omitía del
arreglo (`continue`) aunque hubiera pronóstico. Ahora: en ese caso se resuelve
con el mismo umbral provisorio que producción (`metodo: 'umbral_provisorio'`),
usando `HORIZONTE_PELIGRO_REPLAY_HORAS`. Sin pronóstico sigue omitiendo la
celda (comportamiento sin cambios, documentado en el archivo). `metodo?`
opcional agregado a `NivelPeligroReplay` (`lib/infraestructura/replay/tipos.ts`,
zod schema).

### 1.6 API

- `app/api/infraestructura/peligro/route.ts`: sin cambios — ya serializa
  `NivelPeligroCelda[]` completo, así que `metodo` viaja solo.
- `app/api/infraestructura/radar/route.ts`: nuevo campo top-level
  `hayNivelProvisorio: boolean` (= alguna celda del corte con `metodo ===
  'umbral_provisorio'`), aditivo. `respuestaVacia` también lo trae en `false`
  para que el shape sea consistente en todos los caminos de respuesta.

### 1.7 UI

Rótulo exacto (N1): *"Nivel provisorio (umbrales fijos de lluvia) mientras se
calcula la climatología de la zona."* — nunca "alerta" ni "SMN"; marca visual
además del color (ícono `TriangleAlert`, nunca sólo color).

- `components/mapas/peligro-legend.tsx`: prop `hayNivelProvisorio?: boolean`
  (default `false`); cuando es `true` agrega un párrafo con ícono + rótulo.
  Estilo nuevo `.peligro-legend__provisorio` en `app/globals.css`.
- `components/mapas/legend-panel.tsx` (`InfraLegendPanel`): nueva prop
  `hayNivelProvisorio?: boolean`, pasante a `<PeligroLegend>`.
- `components/mapas/map-infraestructura-page.tsx`: cablea
  `hayNivelProvisorio={radarData?.hayNivelProvisorio ?? false}` desde la
  respuesta de `/api/infraestructura/radar` (tipo `RespuestaRadar` en
  `lib/infraestructura/use-radar.ts` recibió el campo aditivo).
- `components/mapas/risk-explanation-panel.tsx`: `NivelHorizontePanel.metodo?`
  (mirror retrocompatible del contrato); cuando `fila.metodo ===
  'umbral_provisorio'` se muestra el rótulo completo en un `span` nuevo
  (`risk-explanation-panel__provisorio`).

## 2. Verificación

Ejecutado por N2 (no por N3, que no corre suites completas — regla de
convivencia entre N2 concurrentes para evitar picos de memoria y contención de
`opencode.db` compartido):

- `flock ~/.cache/enos-n3/heavy.lock pnpm exec vitest run --maxWorkers=2` →
  **191 archivos, 1616 tests, todos en verde.**
- `flock ~/.cache/enos-n3/heavy.lock pnpm lint` → **sin hallazgos.**
- `flock ~/.cache/enos-n3/heavy.lock pnpm exec tsc --noEmit` → **sin errores.**
- `flock ~/.cache/enos-n3/heavy.lock pnpm build` → **build de producción
  exitoso** (Next.js 16.2.9, Turbopack, todas las rutas generadas).

Tests nuevos/actualizados cubren: cada borde de umbral provisorio por horizonte
(24h: 50/80/120; 72h: 80/120/180; 240h: 120/180/270, con un mm de margen a cada
lado), celda con climatología ignora el umbral provisorio aunque el valor lo
cruzaría, celda sin pronóstico → `sin_dato`, confianza del motor un escalón más
baja con `metodo: umbral_provisorio` (`T-UP1`), `hayNivelProvisorio` en la API
del radar (true/false), rótulo visible en leyenda y panel (presente/ausente),
replay usa el umbral provisorio en vez de omitir la celda.

Revisión breve por un N3 distinto de los implementadores (sólo lectura, sin
ejecutar comandos): confirmó los 8 puntos de control de las decisiones de N1
(umbrales exactos, no-mezcla de método, `sin_dato` sin pronóstico, contrato
retrocompatible, confianza degradada, copy sin "alerta"/"SMN" con marca visual
además del color, `hayNivelProvisorio` en el shape correcto de la API,
ningún archivo fuera de alcance tocado). Encontró un gap real (ver §4).

## 3. Decisiones de N2 dentro del alcance de N1

- Ensemble sin climatología: no se modificó el job de ingesta (§1.3);
  documentado como pendiente, no como bug.
- El rótulo en el panel de explicación (`risk-explanation-panel.tsx`) quedó con
  el mismo gap ya documentado que el campo `base` en la vista por departamento
  del Radar: `nivelesDepartamentoRadar` (en `map-infraestructura-page.tsx`) NO
  tiene el detalle por celda (la API `/api/infraestructura/radar` sólo agrega
  el peor nivel por departamento+horizonte, no expone `metodo` por fila), así
  que en ese wiring puntual el campo queda sin pasar. La señal real y cableada
  de punta a punta para el usuario es la LEYENDA (`hayNivelProvisorio`), que sí
  refleja el corte vigente completo. No se expandió ese gap para no inflar el
  alcance del puente.

## 4. Pendientes explícitos para N1

1. **Ensemble contra umbral fijo equivalente** (§1.3): hoy el ensemble no
   participa en absoluto cuando falta climatología (se resuelve por la rama
   determinística). Si N1 quiere que el ensemble aporte probabilidad de
   superar el umbral fijo cuando hay miembros, hace falta un cambio en el job
   de ingesta (`sync-ensemble.ts`) para persistir esa probabilidad contra un
   umbral fijo en vez de contra climatología — no entra en el alcance de este
   puente de umbrales de nivel.
2. **Detalle de `metodo` por celda en la vista de departamento del Radar**
   (§3): el badge del panel de explicación existe y está testeado, pero hoy es
   inalcanzable desde la navegación real por departamento (mismo gap ya
   documentado para `base`). Si se quiere mostrar el aviso también ahí (no
   sólo en la leyenda), hace falta que `/api/infraestructura/radar` exponga el
   `metodo` real por (departamento, horizonte) o una fuente de celda a celda.
3. El rótulo renderizado en la leyenda y el panel cierra con un punto final
   ("... de la zona."); la redacción de N1 no incluía el punto. Cambio
   cosmético, no semántico — señalado por el N3 revisor, sin corregir a la
   espera de confirmación de N1.

## Gate

_(Sección reservada para N1.)_

## Gate (N1)

**Decisión: aceptado con follow-ups (2026-09-27).**

- Verificaciones del N2: `pnpm exec vitest run --maxWorkers=2` 1616/1616, `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0. N1 verifica de nuevo el árbol mergeado.
- Revisión independiente hecha por un N3 distinto del implementador, de sólo lectura: los 8 puntos de control de N1 se cumplen, sin bloqueantes.
- Decisión del usuario: estos umbrales fijos son un puente mientras se calcula la climatología completa de ERA5; cada celda pasa sola al método por percentiles cuando tiene climatología.
- Follow-ups: el ensemble no participa cuando falta la climatología (requiere tocar la ingesta, a evaluar en ABS1); el rótulo provisorio todavía no llega al panel de departamento agregado (la leyenda sí está cableada).
