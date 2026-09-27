// Fixtures puras de CONTRATO para los puertos de ingesta del módulo ENOS.
//
// Reglas de este archivo:
// - NO hace red, NO usa `fetch` real, NO importa runtime de los adaptadores ni
//   de los providers (sólo `import type`). Todo es dato de ejemplo + funciones
//   puras que arman un "proveedor fake" inyectable en las dependencias de cada
//   adaptador (`obtenerProbabilidades`, `obtenerTendencia`, `fetchImpl`).
// - Cada puerto cubre 4 escenarios: `normal`, `vacio`, `error`, `parcial`.
//
// `verificarFormaPuntoNormalizado` es la verificación de forma REUTILIZABLE que
// debe correr cualquier adaptador nuevo: espacializa qué campos son instantes
// ISO parseables, cuáles numéricos finitos (o `null`) y qué valores son fijos
// (`variable`, `acumuladoHoras`). Ver `contrato-puerto.test.ts`.
import type { DependenciasAdaptadorEnsemble } from '../ensemble'
import type { DependenciasAdaptadorSeasonal } from '../seasonal'
import type { GranuloSatelital } from '../puertos'
import type { HazardEnsembleProbPunto } from '../../providers/ensemble'
import type { EstadisticaEstacionalDepartamento } from '../../providers/seasonal'

// ---------------------------------------------------------------------------
// Escenarios comunes
// ---------------------------------------------------------------------------

export type EscenarioContrato = 'normal' | 'vacio' | 'error' | 'parcial'

/** Mensaje exacto que lanzan los fakes en el escenario `error`. */
export const MOTIVO_ERROR_FAKE = 'fallo simulado del proveedor'

// ---------------------------------------------------------------------------
// Verificación de forma reutilizable
// ---------------------------------------------------------------------------

export interface FormaPuntoNormalizado {
  /** Valor exacto esperado en `variable`. */
  variable: string
  /** Campos que deben ser strings ISO parseables con `Date.parse`. */
  instantesIso: string[]
  /** Campos string obligatorios (no vacíos). */
  cadenasRequeridas?: string[]
  /** Campos que deben ser números finitos. */
  numerosFinitos?: string[]
  /** Campos que deben ser números finitos o `null`. */
  numerosFinitosONull?: string[]
  /** Valores exactos esperados (p. ej. `acumuladoHoras: 24`). */
  valoresExactos?: Record<string, unknown>
}

/** `true` si `valor` es un string no vacío que `Date.parse` entiende como ISO. */
export function esInstanteIsoParseable(valor: unknown): boolean {
  if (typeof valor !== 'string' || valor.length === 0) return false
  return Number.isFinite(Date.parse(valor))
}

/**
 * Verifica que un punto normalizado cumpla la forma declarada. Lanza `Error`
 * con el campo exacto que falló. Es pura a propósito (sin `expect`) para que
 * cualquier suite de contrato la reutilice; el test la invoca dentro de un `it`.
 */
export function verificarFormaPuntoNormalizado(punto: object, forma: FormaPuntoNormalizado): void {
  const p = punto as Record<string, unknown>

  if (p.variable !== forma.variable) {
    throw new Error(`variable: se esperaba "${forma.variable}" y llegó "${String(p.variable)}"`)
  }

  for (const campo of forma.cadenasRequeridas ?? []) {
    const valor = p[campo]
    if (typeof valor !== 'string' || valor.length === 0) {
      throw new Error(`${campo}: se esperaba string no vacío y llegó "${String(valor)}"`)
    }
  }

  for (const campo of forma.instantesIso) {
    if (!esInstanteIsoParseable(p[campo])) {
      throw new Error(`${campo}: se esperaba instante ISO parseable y llegó "${String(p[campo])}"`)
    }
  }

  for (const campo of forma.numerosFinitos ?? []) {
    const valor = p[campo]
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new Error(`${campo}: se esperaba número finito y llegó "${String(valor)}"`)
    }
  }

  for (const campo of forma.numerosFinitosONull ?? []) {
    const valor = p[campo]
    if (valor !== null && (typeof valor !== 'number' || !Number.isFinite(valor))) {
      throw new Error(`${campo}: se esperaba número finito o null y llegó "${String(valor)}"`)
    }
  }

  for (const [campo, esperado] of Object.entries(forma.valoresExactos ?? {})) {
    if (p[campo] !== esperado) {
      throw new Error(`${campo}: se esperaba ${String(esperado)} y llegó ${String(p[campo])}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Ensemble (PuertoPronosticoEnsemble)
// ---------------------------------------------------------------------------

export const CORRIDA_EN_ENSEMBLE = '2026-09-27T00:00:00.000Z'
export const VALIDO_EN_ENSEMBLE = '2026-09-27T23:00:00.000Z'
export const REFS_ENSEMBLE = ['-27.5_-58.8', '-28.1_-58.2']
export const HORAS_VENTANA_ENSEMBLE = 24

type ObtenerProbabilidadesEnsembleFake = NonNullable<
  DependenciasAdaptadorEnsemble['obtenerProbabilidades']
>

export function puntoEnsembleProvider(
  overrides: Partial<HazardEnsembleProbPunto> = {},
): HazardEnsembleProbPunto {
  return {
    geometryRef: REFS_ENSEMBLE[0],
    variable: 'precipitacion_24h',
    corridaEn: CORRIDA_EN_ENSEMBLE,
    validoEn: VALIDO_EN_ENSEMBLE,
    horizonteHoras: 24,
    miembrosTotal: 51,
    miembrosValidos: 40,
    probabilidadP95: 0.25,
    probabilidadP99: 0.1,
    dispersion: 3.2,
    ...overrides,
  }
}

export function proveedorEnsembleFake(
  escenario: EscenarioContrato,
): ObtenerProbabilidadesEnsembleFake {
  return async (params) => {
    if (escenario === 'error') throw new Error(MOTIVO_ERROR_FAKE)

    const refs = params.geometryRefsConCoordenada.map((celda) => celda.geometryRef)
    if (escenario === 'vacio') {
      return {
        puntos: [],
        erroresPorCelda: Object.fromEntries(refs.map((ref) => [ref, 'sin_miembros'])),
        llamadasRealizadas: 1,
      }
    }

    const conDato = escenario === 'parcial' ? refs.slice(0, 1) : refs
    const sinDato = escenario === 'parcial' ? refs.slice(1) : []
    return {
      puntos: conDato.map((ref) => puntoEnsembleProvider({ geometryRef: ref })),
      erroresPorCelda: Object.fromEntries(sinDato.map((ref) => [ref, 'sin_climatologia'])),
      llamadasRealizadas: 1,
    }
  }
}

// ---------------------------------------------------------------------------
// Seasonal (PuertoTendenciaEstacional)
// ---------------------------------------------------------------------------

export const EMISION_EN_SEASONAL = '2026-09-01T00:00:00.000Z'
export const DEPARTAMENTOS_SEASONAL = ['Capital', 'Goya']

type ObtenerTendenciaFake = NonNullable<DependenciasAdaptadorSeasonal['obtenerTendencia']>

// Nota de forma REAL: el provider seasonal arma `emisionEn`/`validoDesde`/
// `validoHasta` con `toISOString().slice(0, 10)`, es decir fecha SIN hora ni
// sufijo `Z` (ver providers/seasonal.ts `fechaIsoUtc`). El fixture lo replica a
// propósito y el verificador sólo exige "ISO parseable", no `Z`.
export function estadisticaSeasonalProvider(
  overrides: Partial<EstadisticaEstacionalDepartamento> = {},
): EstadisticaEstacionalDepartamento {
  return {
    departamento: DEPARTAMENTOS_SEASONAL[0],
    variable: 'precipitacion_acumulada',
    emisionEn: '2026-09-01',
    validoDesde: '2026-10-01',
    validoHasta: '2026-11-30',
    horizonteDesdeDias: 30,
    horizonteHastaDias: 90,
    miembrosTotal: 51,
    miembrosValidos: 51,
    mediaMm: 120.5,
    medianaMm: 118,
    dispersionMm: 14.2,
    probabilidadSobreNormal: 0.46,
    ...overrides,
  }
}

export function proveedorSeasonalFake(
  escenario: EscenarioContrato,
): ObtenerTendenciaFake {
  return async (params) => {
    if (escenario === 'error') throw new Error(MOTIVO_ERROR_FAKE)

    const departamentos = params.centroides.map((centroide) => centroide.departamento)
    if (escenario === 'vacio') {
      return {
        estadisticas: [],
        erroresPorDepartamento: Object.fromEntries(
          departamentos.map((depto) => [depto, 'sin_miembros']),
        ),
        llamadasRealizadas: 1,
      }
    }

    const conDato = escenario === 'parcial' ? departamentos.slice(0, 1) : departamentos
    const sinDato = escenario === 'parcial' ? departamentos.slice(1) : []
    return {
      estadisticas: conDato.map((departamento) =>
        estadisticaSeasonalProvider({ departamento }),
      ),
      erroresPorDepartamento: Object.fromEntries(
        sinDato.map((depto) => [depto, 'sin_miembros']),
      ),
      llamadasRealizadas: 1,
    }
  }
}

// ---------------------------------------------------------------------------
// IMERG (PuertoObservacionSatelital)
// ---------------------------------------------------------------------------

export const GRANULO_TITULO = 'GPM_3IMERGHHE.07:3B-HHR-E.MS.MRG.3IMERG.20260926-S183000.HDF5'
export const GRANULO_INICIO = '2026-09-26T18:30:00.000Z'
export const GRANULO_FIN = '2026-09-26T18:59:59.999Z'
export const GRANULO_URL_DATOS = `https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/${GRANULO_TITULO}`

export const CMR_VACIO: unknown = { feed: { entry: [] } }

function entradaCmr(params: {
  titulo: string
  inicioEn: string
  finEn: string
  hrefDatos?: string
}): unknown {
  const links: Array<{ rel: string; href: string }> = [
    { rel: 'http://esipfed.org/ns/fedsearch/1.1/metadata#', href: 'https://example.invalid/s3credentials' },
  ]
  if (params.hrefDatos !== undefined) {
    links.push({ rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: params.hrefDatos })
  }
  return { title: params.titulo, time_start: params.inicioEn, time_end: params.finEn, links }
}

// Dos gránulos válidos (con link `.HDF5`).
export const CMR_CON_GRANULOS: unknown = {
  feed: {
    entry: [
      entradaCmr({ titulo: GRANULO_TITULO, inicioEn: GRANULO_INICIO, finEn: GRANULO_FIN, hrefDatos: GRANULO_URL_DATOS }),
      entradaCmr({
        titulo: 'GPM_3IMERGHHE.07:3B-HHR-E.MS.MRG.3IMERG.20260926-S190000.HDF5',
        inicioEn: '2026-09-26T19:00:00.000Z',
        finEn: '2026-09-26T19:29:59.999Z',
        hrefDatos: 'https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/20260926-S190000.HDF5',
      }),
    ],
  },
}

// Degradación parcial: un gránulo con link de datos y otro sin él (se descarta).
export const CMR_PARCIAL: unknown = {
  feed: {
    entry: [
      entradaCmr({ titulo: GRANULO_TITULO, inicioEn: GRANULO_INICIO, finEn: GRANULO_FIN, hrefDatos: GRANULO_URL_DATOS }),
      entradaCmr({
        titulo: 'GPM_3IMERGHHE.07:sin-link-de-datos',
        inicioEn: '2026-09-26T19:00:00.000Z',
        finEn: '2026-09-26T19:29:59.999Z',
      }),
    ],
  },
}

// Subset OPeNDAP ASCII con precipitación y calidad. Grilla 2x2 para no depender
// del fixture real: 4 celdas distintas tras el redondeo a 0,1° de
// `celdaDeCoordenada`.
export const ASCII_OBSERVACIONES = [
  'precipitation[0][0], 0.4, 0.8',
  'precipitation[0][1], 1.2, 1.6',
  'precipitationQualityIndex[0][0], 0.9, 0.8',
  'precipitationQualityIndex[0][1], 0.7, 0.6',
  'lat, -27.15, -27.25',
  'lon, -58.95, -59.05',
].join('\n')

// Degradación parcial: llega precipitación pero NO la fila de calidad
// (el adaptador debe dejar `calidad: null`, sin imputar).
export const ASCII_SIN_CALIDAD = [
  'precipitation[0][0], 0.4, 0.8',
  'precipitation[0][1], 1.2, 1.6',
  'lat, -27.15, -27.25',
  'lon, -58.95, -59.05',
].join('\n')

// Fuente vacía: el parser puro la trata como error explícito (ya se superó la
// etapa de "no hay dato disponible").
export const ASCII_VACIO = ''

/** Gránulo ya normalizado, para llamar `obtenerObservacion` sin listar. */
export function granuloSatelitalFake(): GranuloSatelital {
  return {
    id: GRANULO_TITULO,
    inicioEn: GRANULO_INICIO,
    finEn: GRANULO_FIN,
    urlDatos: GRANULO_URL_DATOS,
  }
}

/**
 * `fetchImpl` fake con dispatch por URL:
 * - `/search/granules.json` -> payload CMR según escenario.
 * - cualquier otra (subset OPeNDAP) -> texto ASCII según escenario.
 * - escenario `error` -> `500` para todo.
 */
export function fetchImergFake(escenario: EscenarioContrato): typeof fetch {
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (escenario === 'error') return new Response('boom', { status: 500 })

    if (url.includes('/search/granules.json')) {
      const payload =
        escenario === 'vacio' ? CMR_VACIO : escenario === 'parcial' ? CMR_PARCIAL : CMR_CON_GRANULOS
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const ascii =
      escenario === 'normal' ? ASCII_OBSERVACIONES : escenario === 'parcial' ? ASCII_SIN_CALIDAD : ASCII_VACIO
    return new Response(ascii, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return impl as unknown as typeof fetch
}
