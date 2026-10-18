import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import type { HorasLluvia } from '@/components/mapas/capa-lluvia-observada'
import {
  VARIABLES_RADAR_UI,
  type VariableRadarUI,
} from '@/components/mapas/radar-meteo/selector'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { SEVERIDADES, type Severidad } from '@/lib/infraestructura/validacion'
import {
  CAPAS_VISIBLES_DEFAULT,
  type CapasVisibles,
} from './capas'
import { gravedadDeSeveridad } from './gravedad'
import { resolverPestana } from './pestanas'
import {
  parsearVistaPlanificacion,
  VISTA_PLANIFICACION_DEFAULT,
  type VistaPlanificacion,
} from './planificacion'
import type { HorizonteMotor } from './radar'
import {
  FILTROS_MAPA_VACIOS,
  type EstadoClases,
  type FiltrosMapa,
  type GravedadMapa,
  type PestanaMapa,
} from './tipos'

export const STORAGE_KEY_RETORNO_MAPA = 'mapa-infraestructura-retorno-v1'

export interface EstadoCamaraMapa {
  lng: number
  lat: number
  zoom: number
  bearing?: number
  pitch?: number
}

export type PestanaConMapa = Exclude<PestanaMapa, 'estadisticas' | 'metodologia'>

export interface SnapshotRetornoMapa {
  version: 1
  origen: 'mapa'
  tab: PestanaMapa
  ultimaPestanaMapa: PestanaConMapa
  filtros: FiltrosMapa
  seleccionCue: string | null
  previewAbierto: boolean
  camara: EstadoCamaraMapa | null
  basemap: BasemapId
  capasVisibles: CapasVisibles
  horasLluvia: HorasLluvia
  horizonteSeleccionado: HorizonteMotor
  variableRadar: VariableRadarUI
  vistaPlanificacion: VistaPlanificacion
  departamentoSeleccionado: string | null
  departamentoRadarId: string | null
}

const PREFIJO_RUTA_MAPA = '/mapas/infraestructura'

const PARAMETROS_PERMITIDOS = new Set([
  'cue',
  'origen',
  'modo',
  'pestana',
  'depto',
  'departamento',
  'nivel',
  'direccion',
  'clases',
  'severidad',
  'gravedad',
  'categoria',
  'apoyo',
  'q',
  'sinActualizar',
  'solucionadasRecientes',
  'horizonte',
  'variable',
  'vista',
])

const PESTANAS_VALIDAS: readonly PestanaMapa[] = [
  'actual',
  'radar',
  'planificacion',
  'estadisticas',
  'capas',
  'metodologia',
]

const PESTANAS_MAPA_VALIDAS: readonly PestanaConMapa[] = [
  'actual',
  'radar',
  'planificacion',
  'capas',
]

const CLASES_VALIDAS: readonly EstadoClases[] = [
  'normal',
  'parcial',
  'sin',
  'evacuado',
  'centro',
]

const APOYOS_VALIDOS: ReadonlyArray<'brinda' | 'no' | 'sin_dato'> = [
  'brinda',
  'no',
  'sin_dato',
]

const GRAVEDADES_VALIDAS: readonly GravedadMapa[] = [1, 2, 3, 4]

const HORIZONTES_VALIDOS: readonly HorizonteMotor[] = [24, 72, 240]

const HORAS_LLUVIA_VALIDAS: readonly HorasLluvia[] = [24, 72]

function separarValoresParametro(
  searchParams: URLSearchParams,
  clave: string,
): string[] {
  return searchParams
    .getAll(clave)
    .flatMap((valor) => valor.split(','))
    .map((item) => item.trim())
    .filter(Boolean)
}

function aURLSearchParams(
  entrada: URLSearchParams | Record<string, string | string[] | undefined>,
): URLSearchParams {
  if (entrada instanceof URLSearchParams) {
    return new URLSearchParams(entrada.toString())
  }
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(entrada)) {
    if (typeof valor === 'string') {
      params.set(clave, valor)
    } else if (Array.isArray(valor)) {
      for (const item of valor) {
        if (typeof item === 'string') params.append(clave, item)
      }
    }
  }
  return params
}

function parsearGravedadItem(raw: string): GravedadMapa | null {
  const num = Number(raw)
  if (GRAVEDADES_VALIDAS.includes(num as GravedadMapa)) {
    return num as GravedadMapa
  }
  if ((SEVERIDADES as readonly string[]).includes(raw)) {
    return gravedadDeSeveridad(raw as Severidad)
  }
  return null
}

function parsearHorizonte(raw: string | null | undefined): HorizonteMotor | null {
  if (!raw) return null
  const num = Number(raw)
  return HORIZONTES_VALIDOS.includes(num as HorizonteMotor)
    ? (num as HorizonteMotor)
    : null
}

function parsearVariableRadar(raw: string | null | undefined): VariableRadarUI | null {
  if (!raw) return null
  return (VARIABLES_RADAR_UI as readonly string[]).includes(raw)
    ? (raw as VariableRadarUI)
    : null
}


export function validarRutaRetornoInterna(
  ruta: string | null | undefined,
): string | null {
  if (typeof ruta !== 'string') return null
  const limpia = ruta.trim()
  if (!limpia.startsWith('/') || limpia.startsWith('//') || limpia.includes('\\')) {
    return null
  }

  let url: URL
  try {
    url = new URL(limpia, 'http://localhost')
  } catch {
    return null
  }

  if (url.origin !== 'http://localhost') return null
  if (
    url.pathname !== PREFIJO_RUTA_MAPA &&
    !url.pathname.startsWith(`${PREFIJO_RUTA_MAPA}/`)
  ) {
    return null
  }

  // Strip any unexpected query params so nominal or arbitrary data is never smuggled
  const filtrados = new URLSearchParams()
  for (const [clave, valor] of url.searchParams.entries()) {
    if (!PARAMETROS_PERMITIDOS.has(clave)) continue
    if (clave === 'cue') {
      const cue = normalizeCue(valor)
      if (cue) filtrados.set('cue', cue.value)
      continue
    }
    filtrados.append(clave, valor)
  }

  const query = filtrados.toString()
  const hash = url.hash || ''
  return `${url.pathname}${query ? `?${query}` : ''}${hash}`
}

export function serializarContextoMapaEnQuery(input: {
  tab?: PestanaMapa
  filtros: FiltrosMapa
  seleccionCue?: string | null
  horizonte?: HorizonteMotor
  variable?: VariableRadarUI
  vista?: VistaPlanificacion
  origen?: 'mapa'
}): URLSearchParams {
  const params = new URLSearchParams()

  if (input.origen) {
    params.set('origen', input.origen)
  }

  if (input.tab && input.tab !== 'actual') {
    params.set('modo', input.tab)
  }

  if (input.seleccionCue) {
    const parsed = normalizeCue(input.seleccionCue)
    if (parsed) params.set('cue', parsed.value)
  }

  const { filtros } = input
  const q = filtros.q.trim()
  if (q) params.set('q', q.slice(0, 120))
  if (filtros.departamentos.length > 0) {
    params.set('depto', filtros.departamentos.join(','))
  }
  if (filtros.direcciones.length > 0) {
    params.set('direccion', filtros.direcciones.join(','))
  }
  if (filtros.gravedades.length > 0) {
    params.set('severidad', filtros.gravedades.join(','))
  }
  if (filtros.clases.length > 0) {
    params.set('clases', filtros.clases.join(','))
  }
  if (filtros.apoyo.length > 0) {
    params.set('apoyo', filtros.apoyo.join(','))
  }
  if (filtros.sinActualizar) {
    params.set('sinActualizar', '1')
  }
  if (filtros.solucionadasRecientes) {
    params.set('solucionadasRecientes', '1')
  }

  if (input.horizonte && input.horizonte !== 72) {
    params.set('horizonte', String(input.horizonte))
  }
  if (input.variable && input.variable !== 'lluvia') {
    params.set('variable', input.variable)
  }
  if (input.vista && input.vista !== VISTA_PLANIFICACION_DEFAULT) {
    params.set('vista', input.vista)
  }

  return params
}

export function parsearContextoMapaDeQuery(
  searchParamsInput: URLSearchParams | Record<string, string | string[] | undefined>,
  hash = '',
  opciones: { radarHabilitado?: boolean } = {},
): {
  tab: PestanaMapa | null
  filtrosParciales: Partial<FiltrosMapa>
  tieneFiltrosEnUrl: boolean
  cue: string | null
  horizonte: HorizonteMotor | null
  variable: VariableRadarUI | null
  vista: VistaPlanificacion | null
  origen: 'mapa' | null
} {
  const params = aURLSearchParams(searchParamsInput)
  const radarHabilitado = opciones.radarHabilitado ?? true

  const hashLimpio = hash.replace(/^#/, '').split('/')[0]
  const modoRaw = (params.get('modo') ?? params.get('pestana') ?? '').trim()
  let tab: PestanaMapa | null = null
  if (hashLimpio) {
    tab = resolverPestana(`#${hashLimpio}`, params.toString(), { radarHabilitado })
  } else if (modoRaw) {
    if ((PESTANAS_VALIDAS as readonly string[]).includes(modoRaw)) {
      tab = modoRaw === 'radar' && !radarHabilitado ? 'actual' : (modoRaw as PestanaMapa)
    } else {
      tab = resolverPestana(`#${modoRaw}`, params.toString(), { radarHabilitado })
    }
  }

  const cueParsed = normalizeCue(params.get('cue') ?? '')
  const cue = cueParsed ? cueParsed.value : null

  const filtrosParciales: Partial<FiltrosMapa> = {}
  let tieneFiltrosEnUrl = false

  const qRaw = params.get('q')?.trim()
  if (qRaw) {
    filtrosParciales.q = qRaw.slice(0, 120)
    tieneFiltrosEnUrl = true
  }

  const departamentos = [
    ...separarValoresParametro(params, 'depto'),
    ...separarValoresParametro(params, 'departamento'),
  ]
  if (departamentos.length > 0) {
    filtrosParciales.departamentos = [...new Set(departamentos)]
    tieneFiltrosEnUrl = true
  }

  const direcciones = separarValoresParametro(params, 'direccion')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (direcciones.length > 0) {
    filtrosParciales.direcciones = [...new Set(direcciones)]
    tieneFiltrosEnUrl = true
  }

  const gravedades = [
    ...separarValoresParametro(params, 'severidad'),
    ...separarValoresParametro(params, 'gravedad'),
  ]
    .map(parsearGravedadItem)
    .filter((g): g is GravedadMapa => g !== null)
  if (gravedades.length > 0) {
    filtrosParciales.gravedades = [...new Set(gravedades)]
    tieneFiltrosEnUrl = true
  }

  const clases = separarValoresParametro(params, 'clases').filter(
    (c): c is EstadoClases => (CLASES_VALIDAS as readonly string[]).includes(c),
  )
  if (clases.length > 0) {
    filtrosParciales.clases = [...new Set(clases)]
    tieneFiltrosEnUrl = true
  }

  const apoyo = separarValoresParametro(params, 'apoyo').filter(
    (a): a is 'brinda' | 'no' | 'sin_dato' =>
      (APOYOS_VALIDOS as readonly string[]).includes(a),
  )
  if (apoyo.length > 0) {
    filtrosParciales.apoyo = [...new Set(apoyo)]
    tieneFiltrosEnUrl = true
  }

  const sinActualizarRaw = params.get('sinActualizar')
  if (sinActualizarRaw === '1' || sinActualizarRaw === 'true') {
    filtrosParciales.sinActualizar = true
    tieneFiltrosEnUrl = true
  }

  const solucionadasRaw = params.get('solucionadasRecientes')
  if (solucionadasRaw === '1' || solucionadasRaw === 'true') {
    filtrosParciales.solucionadasRecientes = true
    tieneFiltrosEnUrl = true
  }

  const horizonte = parsearHorizonte(params.get('horizonte'))
  const variable = parsearVariableRadar(params.get('variable'))
  const vista = parsearVistaPlanificacion(params.get('vista'))
  const origenRaw = params.get('origen')
  const origen = origenRaw === 'mapa' ? 'mapa' : null

  return {
    tab,
    filtrosParciales,
    tieneFiltrosEnUrl,
    cue,
    horizonte,
    variable,
    vista,
    origen,
  }
}

export function construirUrlFichaEscuela(
  cueAnexo: string,
  contexto?: {
    tab?: PestanaMapa
    filtros: FiltrosMapa
    horizonte?: HorizonteMotor
    variable?: VariableRadarUI
    vista?: VistaPlanificacion
    desdeMapa?: boolean
  },
): string {
  const base = `/mapas/infraestructura/escuelas/${encodeURIComponent(cueAnexo)}`
  if (!contexto) return base

  const params = serializarContextoMapaEnQuery({
    tab: contexto.tab ?? 'actual',
    filtros: contexto.filtros,
    horizonte: contexto.horizonte,
    variable: contexto.variable,
    vista: contexto.vista,
    origen: contexto.desdeMapa ? 'mapa' : undefined,
  })
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

export function construirUrlRetornoMapa(input: {
  cueAnexo?: string | null
  tab?: PestanaMapa
  filtros?: FiltrosMapa
  horizonte?: HorizonteMotor
  variable?: VariableRadarUI
  vista?: VistaPlanificacion
}): string {
  const tab = input.tab ?? 'actual'
  const params = serializarContextoMapaEnQuery({
    tab: 'actual', // tab goes into hash on the map route
    filtros: input.filtros ?? FILTROS_MAPA_VACIOS,
    seleccionCue: input.cueAnexo ?? null,
    horizonte: input.horizonte,
    variable: input.variable,
    vista: input.vista,
  })
  const query = params.toString()
  return `${PREFIJO_RUTA_MAPA}${query ? `?${query}` : ''}#${tab}`
}

function obtenerSessionStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function validarCamara(raw: unknown): EstadoCamaraMapa | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const lng = Number(obj.lng)
  const lat = Number(obj.lat)
  const zoom = Number(obj.zoom)
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) {
    return null
  }
  const bearing = obj.bearing !== undefined ? Number(obj.bearing) : undefined
  const pitch = obj.pitch !== undefined ? Number(obj.pitch) : undefined
  return {
    lng,
    lat,
    zoom,
    ...(bearing !== undefined && Number.isFinite(bearing) ? { bearing } : {}),
    ...(pitch !== undefined && Number.isFinite(pitch) ? { pitch } : {}),
  }
}

function validarFiltros(raw: unknown): FiltrosMapa {
  if (!raw || typeof raw !== 'object') return { ...FILTROS_MAPA_VACIOS }
  const obj = raw as Record<string, unknown>
  return {
    q: typeof obj.q === 'string' ? obj.q.slice(0, 120) : '',
    departamentos: Array.isArray(obj.departamentos)
      ? obj.departamentos.filter((d): d is string => typeof d === 'string')
      : [],
    direcciones: Array.isArray(obj.direcciones)
      ? obj.direcciones.filter((d): d is number => typeof d === 'number' && Number.isInteger(d))
      : [],
    gravedades: Array.isArray(obj.gravedades)
      ? obj.gravedades.filter((g): g is GravedadMapa =>
          GRAVEDADES_VALIDAS.includes(g as GravedadMapa),
        )
      : [],
    clases: Array.isArray(obj.clases)
      ? obj.clases.filter((c): c is EstadoClases =>
          (CLASES_VALIDAS as readonly string[]).includes(c as string),
        )
      : [],
    apoyo: Array.isArray(obj.apoyo)
      ? obj.apoyo.filter((a): a is 'brinda' | 'no' | 'sin_dato' =>
          (APOYOS_VALIDOS as readonly string[]).includes(a as string),
        )
      : [],
    sinActualizar: Boolean(obj.sinActualizar),
    solucionadasRecientes: Boolean(obj.solucionadasRecientes),
  }
}

function validarCapasVisibles(raw: unknown): CapasVisibles {
  const resultado = { ...CAPAS_VISIBLES_DEFAULT }
  if (!raw || typeof raw !== 'object') return resultado
  const obj = raw as Record<string, unknown>
  for (const clave of Object.keys(resultado) as Array<keyof CapasVisibles>) {
    if (typeof obj[clave] === 'boolean') {
      resultado[clave] = obj[clave]
    }
  }
  return resultado
}

export function guardarSnapshotRetornoMapa(
  snapshot: SnapshotRetornoMapa,
  storage?: Storage | null,
): void {
  const target = obtenerSessionStorage(storage)
  if (!target) return
  try {
    target.setItem(STORAGE_KEY_RETORNO_MAPA, JSON.stringify(snapshot))
  } catch {
    // Storage unavailable or quota exceeded
  }
}

export function leerSnapshotRetornoMapa(
  storage?: Storage | null,
): SnapshotRetornoMapa | null {
  const target = obtenerSessionStorage(storage)
  if (!target) return null
  try {
    const raw = target.getItem(STORAGE_KEY_RETORNO_MAPA)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (obj.version !== 1 || obj.origen !== 'mapa') return null

    const tab: PestanaMapa = (PESTANAS_VALIDAS as readonly string[]).includes(
      obj.tab as string,
    )
      ? (obj.tab as PestanaMapa)
      : 'actual'

    const ultimaPestanaMapa: PestanaConMapa = (
      PESTANAS_MAPA_VALIDAS as readonly string[]
    ).includes(obj.ultimaPestanaMapa as string)
      ? (obj.ultimaPestanaMapa as PestanaConMapa)
      : 'actual'

    const cueParsed =
      typeof obj.seleccionCue === 'string'
        ? normalizeCue(obj.seleccionCue)
        : null

    const basemap: BasemapId =
      typeof obj.basemap === 'string' && obj.basemap in BASEMAPS
        ? (obj.basemap as BasemapId)
        : 'voyager'

    const horasLluvia: HorasLluvia = HORAS_LLUVIA_VALIDAS.includes(
      obj.horasLluvia as HorasLluvia,
    )
      ? (obj.horasLluvia as HorasLluvia)
      : 72

    const horizonteSeleccionado: HorizonteMotor = HORIZONTES_VALIDOS.includes(
      obj.horizonteSeleccionado as HorizonteMotor,
    )
      ? (obj.horizonteSeleccionado as HorizonteMotor)
      : 72

    const variableRadar: VariableRadarUI = (
      VARIABLES_RADAR_UI as readonly string[]
    ).includes(obj.variableRadar as string)
      ? (obj.variableRadar as VariableRadarUI)
      : 'lluvia'

    const vistaPlanificacion: VistaPlanificacion = parsearVistaPlanificacion(obj.vistaPlanificacion) ?? VISTA_PLANIFICACION_DEFAULT

    return {
      version: 1,
      origen: 'mapa',
      tab,
      ultimaPestanaMapa,
      filtros: validarFiltros(obj.filtros),
      seleccionCue: cueParsed ? cueParsed.value : null,
      previewAbierto: Boolean(obj.previewAbierto),
      camara: validarCamara(obj.camara),
      basemap,
      capasVisibles: validarCapasVisibles(obj.capasVisibles),
      horasLluvia,
      horizonteSeleccionado,
      variableRadar,
      vistaPlanificacion,
      departamentoSeleccionado:
        typeof obj.departamentoSeleccionado === 'string'
          ? obj.departamentoSeleccionado
          : null,
      departamentoRadarId:
        typeof obj.departamentoRadarId === 'string'
          ? obj.departamentoRadarId
          : null,
    }
  } catch {
    return null
  }
}

export function limpiarSnapshotRetornoMapa(storage?: Storage | null): void {
  const target = obtenerSessionStorage(storage)
  if (!target) return
  try {
    target.removeItem(STORAGE_KEY_RETORNO_MAPA)
  } catch {
    // Ignore storage removal errors
  }
}
