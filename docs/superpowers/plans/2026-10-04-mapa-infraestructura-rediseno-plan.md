# Rediseño del mapa de infraestructura — Implementation Plan (por batches)

> **For agentic workers:** implementar tarea por tarea, en orden dentro de cada batch. Cada paso usa checkbox (`- [ ]`). Test primero, después el código, después el commit.

**Goal:** Reordenar `/mapas/infraestructura` en una sola fila de pestañas (Situación actual · Radar · Planificación · Estadísticas), con filtros compartidos en chips, el reporte de escuela como alerta principal, cero texto técnico y una ruta de acceso por la mejor vía hacia la localidad urbana más cercana.

**Architecture:**
- **Datos:** el endpoint del padrón (`/api/mapas/infraestructura/escuelas`) pasa a devolver cada escuela enriquecida: niveles, estado de clases, apoyo pedagógico, sin actualizar, alumnos. El filtrado y las agregaciones se resuelven **en el cliente**, con funciones puras en `lib/infraestructura/mapa/`, sobre ese único payload. Así el mapa, los paneles y Estadísticas comparten exactamente el mismo recorte y los mismos números. Las series de evolución siguen en el servidor y reciben los filtros por querystring.
- **UI:**
  - `map-client.tsx` es dueño de la pestaña activa y de los filtros.
  - `map-infraestructura-page.tsx` pierde el conmutador `ModoMapa` y su estado de filtros. Recibe `pestana` y `filtros` por props.
  - Un componente `PanelLateral` elige el panel según la pestaña, lo que elimina el sidebar en blanco del Radar.
- **geo-static:** el costo de la ruta pasa a ponderarse por tipo de vía, el destino pasa a ser la localidad urbana más cercana (Dijkstra multi-origen) y el registro de geometría suma la vía principal, el destino y la distancia.

**Tech Stack:** Next.js App Router, TypeScript, MapLibre (`react-map-gl`), `@base-ui/react`, lucide-react, vitest + @testing-library/react + jsdom, pnpm. geo-static: Python, osmnx/networkx, pytest vía `uv`.

**Spec:** `docs/superpowers/specs/2026-10-04-mapa-infraestructura-rediseno-design.md`
**Prototipo (fuente de verdad visual):** `docs/superpowers/specs/2026-10-04-mapa-infraestructura-prototipo.html`

## Batches

| Batch | Fase del spec | Tasks | Depende de | Entrega verificable |
|---|---|---|---|---|
| 1 | Pestañas y panel por pestaña | 1–4 | — | Una fila de 4 pestañas; Radar nunca deja el panel en blanco |
| 2 | Datos enriquecidos y filtros compartidos | 5–9 | 1 | Chips con casillas; el recorte vale en todas las pestañas |
| 3 | Situación actual | 10–15 | 2 | Punto por gravedad e ícono, "Sin actualizar", panel, ficha, acceso |
| 4 | Radar y Planificación limpios | 16–19 | 1 | Sin textos técnicos; paneles propios; leyendas de dos líneas |
| 5 | Estadísticas | 20–22 | 2 | Números + "Agrupar por" + evolución filtrada |
| 6 | Ruta de acceso | 23–27 | Task 23 (datos) | Ruta por la mejor vía hacia la localidad urbana más cercana |

- Los batches 4 y 6 no comparten archivos con 2, 3 y 5. Pueden correr en paralelo una vez cerrado el batch 1 (el 6 no depende de nada del front).
- Cada batch cierra con `pnpm test && pnpm lint && pnpm build` en verde. El batch 6 cierra además con `uv run pytest` en `services/geo-static`.

## Global Constraints

- Comandos: `pnpm test`, `pnpm exec vitest run <archivo>`, `pnpm lint`, `pnpm build`. geo-static: `cd services/geo-static && uv run pytest <archivo>`.
- **No se toca el flujo del parte** (`components/infraestructura/reporte-inicial-*`, `actualizacion-*`, `app/problematicas/parte/**`, `POST /api/problematicas/parte`). Sólo se leen sus datos.
- **Regla F5.1:** el mapa nunca se desmonta al cambiar de pestaña. Se oculta con `hidden`.
- **Padrón completo siempre:** el mapa dibuja todas las escuelas del padrón, con totales por departamento y búsqueda.
- **Íconos:** lucide, sin anillos concéntricos ni círculos grises decorativos.
- **Cero texto técnico en UI:** nada de fuentes, ODbL, extracto, corrida, job, arcsec, período de retorno ni "no es un pronóstico". La atribución obligatoria del mapa base va sólo en el `AttributionControl` compacto de MapLibre (`compact: true`).
- **Copy:** español neutro con "usted", igual que el parte. Comentarios de código en el idioma del archivo (español).
- **Desktop-only:** no hay objetivos de rendimiento móvil. El layout apila el panel debajo del mapa en pantallas angostas y no hace scroll horizontal.
- **Eliminaciones:** antes de borrar un componente o export, `rg` sobre `app components lib` para confirmar que no tiene otros usos. Si los tiene, se reporta y no se borra.
- **Límites de Open-Meteo:** ninguna tarea dispara sincronizaciones del radar. Los tests usan fixtures.
- Commits: Conventional Commits, sin atribución de IA. Un commit por tarea como mínimo.
- Patrón contenedor/presentacional: la lógica de decisión vive en funciones puras de `lib/infraestructura/mapa/`, cada una con su test.

### Definiciones compartidas (las usan varias tasks)

```ts
// lib/infraestructura/mapa/tipos.ts
export type PestanaMapa = 'actual' | 'radar' | 'planificacion' | 'estadisticas'
export type EstadoClases = 'normal' | 'parcial' | 'sin' | 'evacuado' | 'centro'
export type ApoyoPedagogico = 'virtual' | 'cuadernillo' | 'ambos' | 'no' | null // null = no corresponde
export type GravedadMapa = 0 | 1 | 2 | 3 | 4 // 0 sin reporte, 1 Baja … 4 Crítica

export interface EscuelaMapaEnriquecida {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  niveles: string[]          // niveles de las secciones del corte vigente
  alumnos: number            // matrícula del corte vigente
  gravedad: GravedadMapa     // de la situación abierta más relevante
  categoriaPrincipal: string | null
  clases: EstadoClases
  apoyo: ApoyoPedagogico
  sinActualizar: boolean
  ultimaNovedad: string | null // ISO
  alumnosSinClases: number
  parte?: ParteMapa          // se mantiene para la ficha y el historial
}

export interface FiltrosMapa {
  q: string
  departamentos: string[]
  niveles: string[]
  gravedades: GravedadMapa[]
  clases: EstadoClases[]
  apoyo: Array<'brinda' | 'no' | 'virtual' | 'cuadernillo'>
  sinActualizar: boolean
}
export const FILTROS_MAPA_VACIOS: FiltrosMapa = {
  q: '', departamentos: [], niveles: [], gravedades: [], clases: [], apoyo: [], sinActualizar: false,
}
```

**Estado de clases.** Se deriva de `estadoEstablecimiento` y `servicio`, en este orden: `evacuado` → `'evacuado'`; `centro_evacuados` → `'centro'`; servicio `suspendido` → `'sin'`; servicio `parcial` → `'parcial'`; si no, `'normal'`.
- **Decisión de este plan (falta en el spec):** "Clases parciales" se agrega como quinta opción del chip Clases. Cuenta como "sin clases normales" para el apoyo pedagógico y para "Sin clases" en los números de arriba, pero se muestra con su propia etiqueta. Si el dueño de producto prefiere fusionarla con "Sin clases", sólo cambia `ETIQUETA_CLASES`.

**Cruces de agua.** En el bloque de acceso, "cruces de agua" cuenta los cruces clasificados `vado` y `sin_evidencia`. Los puentes no cuentan, porque no son un punto débil.

## Review Focus

1. **Cambiar de pestaña con una ficha abierta**, sobre todo hacia Radar: el panel nunca queda vacío y el mapa no se remonta (el encuadre se conserva). Tests en Tasks 3 y 4.
2. **Hashes y querystring viejos** (`#operativa`, `#evolucion`, `?modo=radar`, hash basura): siempre queda una pestaña válida activa. Test en Task 2.
3. **"Sin actualizar"**: una situación solucionada nunca cuenta, y una escuela que nunca reportó tampoco. Test en Task 5.
4. **Números que no coinciden** entre el panel de Situación actual y Estadísticas con los mismos filtros. Test en Task 20.
5. **Escuela con varios niveles** (Primario + Inicial): aparece con cualquiera de los dos filtros y se cuenta una sola vez. Test en Task 7.
6. **Ruta**: una huella más corta no gana a una ruta pavimentada razonable, y una escuela sin localidad urbana alcanzable queda "Sin acceso calculado", sin crash. Tests en Tasks 24 y 25.

---

## File Structure

| Archivo | Responsabilidad | Tasks |
|---|---|---|
| `lib/infraestructura/mapa/tipos.ts` | Tipos compartidos del mapa | 1, 5 |
| `lib/infraestructura/mapa/pestanas.ts` | Pestañas válidas y mapeo de hash/querystring viejos | 2 |
| `app/(hub)/mapas/infraestructura/map-client.tsx` | Fila única de pestañas, dueño de pestaña y filtros | 1, 2, 8 |
| `components/mapas/map-infraestructura-page.tsx` | Mapa: pierde `ModoMapa` y `FiltrosForm`, recibe props | 3, 8, 10 |
| `components/mapas/panel-lateral.tsx` | Elige el panel según la pestaña | 3 |
| `lib/infraestructura/mapa/enriquecer.ts` | `EscuelaMapa` + datos del corte → `EscuelaMapaEnriquecida` | 5 |
| `lib/infraestructura/parte-mapa.ts`, `app/api/mapas/infraestructura/escuelas/route.ts` | Payload enriquecido | 6 |
| `lib/infraestructura/mapa/filtrar.ts` | Filtrado compartido y conteos por opción | 7 |
| `components/mapas/filtros-chips.tsx` | Barra de chips, popover con casillas, búsqueda | 8, 9 |
| `lib/infraestructura/mapa/punto.ts` | Color e ícono del punto | 10 |
| `lib/infraestructura/mapa/agregar.ts` | Números de arriba y agrupaciones | 11, 20 |
| `components/mapas/panel-situacion-actual.tsx` | Panel de Situación actual | 12 |
| `components/mapas/ficha-escuela-panel.tsx` | Ficha en el panel lateral | 13 |
| `lib/infraestructura/mapa/acceso.ts`, `components/mapas/bloque-acceso.tsx` | Bloque de acceso de 3 líneas | 14 |
| `components/mapas/leyenda-mapa.tsx` | Leyenda de dos líneas por pestaña | 15, 18 |
| `components/mapas/panel-radar.tsx` | Panel de Radar | 16 |
| `components/mapas/panel-planificacion.tsx` | Panel de Planificación | 17 |
| `components/mapas/panel-estadisticas.tsx` | Pestaña Estadísticas (reemplaza el uso de `EvolucionPanel` como pestaña) | 21, 22 |
| `app/api/mapas/infraestructura/evolucion/route.ts` | Series filtradas | 22 |
| `services/geo-static/data/localidades_urbanas.json` | Localidades urbanas con población | 23 |
| `services/geo-static/src/geo_static/osm_aislamiento.py` | Costo por tipo de vía, multi-origen | 24, 25 |
| `services/geo-static/src/geo_static/jobs/calcular_aislamiento.py` | Destino, registro de geometría ampliado | 25, 26 |
| `lib/infraestructura/territorio-mapa.ts`, `lib/db/schema.ts`, `drizzle/0009_*` | Importar vía principal, destino y distancia | 27 |

---

## Batch 1 — Pestañas y panel por pestaña

### Task 1: Fila única de cuatro pestañas

**Files:**
- Create: `lib/infraestructura/mapa/tipos.ts` (sólo `PestanaMapa` por ahora)
- Modify: `app/(hub)/mapas/infraestructura/map-client.tsx`
- Test: `app/(hub)/mapas/infraestructura/map-client.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('muestra una sola fila con Situación actual, Radar, Planificación y Estadísticas', () => {
  render(<MapClient riskRadarEnabled />)
  const tabs = screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, '').trim())
  expect(tabs).toEqual(['Situación actual', 'Radar', 'Planificación', 'Estadísticas'])
})

it('sin el flag del radar no muestra la pestaña Radar', () => {
  render(<MapClient riskRadarEnabled={false} />)
  expect(screen.queryByRole('tab', { name: /Radar/ })).toBeNull()
})

it('Estadísticas oculta el mapa sin desmontarlo', async () => {
  render(<MapClient riskRadarEnabled />)
  await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))
  expect(screen.getByTestId('pestana-mapa')).toHaveAttribute('hidden')
  expect(screen.getByTestId('pestana-estadisticas')).toBeVisible()
})
```

Reusar los mocks que ya tiene el archivo para `MapInfraestructuraPage` y `EvolucionPanel`.

- [ ] **Step 2: Run to verify it fails**: `pnpm exec vitest run "app/(hub)/mapas/infraestructura/map-client.test.tsx"`. Expected: FAIL (hoy hay dos pestañas).
- [ ] **Step 3: Implement**
  - Reemplazar `operativa | evolucion` por `PestanaMapa`.
  - Las pestañas `actual`, `radar` y `planificacion` muestran el mismo panel de mapa (`data-testid="pestana-mapa"`, siempre montado, `hidden` sólo en `estadisticas`) y le pasan `pestana` por prop a `MapInfraestructuraPage`.
  - `estadisticas` monta `EvolucionPanel` con `data-testid="pestana-estadisticas"`. El batch 5 lo reemplaza por `PanelEstadisticas`.
  - `Radar` se renderiza sólo con `riskRadarEnabled`.
  - Actualizar los tests existentes que buscaban "Operativa" / "Evolución".
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**: `feat(mapa): una sola fila de pestañas para el mapa de infraestructura`

### Task 2: Hash linkeable y mapeo de enlaces viejos

**Files:**
- Create: `lib/infraestructura/mapa/pestanas.ts`, `lib/infraestructura/mapa/pestanas.test.ts`
- Modify: `app/(hub)/mapas/infraestructura/map-client.tsx` (`esPestana`, `onTab`, `syncHash`)
- Modify: `components/infraestructura/situacion-client.tsx:162` (`ENLACE_RADAR` → `'/mapas/infraestructura#radar'`)

- [ ] **Step 1: Write the failing test**

```ts
import { resolverPestana } from './pestanas'

describe('resolverPestana', () => {
  it.each([
    ['#actual', '', 'actual'],
    ['#radar', '', 'radar'],
    ['#planificacion', '', 'planificacion'],
    ['#estadisticas', '', 'estadisticas'],
    ['#operativa', '', 'actual'],
    ['#evolucion', '', 'estadisticas'],
    ['', '?modo=radar', 'radar'],
    ['#basura', '', 'actual'],
    ['', '', 'actual'],
  ])('hash %s + query %s → %s', (hash, query, esperado) => {
    expect(resolverPestana(hash, query, { radarHabilitado: true })).toBe(esperado)
  })

  it('con el radar apagado, #radar cae en Situación actual', () => {
    expect(resolverPestana('#radar', '', { radarHabilitado: false })).toBe('actual')
  })
})
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement**

```ts
import type { PestanaMapa } from './tipos'

const VALIDAS: readonly PestanaMapa[] = ['actual', 'radar', 'planificacion', 'estadisticas']
const ALIAS: Record<string, PestanaMapa> = { operativa: 'actual', evolucion: 'estadisticas' }

export function resolverPestana(
  hash: string,
  query: string,
  opciones: { radarHabilitado: boolean },
): PestanaMapa {
  const crudo = hash.replace(/^#/, '')
  let pestana: PestanaMapa =
    (VALIDAS as readonly string[]).includes(crudo) ? (crudo as PestanaMapa) : ALIAS[crudo] ?? 'actual'
  if (!crudo && new URLSearchParams(query).get('modo') === 'radar') pestana = 'radar'
  if (pestana === 'radar' && !opciones.radarHabilitado) return 'actual'
  return pestana
}
```

  Cablearlo en `map-client.tsx`: estado inicial y `hashchange` usan `resolverPestana`, y `onTab` escribe `#<pestana>`.
- [ ] **Step 4: Run to verify it passes** (incluye `map-client.test.tsx`).
- [ ] **Step 5: Commit**: `feat(mapa): pestañas linkeables con compatibilidad de enlaces viejos`

### Task 3: El mapa recibe la pestaña y pierde el conmutador flotante

**Files:**
- Modify: `components/mapas/map-infraestructura-page.tsx` (`ModoMapa` :250, estado `modo` :831, `modoRadar`, `.map-modo-conmutador` y el efecto de `--infra-modo-panel-bottom` :857–870)
- Modify: `app/globals.css` (reglas de `.map-modo-conmutador`)
- Create: `components/mapas/panel-lateral.tsx`
- Test: `components/mapas/map-infraestructura-page.test.tsx`

**Interfaces:**
- `MapInfraestructuraPage` props: `pestana: 'actual' | 'radar' | 'planificacion'` (nueva; reemplaza el estado interno `modo`).
- `PanelLateral` props: `{ pestana; seleccion: string | null; onCerrarFicha(): void; children por pestaña }`. Renderiza `ficha` si hay selección válida para la pestaña; si no, el panel de la pestaña. Nunca devuelve `null`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('no renderiza el conmutador Situación actual / Radar', () => {
  renderMapa({ pestana: 'actual' })
  expect(document.querySelector('.map-modo-conmutador')).toBeNull()
})

it('con pestana="radar" activa el modo radar sin conmutador', () => {
  renderMapa({ pestana: 'radar', riskRadarEnabled: true })
  expect(screen.getByTestId('panel-radar')).toBeInTheDocument()
})
```

Usar el helper de render que ya tiene el archivo (agregar `pestana` a sus props por defecto: `'actual'`).

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement**
  - `modoRadar` pasa a ser `props.pestana === 'radar'`. Se borran el estado `modo`, `setModo`, el JSX del conmutador, el efecto de `--infra-modo-panel-bottom` y su CSS.
  - Los paneles laterales actuales de cada modo se envuelven en `PanelLateral`, sin cambiar su contenido todavía. Hasta las Tasks 16 y 17, `panel-radar` puede ser el `RadarMeteo` actual envuelto en un `div data-testid="panel-radar"`, y `planificacion` reutiliza el panel de Situación actual.
  - Corregir los tests existentes que hacían click en el conmutador para que pasen `pestana`.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**: `refactor(mapa): la pestaña activa reemplaza al conmutador de modo flotante`

### Task 4: Regresión — el panel nunca queda en blanco al pasar a Radar

**Files:**
- Test: `components/mapas/map-infraestructura-page.test.tsx`
- Modify (si el test falla): `components/mapas/panel-lateral.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('con una ficha abierta, pasar a Radar muestra el panel del Radar y no un panel vacío', async () => {
  const { rerender } = renderMapa({ pestana: 'actual' })
  await abrirFichaDe('1800087-00') // helper: click en el renglón o dispatch de selección existente
  rerender(mapaConProps({ pestana: 'radar', riskRadarEnabled: true }))
  const panel = screen.getByTestId('panel-lateral')
  expect(panel).not.toBeEmptyDOMElement()
  expect(within(panel).getByTestId('panel-radar')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify** (si ya pasa por la Task 3, dejar el test como guardia).
- [ ] **Step 3: Implement**: al cambiar `pestana`, `PanelLateral` descarta la selección que no aplica a la nueva pestaña (la ficha del Radar usa `cueRadarSeleccionado`; la de Situación actual, `seleccionCue`).
- [ ] **Step 4: Run** `pnpm test && pnpm lint && pnpm build`.
- [ ] **Step 5: Commit**: `fix(mapa): el panel lateral no queda en blanco al pasar al radar`

---

## Batch 2 — Datos enriquecidos y filtros compartidos

### Task 5: Enriquecer cada escuela (clases, apoyo, sin actualizar)

**Files:**
- Modify: `lib/infraestructura/mapa/tipos.ts` (definiciones compartidas de arriba)
- Create: `lib/infraestructura/mapa/enriquecer.ts`, `lib/infraestructura/mapa/enriquecer.test.ts`
- Modify: `lib/infraestructura/umbrales.ts` (`UMBRAL_SIN_REPORTAR_HORAS` → `UMBRAL_SIN_ACTUALIZAR_HORAS`; actualizar sus imports)

**Interfaces:**
- `derivarClases(estado: EstadoEstablecimiento, servicio: EstadoServicioGeneral): EstadoClases`
- `derivarApoyo(clases: EstadoClases, asistencia: AsistenciaPedagogica | null): ApoyoPedagogico`
- `esSinActualizar(parte: ParteMapa | undefined, ahoraMs: number): boolean`
- `gravedadDe(parte: ParteMapa | undefined): GravedadMapa`: usa `situacionPrincipal` de `lib/infraestructura/relevancia.ts` (criterio único del batch 2 del parte; no reimplementarlo).
- `enriquecerEscuela(e: EscuelaMapa, extra: { niveles: string[]; alumnos: number; asistencia: AsistenciaPedagogica | null }, ahoraMs: number): EscuelaMapaEnriquecida`

- [ ] **Step 1: Write the failing test**

```ts
const H = 60 * 60 * 1000
const ahora = Date.parse('2026-10-04T12:00:00Z')

describe('esSinActualizar', () => {
  it('situación abierta sin novedades hace más de 72 h → true', () => {
    expect(esSinActualizar(parte({ actualizadaEn: iso(ahora - 73 * H), abiertas: 1 }), ahora)).toBe(true)
  })
  it('situación abierta actualizada hace 10 h → false', () => {
    expect(esSinActualizar(parte({ actualizadaEn: iso(ahora - 10 * H), abiertas: 1 }), ahora)).toBe(false)
  })
  it('todas las situaciones solucionadas → false aunque sea vieja', () => {
    expect(esSinActualizar(parte({ actualizadaEn: iso(ahora - 200 * H), abiertas: 0 }), ahora)).toBe(false)
  })
  it('escuela sin parte → false', () => {
    expect(esSinActualizar(undefined, ahora)).toBe(false)
  })
})

describe('derivarClases', () => {
  it.each([
    ['evacuado', 'suspendido', 'evacuado'],
    ['centro_evacuados', 'normal', 'centro'],
    ['habitual', 'suspendido', 'sin'],
    ['parcial', 'parcial', 'parcial'],
    ['habitual', 'normal', 'normal'],
  ] as const)('%s + %s → %s', (estado, servicio, esperado) => {
    expect(derivarClases(estado, servicio)).toBe(esperado)
  })
})

describe('derivarApoyo', () => {
  it('con clases normales no corresponde', () => {
    expect(derivarApoyo('normal', { brinda: true, modalidades: ['Cuadernillo'] })).toBeNull()
  })
  it('sin clases y sin dato → no', () => expect(derivarApoyo('sin', null)).toBe('no'))
  it('ambas modalidades → ambos', () => {
    expect(derivarApoyo('sin', { brinda: true, modalidades: ['Clase virtual', 'Cuadernillo'] })).toBe('ambos')
  })
})
```

  `parte()` e `iso()` son helpers locales del test. "Abiertas" son las afectaciones de `parte.afectaciones` sin `cierre` y sin `retiradaEn`; verificar los nombres reales de esos campos en `AfectacionMapa` antes de escribir el helper.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** las funciones puras.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**: `feat(mapa): estado de clases, apoyo pedagógico y sin actualizar por escuela`

### Task 6: El endpoint del padrón devuelve escuelas enriquecidas

**Files:**
- Modify: `lib/infraestructura/parte-mapa.ts` (`cargarEscuelasMapa` ~546–658; `IndicadoresMapa.sinReportar` → `sinActualizar`; línea :500)
- Modify: `lib/infraestructura/filtrar-departamento-mapa.ts:15`
- Modify: `app/api/mapas/infraestructura/escuelas/route.ts`, `lib/infraestructura/use-escuelas-mapa.ts` (o el hook equivalente)
- Test: el test existente de `parte-mapa` / `escuelas/route.test.ts`

- [ ] **Step 1: Write the failing test** (sobre la base temporal que ya usan los tests del archivo):
  - Una escuela con secciones de Primario e Inicial devuelve `niveles: ['Inicial', 'Primario']` y `alumnos` igual a la suma de la matrícula del corte vigente.
  - Una escuela con parte evacuado y `asistenciaPedagogica = {brinda:true, modalidades:['Cuadernillo']}` devuelve `clases: 'evacuado'` y `apoyo: 'cuadernillo'`.
  - El indicador `sinActualizar` no cuenta partes cuyas afectaciones están todas solucionadas.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement**
  - Una consulta agregada trae los niveles y la matrícula por `cue_anexo` del corte vigente (`ge_seccion`), sin N+1.
  - `asistencia_pedagogica` sale de `infra_parte` (JSON).
  - `enriquecerEscuela` arma cada fila.
  - Se quitan del endpoint los parámetros de filtro de texto libre: el filtrado pasa al cliente. `useAlertas` y `useTotalesMapa` dejan de recibir `filtros`; si quedan sin uso, se eliminan siguiendo la regla de eliminaciones.
  - Renombrar `sinReportar` → `sinActualizar` en tipos, API y consumidores (`rg sinReportar`).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**: `feat(mapa): el padrón del mapa trae niveles, matrícula, clases y apoyo`

### Task 7: Filtrado compartido y conteos por opción

**Files:**
- Create: `lib/infraestructura/mapa/filtrar.ts`, `lib/infraestructura/mapa/filtrar.test.ts`

**Interfaces:**
- `filtrarEscuelas(escuelas: EscuelaMapaEnriquecida[], f: FiltrosMapa): EscuelaMapaEnriquecida[]`
- `contarOpciones(escuelas, clave: keyof Omit<FiltrosMapa,'q'|'sinActualizar'>): Map<string, number>`: cuenta sobre el padrón completo, igual que el prototipo.
- `opcionesDisponibles(escuelas)`: departamentos y niveles reales del padrón, ordenados.

- [ ] **Step 1: Write the failing test**

```ts
it('una escuela con Inicial y Primario aparece filtrando por cualquiera y una sola vez', () => {
  const r = filtrarEscuelas([esc({ niveles: ['Inicial', 'Primario'] })], { ...FILTROS_MAPA_VACIOS, niveles: ['Inicial', 'Primario'] })
  expect(r).toHaveLength(1)
})
it('las opciones de un mismo chip se combinan con O y los chips entre sí con Y', () => {
  const lista = [esc({ departamento: 'Goya', gravedad: 3 }), esc({ departamento: 'Esquina', gravedad: 1 }), esc({ departamento: 'Goya', gravedad: 1 })]
  const r = filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, departamentos: ['Goya', 'Esquina'], gravedades: [1] })
  expect(r.map((e) => e.departamento)).toEqual(['Esquina', 'Goya'])
})
it('apoyo "virtual" incluye "ambos"; "brinda" excluye "no" y null', () => { /* … */ })
it('la búsqueda matchea nombre sin tildes ni mayúsculas, y CUE parcial', () => {
  const r = filtrarEscuelas([esc({ nombre: 'Escuela N° 87 Colonia Tatacuá', cueAnexo: '1800087-00' })], { ...FILTROS_MAPA_VACIOS, q: 'tatacua' })
  expect(r).toHaveLength(1)
  expect(filtrarEscuelas([esc({ cueAnexo: '1800087-00' })], { ...FILTROS_MAPA_VACIOS, q: '180008' })).toHaveLength(1)
})
it('sinActualizar=true deja sólo las sin actualizar', () => { /* … */ })
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** (normalizar con `normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()`).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**: `feat(mapa): filtrado compartido de escuelas del mapa`

### Task 8: Barra de chips con casillas

**Files:**
- Create: `components/mapas/filtros-chips.tsx`, `components/mapas/filtros-chips.test.tsx`
- Modify: `app/(hub)/mapas/infraestructura/map-client.tsx` (dueño de `FiltrosMapa`; la barra va debajo de las pestañas, en todas)
- Modify: `components/mapas/map-infraestructura-page.tsx` (borrar `FiltrosForm`, `FILTROS_VACIOS`, `filtrosAvanzadosAbiertos` y el formulario; recibir `escuelasFiltradas` por props o vía contexto)
- Modify: `app/globals.css`

**Comportamiento (ver prototipo):**
- Búsqueda "Buscar escuela o CUE".
- Chips Departamento, Nivel, Gravedad, Clases y Apoyo pedagógico: popover con casillas y conteo por opción. Cierra con click afuera o Esc.
- Chip "Sin actualizar" como interruptor, con ícono de reloj.
- Un chip activo se ve relleno, con el valor (o "N elegidos") y una "×" que lo limpia.
- "Limpiar filtros" visible sólo si hay algo activo.
- Usar el `Popover` de `@base-ui/react` si ya está en el repo; si no, un popover propio accesible (`aria-expanded`, foco en la primera casilla, Esc devuelve el foco al chip).

- [ ] **Step 1: Write the failing test**

```tsx
it('elegir Primario en Nivel filtra y muestra el chip activo con su ×', async () => {
  const onChange = vi.fn()
  render(<FiltrosChips escuelas={padronEjemplo} filtros={FILTROS_MAPA_VACIOS} onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: /Nivel/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: /Primario/ }))
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ niveles: ['Primario'] }))
})
it('la × de un chip activo limpia sólo ese filtro', async () => { /* … */ })
it('Limpiar filtros aparece sólo con algún filtro activo', () => { /* … */ })
it('cada opción muestra cuántas escuelas tiene', async () => { /* … */ })
it('Esc cierra el popover y devuelve el foco al chip', async () => { /* … */ })
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement**: `map-client.tsx` guarda `FiltrosMapa`, trae el padrón enriquecido una sola vez y calcula `escuelasFiltradas = useMemo(filtrarEscuelas…)`, que pasa al mapa y a los paneles.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**: `feat(mapa): filtros compartidos en chips para todas las pestañas`

### Task 9: Búsqueda que encuentra y centra

**Files:**
- Modify: `components/mapas/filtros-chips.tsx`, `components/mapas/map-infraestructura-page.tsx` (reutilizar el encuadre de `EscuelaSearchBox`, línea ~2423)
- Delete (si no tiene otros usos): `components/mapas/escuela-search-box.tsx` y su test, `components/mapas/search-box.tsx`
- Test: `components/mapas/filtros-chips.test.tsx`

- [ ] **Step 1: Write the failing test**: escribir "tatacua" muestra una lista de sugerencias con la escuela; Enter o click la selecciona (`onSeleccionar('1800087-00')`), lo que abre su ficha y centra el mapa. Una búsqueda sin resultados dice "Ninguna escuela coincide".
- [ ] **Step 2–4**: implementar, borrar los buscadores viejos según la regla de eliminaciones y correr `pnpm test && pnpm lint && pnpm build`.
- [ ] **Step 5: Commit**: `feat(mapa): búsqueda de escuela por nombre o CUE dentro de la barra de filtros`

---

## Batch 3 — Situación actual

### Task 10: Punto por gravedad con ícono de estado

**Files:**
- Create: `lib/infraestructura/mapa/punto.ts`, `lib/infraestructura/mapa/punto.test.ts`
- Modify: `lib/mapas/construir-escuelas-mapa-feature-collection.ts` (propiedades `gravedad`, `icono`)
- Modify: `components/mapas/map-infraestructura-page.tsx` (`colorPorSeveridadRango` :401, `circlePaintPartes` :419, badge de estado :192–212, `esSinReportar` :512 → borrar, `CAPAS_VISIBLES_DEFECTO` :620)
- Modify: `components/mapas/layer-control.tsx` (quitar las capas `evacuacion` y `sinReportar`)

**Interfaces:**
- `iconoPunto(e: EscuelaMapaEnriquecida): 'sin' | 'parcial' | 'evacuado' | 'centro' | 'reloj' | null`: estado de clases si no es `normal`; si no, `'reloj'` cuando `sinActualizar`; si no, `null`.
- `radioPunto(gravedad)`: menor para `0`.

- [ ] **Step 1: Write the failing test**: tabla de casos de `iconoPunto` (evacuado gana a sin actualizar; normal + sin actualizar → reloj; normal → null) y un test del feature collection que verifique `gravedad` e `icono` en las propiedades.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement**
  - El color del círculo sale de `gravedad`, con la escala de severidad existente. `0` usa el relleno neutro con borde gris.
  - El badge usa íconos lucide: `BookX` (sin clases), `BookMinus` (parcial), `DoorOpen` (evacuado), `House` (centro de evacuados), `Clock` (sin actualizar).
  - Se borran las capas `evacuacion` y `sinReportar` y sus toggles.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**: `feat(mapa): punto de escuela por gravedad con ícono de estado de clases`

### Task 11: Números de Situación actual

**Files:**
- Create: `lib/infraestructura/mapa/agregar.ts`, `lib/infraestructura/mapa/agregar.test.ts`

**Interfaces:**

```ts
export interface ResumenMapa {
  conReporte: number        // gravedad > 0
  sinClases: number         // clases !== 'normal'
  alumnosSinClases: number
  sinActualizar: number
  sinClasesConApoyo: number // apoyo en virtual|cuadernillo|ambos
}
export function resumir(escuelas: EscuelaMapaEnriquecida[]): ResumenMapa
export function ordenarReportes(escuelas: EscuelaMapaEnriquecida[]): EscuelaMapaEnriquecida[]
// gravedad desc; a igual gravedad, sin clases primero; después última novedad más reciente
```

- [ ] **Step 1: Write the failing test** con un padrón chico que cubra cada contador y el orden.
- [ ] **Step 2–4**: implementar y correr.
- [ ] **Step 5: Commit**: `feat(mapa): resumen y orden de reportes de la situación actual`

### Task 12: Panel de Situación actual

**Files:**
- Create: `components/mapas/panel-situacion-actual.tsx`, `components/mapas/panel-situacion-actual.test.tsx`
- Modify: `components/mapas/panel-lateral.tsx`, `app/globals.css`
- Delete (si no tiene otros usos): `components/mapas/title-panel.tsx`, `components/mapas/legend-panel.tsx` (lo reemplaza `leyenda-mapa.tsx`, Task 15) y el "left stack" de `map-infraestructura-page.tsx` (`leftStackAbierto`, `controlsStackAbierto`)

**Estructura (prototipo, sección "Situación actual"):**
1. Encabezado "Situación actual" y la hora de los datos.
2. Grilla 2×2: "Escuelas con reporte", "Sin clases" (resaltado), "Alumnos sin clases", "Sin actualizar".
3. "**X de Y** escuelas sin clases brindan apoyo pedagógico", con una barra.
4. "Reportes · por gravedad": renglones con franja de color, nombre, `departamento · nivel`, chips (clases, apoyo o "Sin apoyo", sin actualizar) y tiempo relativo.
5. Vacío: "Ninguna escuela con reporte para estos filtros."

Tipografía: un solo tamaño por nivel (título de panel, título de sección en versalitas, cuerpo).

- [ ] **Step 1: Write the failing test**: renderizar con un padrón de ejemplo y verificar los cuatro números, la frase de apoyo, el orden de la lista, los chips de un renglón y que el click llama `onSeleccionar(cue)`.
- [ ] **Step 2–4**: implementar y correr.
- [ ] **Step 5: Commit**: `feat(mapa): panel de situación actual con números, apoyo y reportes`

### Task 13: Ficha de escuela en el panel

**Files:**
- Create: `components/mapas/ficha-escuela-panel.tsx`, `components/mapas/ficha-escuela-panel.test.tsx`
- Modify: `components/mapas/map-infraestructura-page.tsx` (la selección abre la ficha en el panel en lugar de `FichaParteModal`; los modales de nominal e historial siguen abriéndose desde la ficha)
- Reutilizar: la carga de datos de `components/infraestructura/ficha-parte-modal.tsx`. Si la lógica de fetch está dentro del componente, extraerla a un hook `useFichaParte(cue)` y que el modal la siga usando donde se use fuera del mapa.

**Estructura:**
- "← Volver a la lista".
- Nombre; `CUE · departamento · nivel · N alumnos`.
- Banda de gravedad ("Gravedad Alta", categoría, "desde hace …"), o "Sin reportes abiertos".
- Chips de estado.
- Desplegables (`<details>`):
  - Acceso (abierto), Task 14;
  - Clases y apoyo pedagógico (abierto si `clases !== 'normal'`);
  - Situaciones (N abiertas), con el enlace "Ver historial";
  - Historial ("N situaciones en los últimos 2 años").

- [ ] **Step 1: Write the failing test**: banda con la gravedad correcta; "Clases y apoyo" abierto sólo sin clases normales; "Volver a la lista" llama `onCerrar`; "Ver historial" abre `HistorialParteModal`.
- [ ] **Step 2–4**: implementar y correr. Verificar que `paddingEncuadre` (:669) siga reservando el ancho del panel (`ANCHO_FICHA_LATERAL`) para encuadrar la ruta.
- [ ] **Step 5: Commit**: `feat(mapa): ficha de escuela en el panel lateral con secciones desplegables`

### Task 14: Bloque de acceso de tres líneas

**Files:**
- Create: `lib/infraestructura/mapa/acceso.ts`, `lib/infraestructura/mapa/acceso.test.ts`, `components/mapas/bloque-acceso.tsx`
- Modify: `components/mapas/capas-accesos.tsx` (quitar todos los textos de fuente, extracto, licencia y metodología; la ruta se dibuja sola con la selección, sin toggle)
- Test: `components/mapas/capas-accesos.test.tsx` (actualizar las aserciones que esperaban esos textos)

**Interfaces:**

```ts
export interface LineasAcceso {
  via: string | null        // "Ruta Provincial 13 (pavimentada) → Saladas · 14 km"
  cruces: string            // "⚠ 2 cruces de agua en el camino" | "Sin cruces de agua"
  riesgo: 'Bajo' | 'Medio' | 'Alto' | null
}
export function lineasAcceso(geometria: GeometriaAccesoRespuesta, exposicion: ExposicionInundacionRespuesta | null): LineasAcceso | null
// null → "Sin acceso calculado"
```

- Mientras no exista la vía principal (batch 6), la primera línea usa el destino y la distancia disponibles: "Camino → {destino} · {km} km".
- `cruces` cuenta `vado + sinEvidencia` (los puentes no).
- `riesgo` mapea la exposición existente a tres niveles.

- [ ] **Step 1: Write the failing test** con fixtures de geometría disponible, geometría sin ruta, 0, 1 y 2 cruces, y riesgo nulo.
- [ ] **Step 2–4**: implementar, cablear en la ficha y correr. Verificar con `rg -n "ODbL|extracto|arcsec|Aqueduct|período de retorno|No es un pronóstico" components` que no quede ningún texto técnico renderizado.
- [ ] **Step 5: Commit**: `feat(mapa): bloque de acceso conciso sin textos técnicos`

### Task 15: Leyenda de Situación actual y atribución compacta

**Files:**
- Create: `components/mapas/leyenda-mapa.tsx`, `components/mapas/leyenda-mapa.test.tsx`
- Modify: `components/mapas/map-infraestructura-page.tsx` (`<AttributionControl compact />`; quitar cualquier atribución en texto suelto)

- [ ] **Step 1: Write the failing test**: con `pestana="actual"`, la leyenda tiene exactamente dos filas: Crítica, Alta, Media, Baja y Sin reporte; y Sin clases, Clases parciales, Evacuado, Centro de evacuados y Sin actualizar. No contiene ningún `<p>`.
- [ ] **Step 2–4**: implementar y correr `pnpm test && pnpm lint && pnpm build`.
- [ ] **Step 5: Commit**: `feat(mapa): leyenda de dos líneas y atribución compacta del mapa base`

---

## Batch 4 — Radar y Planificación limpios

### Task 16: Panel de Radar

**Files:**
- Create: `components/mapas/panel-radar.tsx`, `components/mapas/panel-radar.test.tsx`
- Modify: `components/mapas/radar-meteo/radar-meteo.tsx`, `resumen-panel.tsx`, `leyenda.tsx` (quitar textos de fuente y metodología, y la lluvia observada)
- Modify: `components/mapas/risk-explanation-panel.tsx` (quitar metodología; si queda vacío y sin otros usos, borrarlo con su test)
- Modify: `components/mapas/radar-meteo/capas.ts` (quitar la capa de lluvia observada, si existe)

**Estructura:**
- "Radar · Pronóstico".
- Segmentado de horizonte con los horizontes que publica el motor (24 h · 72 h · 10 días), reutilizando la disponibilidad que hoy calcula `SelectorHorizonte`.
- Dos números: escuelas con riesgo alto o muy alto, y alumnos en esas escuelas.
- "Escuelas en riesgo", ordenadas y con click a la ficha.
- Las escuelas respetan los filtros compartidos.

- [ ] **Step 1: Write the failing test**: con fixtures del motor (`lib/infraestructura/riesgo/__fixtures__/motor-api.ts`), cambiar el horizonte actualiza la lista; no aparece el texto "lluvia observada" ni ningún texto de fuente.
- [ ] **Step 2–4**: implementar y correr.
- [ ] **Step 5: Commit**: `feat(mapa): panel de radar con horizonte, números y escuelas en riesgo`

### Task 17: Panel de Planificación

**Files:**
- Create: `components/mapas/panel-planificacion.tsx`, `components/mapas/panel-planificacion.test.tsx`, `lib/infraestructura/mapa/planificacion.ts` (+ test)
- Modify: `components/mapas/map-infraestructura-page.tsx` (con `pestana="planificacion"` se encienden las capas de aislamiento o inundación según la vista; Situación actual ya no las ofrece)

**Interfaces:**
- `nivelPlanificacion(e, vista: 'aisladas' | 'inundacion' | 'historial', datos): 0 | 1 | 2 | 3`: usa el índice de aislamiento y la exposición existentes (`use-territorio-mapa.ts`), y para historial la cantidad de situaciones (umbrales 0 / 1–2 / 3–4 / 5 o más; ajustables en el mismo archivo).

- [ ] **Step 1: Write the failing test**: la tabla de niveles por vista y el panel ordenado de mayor a menor.
- [ ] **Step 2–4**: implementar y correr.
- [ ] **Step 5: Commit**: `feat(mapa): pestaña de planificación con aisladas, inundación e historial`

### Task 18: Leyendas de Radar y Planificación

**Files:**
- Modify: `components/mapas/leyenda-mapa.tsx` (+ test)
- Delete (si no tiene otros usos): `components/mapas/peligro-legend.tsx`

- [ ] **Step 1: Write the failing test**: Radar → título "Riesgo de afectación · 72 h" y la escala Muy alto, Alto, Moderado y Bajo. Planificación → el título de la vista y la escala Alto, Medio, Bajo y Nulo.
- [ ] **Step 2–4**: implementar y correr.
- [ ] **Step 5: Commit**: `feat(mapa): leyendas de una línea para radar y planificación`

### Task 19: Fuera el contexto territorial vencido y los textos técnicos restantes

**Files:**
- Modify: `components/mapas/map-infraestructura-page.tsx` (bloque `hazardOn` :1358–1362 y el estado de fuente "vencida"), `components/mapas/overlay-styles.ts`, `components/mapas/feature-popup.tsx`
- Test: los tests existentes afectados

- [ ] **Step 1: Write the failing test**: con `hazardContextEnabled`, ningún texto "vencida", "fuente", "extracto" ni "corrida" aparece en el DOM del mapa.
- [ ] **Step 2–4**: implementar, correr `rg -n -i "vencid|fuente:|extracto|corrida|ODbL|arcsec|Aqueduct" components app` (sólo puede quedar en comentarios y en la página de ayuda) y correr `pnpm test && pnpm lint && pnpm build`.
- [ ] **Step 5: Commit**: `refactor(mapa): quitar contexto territorial vencido y textos técnicos`

---

## Batch 5 — Estadísticas

### Task 20: Agrupaciones y coincidencia con el panel

**Files:**
- Modify: `lib/infraestructura/mapa/agregar.ts` (+ test)

**Interfaces:**

```ts
export type AgruparPor = 'departamento' | 'nivel' | 'gravedad' | 'categoria'
export interface FilaAgrupada { clave: string; escuelas: number; afectadas: number; porcentaje: number; alumnosSinClases: number }
export function agrupar(escuelas: EscuelaMapaEnriquecida[], por: AgruparPor): FilaAgrupada[]
// ordenado por afectadas desc y después por escuelas desc
```

- [ ] **Step 1: Write the failing test**
  - **Coincidencia:** `resumir(filtrarEscuelas(p, f))` es igual a los números que muestra el panel de Situación actual con `f`, sobre el mismo padrón.
  - **Nivel:** una escuela de dos niveles suma en las dos filas. La suma de "escuelas" puede superar el total; se prueba y se documenta en la cabecera de la tabla ("una escuela puede tener más de un nivel").
- [ ] **Step 2–4**: implementar y correr.
- [ ] **Step 5: Commit**: `feat(mapa): agrupaciones de estadísticas del mapa`

### Task 21: Pestaña Estadísticas

**Files:**
- Create: `components/mapas/panel-estadisticas.tsx`, `components/mapas/panel-estadisticas.test.tsx`
- Modify: `app/(hub)/mapas/infraestructura/map-client.tsx` (montar `PanelEstadisticas` en lugar de `EvolucionPanel`)

**Estructura:** cinco números (afectadas, sin clases, alumnos sin clases, sin actualizar, "X / Y sin clases con apoyo pedagógico"); segmentado "Agrupar por"; tabla con %, barra chica y columnas en `tabular-nums`; debajo, los gráficos de evolución (Task 22).

- [ ] **Step 1: Write the failing test**: cambiar "Agrupar por" a Nivel cambia la primera columna y las filas; los números respetan los filtros recibidos.
- [ ] **Step 2–4**: implementar y correr.
- [ ] **Step 5: Commit**: `feat(mapa): pestaña de estadísticas con números y agrupación`

### Task 22: Evolución filtrada

**Files:**
- Modify: `app/api/mapas/infraestructura/evolucion/route.ts` (+ test), `components/infraestructura/evolucion-panel.tsx` (recibe `filtros`; el título "Evolución" pasa a ser una sección "Evolución en el tiempo")

- [ ] **Step 1: Write the failing test**: `GET /evolucion?departamento=Goya&nivel=Primario` devuelve sólo series de esas escuelas; sin parámetros, el resultado es igual al de hoy. Los filtros multivalor se pasan repetidos (`?departamento=Goya&departamento=Esquina`).
- [ ] **Step 2–4**: implementar (validar con zod; departamentos y niveles como arrays) y correr `pnpm test && pnpm lint && pnpm build`.
- [ ] **Step 5: Commit**: `feat(mapa): la evolución en el tiempo respeta los filtros del mapa`

---

## Batch 6 — Ruta de acceso (geo-static)

### Task 23: Datos de localidades urbanas (bloqueante)

**Files:**
- Create: `services/geo-static/data/localidades_urbanas.json`, `services/geo-static/data/localidades_urbanas.README.md`
- Create: `services/geo-static/src/geo_static/localidades.py`, `services/geo-static/tests/test_localidades.py`

- [ ] **Step 1: Verificar la fuente.** Confirmar si existe un dato oficial de población por localidad para Corrientes (resultados por localidad del censo del INDEC). Georef da las localidades con coordenadas, pero hay que confirmar si incluye población.
  - **Si no hay fuente oficial confiable: STOP.** Reportar al dueño de producto con las alternativas (otro umbral, lista curada) y no avanzar con las Tasks 24–27.
- [ ] **Step 2: Write the failing test**: `cargar_localidades_urbanas(path)` devuelve sólo localidades de 2.000 habitantes o más con `nombre`, `lat`, `lon` y `poblacion`, y falla con un error claro si el archivo no existe.
- [ ] **Step 3: Implement**: armar el JSON versionado (fuente, fecha y licencia en el README, nunca en la UI) y el cargador.
- [ ] **Step 4: Run**: `cd services/geo-static && uv run pytest tests/test_localidades.py`.
- [ ] **Step 5: Commit**: `feat(geo-static): localidades urbanas con población como destinos de acceso`

### Task 24: Costo por tipo de vía

**Files:**
- Modify: `services/geo-static/src/geo_static/osm_aislamiento.py` (`weight="length"` en :1322, :1325, :1493, :1623)
- Test: `services/geo-static/tests/test_osm_aislamiento.py`

- [ ] **Step 1: Write the failing test**

```python
def test_prefiere_ruta_pavimentada_sobre_huella_mas_corta():
    g = grafo_juguete([
        ("E", "A", {"length": 4000, "highway": "track"}),
        ("A", "L", {"length": 1000, "highway": "track"}),
        ("E", "B", {"length": 3000, "highway": "primary"}),
        ("B", "L", {"length": 4000, "highway": "primary"}),
    ])
    asignar_costo(g)
    ruta = nx.shortest_path(g, "E", "L", weight="costo")
    assert ruta == ["E", "B", "L"]


def test_superficie_no_pavimentada_penaliza():
    g = grafo_juguete([("E", "L", {"length": 1000, "highway": "secondary", "surface": "dirt"})])
    asignar_costo(g)
    assert g["E"]["L"][0]["costo"] == pytest.approx(1000 * 1.2 * 1.5)
```

  Adaptar `grafo_juguete` al `MultiDiGraph` que ya construyen los tests del archivo.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement**: `FACTOR_VIA` según la tabla del spec §9.1, el recargo de `SUPERFICIES_NO_PAVIMENTADAS` (excepto `track`) y `asignar_costo(grafo)` una sola vez por corrida. Reemplazar `weight="length"` por `weight="costo"` en las búsquedas. La distancia reportada sigue sumando `length`.
- [ ] **Step 4: Run** `uv run pytest tests/test_osm_aislamiento.py`.
- [ ] **Step 5: Commit**: `feat(geo-static): la ruta de acceso prefiere las vías en mejores condiciones`

### Task 25: Destino a la localidad urbana más cercana (multi-origen)

**Files:**
- Modify: `services/geo-static/src/geo_static/osm_aislamiento.py` (`calcular_metricas_departamento`, búsqueda desde `nodo_cabecera`)
- Modify: `services/geo-static/src/geo_static/jobs/calcular_aislamiento.py` (:330–340 y :425–440: dejar de resolver cabeceras como destino)
- Test: `services/geo-static/tests/test_osm_aislamiento.py`

- [ ] **Step 1: Write the failing test**
  - Con dos localidades urbanas y la cabecera departamental más lejos, la ruta termina en la localidad más cercana **por costo** y el registro trae `destino = {"nombre": …}`.
  - Una escuela sin camino a ninguna localidad queda con `motivo_sin_geometria = "sin_conexion_red"`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement**
  - `nx.multi_source_dijkstra(grafo_invertido, nodos_localidades, weight="costo")` una vez por corrida, conservando el patrón de un único Dijkstra (ver el docstring de N1 en `calcular_metricas_departamento`).
  - Mapear cada nodo origen a su localidad para obtener el destino.
  - Las localidades se buscan en toda la provincia, no por departamento: la más cercana puede estar en otro departamento.
  - `distancia_cabecera_departamental_m` se mantiene para compatibilidad y se suma `distancia_destino_m`.
- [ ] **Step 4: Run** `uv run pytest`.
- [ ] **Step 5: Commit**: `feat(geo-static): el acceso se calcula hacia la localidad urbana más cercana`

### Task 26: Vía principal en el registro de geometría

**Files:**
- Modify: `services/geo-static/src/geo_static/jobs/calcular_aislamiento.py` (`_registro_geometria` :183, `VERSION_JOB`)
- Test: `services/geo-static/tests/test_osm_aislamiento.py` o el test del job

- [ ] **Step 1: Write the failing test**: el registro trae `via_principal = {"nombre": "Ruta Provincial 13", "tipo": "primary", "pavimentada": True}`. Es la vía con más metros en la ruta; el nombre sale de `ref` (con el formato "Ruta Provincial N" / "Ruta Nacional N" según el prefijo `RP` / `RN`), si no de `name`, y si no `None`. También trae `destino` y `distancia_destino_m`.
- [ ] **Step 2–4**: implementar, subir `VERSION_JOB` y correr `uv run pytest`.
- [ ] **Step 5: Commit**: `feat(geo-static): la geometría de acceso informa vía principal, destino y distancia`

### Task 27: Importar y mostrar la vía principal

**Files:**
- Modify: `lib/db/schema.ts` (tabla de geometría de acceso: columnas nullable `via_principal` (JSON text), `destino_nombre`, `distancia_destino_m`)
- Create: `drizzle/0009_*.sql` (generado con `pnpm exec drizzle-kit generate --name acceso-via-principal`)
- Modify: `scripts/importar-geo-static.mjs`, `lib/infraestructura/territorio-mapa.ts` (`construirRespuestaGeometria`: sumar `viaPrincipal`, `destino` y `distanciaKm`; dejar de enviar `atribucion` a la UI)
- Modify: `lib/infraestructura/mapa/acceso.ts` (+ test)

- [ ] **Step 1: Write the failing test**: `lineasAcceso` con `viaPrincipal` arma "Ruta Provincial 13 (pavimentada) → Saladas · 14 km"; sin `viaPrincipal`, conserva el formato de la Task 14. El importador acepta registros viejos sin los campos nuevos.
- [ ] **Step 2–4**: implementar y correr `pnpm test && pnpm lint && pnpm build` y `uv run pytest`.
- [ ] **Step 5: Commit**: `feat(mapa): el bloque de acceso muestra la vía principal y la localidad destino`
- [ ] **Step 6: Regenerar datos.** La corrida del job y la importación en staging son operaciones remotas: se piden al dueño de producto con autorización explícita y no las hace el implementador.

---

## Fuera de este plan

- La página de ayuda con la explicación técnica (fuentes, metodología) que el spec §4.5 menciona. El plan sólo quita esos textos de la UI; la página se arma en una tarea aparte.
- Motivo, categoría y servicio como chips. Quedan para una iteración posterior si el día a día los pide.
