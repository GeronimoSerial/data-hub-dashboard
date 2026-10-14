import { normalizarNombreDepartamento } from './normalizar-departamento'

export const EVENTOS_INUNDACIONES_URLS = {
  eventos: '/data/eventos-inundaciones/eventos.geojson',
  evidencias: '/data/eventos-inundaciones/evidencias.csv',
  gazetteer: '/data/eventos-inundaciones/gazetteer-osm.json',
} as const

export type PrecisionMostrada = 'estación' | 'localidad' | 'lugar' | 'departamento' | string

type Punto = { nombre: string; lon: number; lat: number; origen?: 'localidad' | 'escuelas' }

export type MetodoUbicacion = 'estación' | 'osm' | 'localidad' | 'escuelas' | 'departamento'

/** One curated OpenStreetMap place from gazetteer-osm.json (© OpenStreetMap contributors, ODbL). */
export type LugarOsm = {
  nombre: string
  consulta: string
  nombreOsm: string
  osmType: string
  osmId: number
  clase: string
  tipo: string
  lat: number
  lon: number
}

const TIPOS_LOCALIDAD_OSM = new Set(['city', 'town', 'village'])

type EstacionEntrada = {
  nombrePna: string
  coordenadas: { lat: number; lon: number } | null
}

type EventoEntrada = {
  geometry: { type: string; coordinates?: unknown } | null
  properties: Record<string, unknown>
}

export type PropiedadesUbicacion = {
  id_evento: string
  tipo_fenomeno: unknown
  tipo_afectacion: unknown
  lugar: string
  departamento: unknown
  precisionFuente: unknown
  precisionMostrada: PrecisionMostrada
  inicio_evento: unknown
  ultima_actualizacion: unknown
  estado_temporal: unknown
  confianza: unknown
  mediciones: unknown
  fuenteTitulo: string | null
  fuenteUrl: string | null
  multiLugar: boolean
  metodoUbicacion: MetodoUbicacion | null
  osmType: string | null
  osmId: number | null
  agregado: boolean
  titulo: string
  subtitulo: string
  hechos: string[]
  estadoEtiqueta: string
  confianzaEtiqueta: string
  fuentes: FuenteEvento[]
}

export type ResumenProvincial = {
  id_evento: string
  tipo_afectacion: unknown
  mediciones: unknown
  lugares: string[]
  titulo: string
  subtitulo: string
  hechos: string[]
  estadoEtiqueta: string
  confianzaEtiqueta: string
  fuentes: FuenteEvento[]
  fuenteTitulo: string | null
  fuenteUrl: string | null
}

export type LugarSinPrecision = { id: string; lugar: string }

export type FilaAuditoria = {
  id: string
  lugar: string
  metodo: MetodoUbicacion | 'resumen' | 'no determinada'
  osm: string | null
  lat: number | null
  lon: number | null
}

export type FuenteEvento = { medio: string; fecha: string | null; url: string }

export type MotivoDescarte = 'confianza_muy_baja' | 'sin_fuente_verificable'

export type EventoDescartado = { id: string; motivo: MotivoDescarte }

export type EventoUbicado = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: PropiedadesUbicacion
}

export type ResultadoUbicacion = {
  geojson: { type: 'FeatureCollection'; features: EventoUbicado[] }
  sinUbicar: string[]
  sinUbicacionPrecisa: LugarSinPrecision[]
  resumenProvincial: ResumenProvincial[]
  descartados: EventoDescartado[]
}

export type EntradaUbicacion = {
  eventos: { features: EventoEntrada[] }
  evidenciasCsv: string
  localidades: Punto[]
  departamentos: Punto[]
  estaciones: readonly EstacionEntrada[]
  gazetteer: { lugares: LugarOsm[]; sinCoincidencia: string[] }
}

export type EscuelaLocalizada = {
  localidad: string
  lat: number | null
  lon: number | null
  geoCalidad: string | null
}

export const LOCALIZACIONES_ESCUELAS_URL = '/data/localizaciones.json'

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 1 ? ordenados[medio] : (ordenados[medio - 1] + ordenados[medio]) / 2
}

/**
 * Locality-level reference points derived from school locations: the median
 * school position per locality. Rows with approximated (`geoCalidad` set) or
 * missing coordinates are ignored, so the point never claims more precision
 * than "somewhere in this town".
 */
export function centroidesLocalidadesEscuelas(filas: readonly EscuelaLocalizada[]): Punto[] {
  const porLocalidad = new Map<string, { nombre: string; lats: number[]; lons: number[] }>()
  for (const fila of filas) {
    if (fila.geoCalidad !== null || fila.lat === null || fila.lon === null || !fila.localidad) continue
    const clave = normalizarNombreDepartamento(fila.localidad)
    const grupo = porLocalidad.get(clave) ?? { nombre: fila.localidad, lats: [], lons: [] }
    grupo.lats.push(fila.lat)
    grupo.lons.push(fila.lon)
    porLocalidad.set(clave, grupo)
  }
  return [...porLocalidad.values()].map((grupo) => ({
    nombre: grupo.nombre,
    lat: mediana(grupo.lats),
    lon: mediana(grupo.lons),
    origen: 'escuelas',
  }))
}

/**
 * Locality reference points in lookup order: school medians first (town-level,
 * built from real school positions), then `localities.geojson`, whose points
 * are area centroids and can sit tens of km from the town (e.g. Goya, La Cruz).
 */
export function puntosDeLocalidades(localidadesGeojson: Punto[], escuelas: readonly EscuelaLocalizada[]): Punto[] {
  return [...centroidesLocalidadesEscuelas(escuelas), ...localidadesGeojson]
}

/**
 * Minimal RFC 4180 parser: quoted fields, escaped quotes (""), commas and
 * newlines inside quotes, CRLF or LF line endings. Returns one object per
 * data row keyed by the header row.
 */
export function parsearCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false
  const contenido = texto.replace(/^﻿/, '')

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i]
    if (enComillas) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          enComillas = false
        }
      } else {
        campo += c
      }
    } else if (c === '"') {
      enComillas = true
    } else if (c === ',') {
      fila.push(campo)
      campo = ''
    } else if (c === '\r') {
      // handled by the following \n
    } else if (c === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else {
      campo += c
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  const conContenido = filas.filter((f) => !(f.length === 1 && f[0] === ''))
  const [cabecera, ...cuerpo] = conContenido
  if (!cabecera) return []
  return cuerpo.map((f) =>
    Object.fromEntries(cabecera.map((nombre, j) => [nombre, f[j] ?? ''])),
  )
}

function dividirLista(valor: unknown): string[] {
  if (typeof valor !== 'string') return []
  return valor
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function sinParentesis(nombre: string): string {
  return nombre.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

function clave(nombre: string): string {
  return normalizarNombreDepartamento(sinParentesis(nombre))
}

function buscarPorNombre<T extends Punto>(lista: readonly T[], nombre: string): T | undefined {
  const buscada = clave(nombre)
  if (buscada === '') return undefined
  return lista.find((p) => clave(p.nombre) === buscada)
}

type UbicacionResuelta = {
  coordenadas: [number, number]
  precision: PrecisionMostrada
  metodo: MetodoUbicacion
  osmType?: string
  osmId?: number
}

/** Exact place text (normalized) against the curated OSM names. */
function buscarOsm(texto: string, lugares: readonly LugarOsm[]): LugarOsm | undefined {
  const buscado = normalizarNombreDepartamento(texto)
  if (buscado === '') return undefined
  return lugares.find((l) => normalizarNombreDepartamento(l.nombre) === buscado)
}

/**
 * Only plain locality names may use the generic locality list or a department
 * centroid. Islands, paraje/barrio names and parenthesised names are placed by
 * a curated source or not at all: a school median would invent their position.
 */
function esLocalidadSimple(lugar: string): boolean {
  const texto = lugar.trim()
  return !/[()]/.test(texto) && !/^(isla|paraje|barrio)\b/i.test(texto)
}

function precisionOsm(lugar: LugarOsm): PrecisionMostrada {
  return lugar.clase === 'boundary' || TIPOS_LOCALIDAD_OSM.has(lugar.tipo) ? 'localidad' : 'lugar'
}

function ubicarLugar(
  lugar: string,
  datos: EntradaUbicacion,
  precisionFuente: unknown,
): UbicacionResuelta | null {
  if (precisionFuente === 'estación') {
    const buscada = clave(lugar)
    const estacion = datos.estaciones.find(
      (e) => e.coordenadas !== null && normalizarNombreDepartamento(e.nombrePna) === buscada,
    )
    if (estacion?.coordenadas) {
      return { coordenadas: [estacion.coordenadas.lon, estacion.coordenadas.lat], precision: 'estación', metodo: 'estación' }
    }
  }

  const osm = buscarOsm(lugar, datos.gazetteer.lugares)
  if (osm) {
    return {
      coordenadas: [osm.lon, osm.lat],
      precision: precisionOsm(osm),
      metodo: 'osm',
      osmType: osm.osmType,
      osmId: osm.osmId,
    }
  }

  if (!esLocalidadSimple(lugar)) return null

  const localidad = buscarPorNombre(datos.localidades, lugar)
  if (localidad) {
    return {
      coordenadas: [localidad.lon, localidad.lat],
      precision: 'localidad',
      metodo: localidad.origen === 'escuelas' ? 'escuelas' : 'localidad',
    }
  }
  return null
}

function ubicarEnDepartamento(nombreDepartamento: string, datos: EntradaUbicacion): UbicacionResuelta | null {
  const departamento = buscarPorNombre(datos.departamentos, nombreDepartamento)
  if (!departamento) return null
  return { coordenadas: [departamento.lon, departamento.lat], precision: 'departamento', metodo: 'departamento' }
}

function esNombreDeLocalidad(nombre: string, datos: EntradaUbicacion): boolean {
  return (
    buscarPorNombre(datos.localidades, nombre) !== undefined ||
    buscarOsm(nombre, datos.gazetteer.lugares) !== undefined
  )
}

/**
 * Department fallback for the place at `indice`. A multi-place event only pairs
 * lists of equal length, and never with a department named like a locality.
 * A single-place event may use its only department (or the place name itself
 * when no department is given).
 */
function ubicarDepartamentoPara(
  indice: number,
  lugares: readonly string[],
  departamentos: readonly string[],
  datos: EntradaUbicacion,
): UbicacionResuelta | null {
  if (lugares.length === 1) {
    if (departamentos.length > 1) return null
    return ubicarEnDepartamento(departamentos[0] ?? lugares[0], datos)
  }
  if (departamentos.length !== lugares.length) return null
  const departamento = departamentos[indice]
  if (esNombreDeLocalidad(departamento, datos)) return null
  return ubicarEnDepartamento(departamento, datos)
}

const RE_AGREGADO = /provincial|consolidad/i

type FilaEvidencia = { titulo: string | null; url: string | null; medio: string; fecha: string | null }

const ID_EVIDENCIA = /\bEVD?-\d[\w-]*/g

function esUrlHttp(url: string | null): url is string {
  return url !== null && /^https?:\/\//i.test(url)
}

function indexarEvidencias(csv: string): Map<string, FilaEvidencia> {
  const mapa = new Map<string, FilaEvidencia>()
  for (const fila of parsearCsv(csv)) {
    const id = fila.id_evidencia?.trim()
    if (!id) continue
    const fecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(fila.fecha_publicacion?.trim() ?? '')
    mapa.set(id, {
      titulo: fila.titulo?.trim() || null,
      url: fila.url?.trim() || null,
      medio: fila.fuente?.trim() || fila.titulo?.trim() || 'Fuente sin nombre',
      fecha: fecha ? `${Number(fecha[3])}/${Number(fecha[2])}` : null,
    })
  }
  return mapa
}

function capitalizar(texto: string): string {
  return texto.length === 0 ? texto : texto.charAt(0).toUpperCase() + texto.slice(1)
}

function primeraClausula(valor: unknown): string {
  if (typeof valor !== 'string') return ''
  return sinParentesis(valor.split(';')[0] ?? '')
}

/** Plain-Spanish headline: what happened, plus the cause when it is known. */
export function tituloEvento(p: { tipo_fenomeno: unknown; tipo_afectacion: unknown; curso_agua: unknown }): string {
  const fenomeno = typeof p.tipo_fenomeno === 'string' ? sinParentesis(p.tipo_fenomeno).toLowerCase() : ''
  const cursoAgua = typeof p.curso_agua === 'string' ? p.curso_agua.trim() : ''
  const afectacion = primeraClausula(p.tipo_afectacion)

  if (/^ninguna/i.test(afectacion) || afectacion === '') {
    return fenomeno ? `${capitalizar(fenomeno)} sin daños informados` : 'Evento sin daños informados'
  }
  let titulo = capitalizar(afectacion)
  if (fenomeno.includes('crecida') && cursoAgua.startsWith('río')) {
    titulo += ` por crecida del ${cursoAgua}`
  } else if (/lluvia|tormenta/.test(fenomeno)) {
    titulo += ` por ${fenomeno}`
  }
  return titulo
}

const MESES_FECHA = /^(\d{4})-(\d{2})-(\d{2})/

function fechaCorta(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const m = MESES_FECHA.exec(valor.trim())
  return m ? `${Number(m[3])}/${Number(m[2])}` : null
}

/** "lugar · desde 6/10", "lugar · 6/10 – 8/10"; the range is omitted when the start is unknown. */
export function subtituloEvento(lugar: string, inicio: unknown, fin: unknown): string {
  const inicioCorto = fechaCorta(inicio)
  if (!inicioCorto) return lugar
  const aprox = (valor: unknown) => (typeof valor === 'string' && /aprox\./.test(valor) ? ' (aprox.)' : '')
  const finCorto = fechaCorta(fin)
  const rango = finCorto
    ? `${inicioCorto}${aprox(inicio)} – ${finCorto}${aprox(fin)}`
    : `desde ${inicioCorto}${aprox(inicio)}`
  return lugar ? `${lugar} · ${rango}` : rango
}

const MAX_HECHOS = 3
const MAX_LARGO_HECHO = 140

/** Up to three short facts from the measurements text, with evidence references removed. */
export function hechosEvento(mediciones: unknown): string[] {
  if (typeof mediciones !== 'string') return []
  const hechos: string[] = []
  for (const clausula of mediciones.split(/;|\.\s+/)) {
    const limpia = clausula
      .replace(/\s*\([^()]*\bEVD?-\d[^()]*\)/g, ' ')
      .replace(ID_EVIDENCIA, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,:]+|[\s,:]+$/g, '')
    if (limpia.length < 3 || /^ver\b/i.test(limpia)) continue
    const capitalizado = capitalizar(limpia)
    hechos.push(
      capitalizado.length > MAX_LARGO_HECHO ? `${capitalizado.slice(0, MAX_LARGO_HECHO - 1).trimEnd()}…` : capitalizado,
    )
    if (hechos.length === MAX_HECHOS) break
  }
  return hechos
}

export function etiquetaEstado(estado: unknown): string {
  switch (estado) {
    case 'vigente_segun_ultimo_reporte':
      return 'Vigente según el último reporte'
    case 'ocurrido':
      return 'Finalizado'
    case 'evolucion_desconocida':
      return 'Evolución desconocida'
    default:
      return 'Estado sin informar'
  }
}

export function etiquetaConfianza(confianza: unknown): string {
  switch (confianza) {
    case 'alta':
      return 'Confianza alta'
    case 'media':
      return 'Confianza media'
    case 'baja':
      return 'Confianza baja'
    default:
      return 'Confianza sin informar'
  }
}

export function ubicarEventos(datos: EntradaUbicacion): ResultadoUbicacion {
  const evidencias = indexarEvidencias(datos.evidenciasCsv)
  const features: EventoUbicado[] = []
  const sinUbicar = new Set<string>()
  const sinUbicacionPrecisa: LugarSinPrecision[] = []
  const resumenProvincial: ResumenProvincial[] = []
  const descartados: EventoDescartado[] = []

  for (const evento of datos.eventos.features) {
    const p = evento.properties
    const idEvento = String(p.id_evento ?? '')
    const lugares = dividirLista(p.localidad)
    const departamentos = dividirLista(p.departamento)
    const idsFuente = [...new Set([...dividirLista(p.fuente_principal), ...dividirLista(p.evidencias)])]
    const fuenteId = dividirLista(p.fuente_principal)[0]
    const fuente = fuenteId ? evidencias.get(fuenteId) : undefined
    const precisionFuente = p.geometria_precision

    const fuentes: FuenteEvento[] = idsFuente.flatMap((id) => {
      const fila = evidencias.get(id)
      return fila && esUrlHttp(fila.url) ? [{ medio: fila.medio, fecha: fila.fecha, url: fila.url }] : []
    })

    if (p.confianza === 'muy baja') {
      descartados.push({ id: idEvento, motivo: 'confianza_muy_baja' })
      continue
    }
    if (fuentes.length === 0) {
      descartados.push({ id: idEvento, motivo: 'sin_fuente_verificable' })
      continue
    }

    const base = {
      id_evento: idEvento,
      tipo_fenomeno: p.tipo_fenomeno,
      tipo_afectacion: p.tipo_afectacion,
      departamento: p.departamento,
      precisionFuente,
      inicio_evento: p.inicio_evento,
      ultima_actualizacion: p.ultima_actualizacion,
      estado_temporal: p.estado_temporal,
      confianza: p.confianza,
      mediciones: p.mediciones,
      fuenteTitulo: fuente?.titulo ?? null,
      fuenteUrl: fuente?.url ?? null,
      multiLugar: lugares.length > 1,
      metodoUbicacion: null as MetodoUbicacion | null,
      osmType: null as string | null,
      osmId: null as number | null,
      agregado: false,
      titulo: tituloEvento({ tipo_fenomeno: p.tipo_fenomeno, tipo_afectacion: p.tipo_afectacion, curso_agua: p.curso_agua }),
      hechos: hechosEvento(p.mediciones),
      estadoEtiqueta: etiquetaEstado(p.estado_temporal),
      confianzaEtiqueta: etiquetaConfianza(p.confianza),
      fuentes,
    }
    const lugarCompleto = lugares.join('; ') || String(p.localidad ?? '')
    const esAgregado = [p.tipo_afectacion, p.mediciones].some((v) => typeof v === 'string' && RE_AGREGADO.test(v))

    if (esAgregado) {
      // A provincial figure is not a point: it is listed as a summary, and only
      // its named places that resolve to a real place precision get a marker.
      resumenProvincial.push({
        id_evento: idEvento,
        tipo_afectacion: p.tipo_afectacion,
        mediciones: p.mediciones,
        lugares,
        titulo: base.titulo,
        subtitulo: subtituloEvento(lugarCompleto, p.inicio_evento, p.fin_evento),
        hechos: base.hechos,
        estadoEtiqueta: base.estadoEtiqueta,
        confianzaEtiqueta: base.confianzaEtiqueta,
        fuentes,
        fuenteTitulo: base.fuenteTitulo,
        fuenteUrl: base.fuenteUrl,
      })
      for (const lugar of lugares) {
        const ubicado = ubicarLugar(lugar, datos, precisionFuente)
        if (!ubicado) continue
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: ubicado.coordenadas },
          properties: {
            ...base,
            lugar,
            precisionMostrada: ubicado.precision,
            metodoUbicacion: ubicado.metodo,
            osmType: ubicado.osmType ?? null,
            osmId: ubicado.osmId ?? null,
            agregado: true,
            subtitulo: subtituloEvento(lugar, p.inicio_evento, p.fin_evento),
          },
        })
      }
      continue
    }

    if (evento.geometry?.type === 'Point' && Array.isArray(evento.geometry.coordinates)) {
      const [lon, lat] = evento.geometry.coordinates as [number, number]
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          ...base,
          lugar: lugarCompleto,
          precisionMostrada: String(precisionFuente ?? ''),
          subtitulo: subtituloEvento(lugarCompleto, p.inicio_evento, p.fin_evento),
        },
      })
      continue
    }

    let faltaAlgunLugar = lugares.length === 0
    lugares.forEach((lugar, indice) => {
      const plano = esLocalidadSimple(lugar)
      const ubicado =
        ubicarLugar(lugar, datos, precisionFuente) ??
        (plano ? ubicarDepartamentoPara(indice, lugares, departamentos, datos) : null)
      if (!ubicado) {
        // A non-plain place with no curated match is named as undetermined, never a point.
        if (plano) faltaAlgunLugar = true
        else sinUbicacionPrecisa.push({ id: idEvento, lugar })
        return
      }
      // A department centroid is not a point for one of several places: it would
      // suggest a location the source does not give.
      if (ubicado.precision === 'departamento' && lugares.length > 1) {
        sinUbicacionPrecisa.push({ id: idEvento, lugar })
        return
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: ubicado.coordenadas },
        properties: {
          ...base,
          lugar,
          precisionMostrada: ubicado.precision,
          metodoUbicacion: ubicado.metodo,
          osmType: ubicado.osmType ?? null,
          osmId: ubicado.osmId ?? null,
          subtitulo: subtituloEvento(lugar, p.inicio_evento, p.fin_evento),
        },
      })
    })

    if (faltaAlgunLugar && idEvento) sinUbicar.add(idEvento)
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    sinUbicar: [...sinUbicar],
    sinUbicacionPrecisa,
    resumenProvincial,
    descartados,
  }
}

/**
 * One audit row per place and event, for every kept event id: drawn places
 * with their method and coordinates, summary-only places, places left without
 * a precise location, and events with no resolvable place at all.
 */
export function auditarUbicaciones(resultado: ResultadoUbicacion): FilaAuditoria[] {
  const filas: FilaAuditoria[] = resultado.geojson.features.map((f) => ({
    id: f.properties.id_evento,
    lugar: f.properties.lugar,
    metodo: f.properties.metodoUbicacion ?? 'localidad',
    osm: f.properties.osmType && f.properties.osmId !== null ? `${f.properties.osmType}/${f.properties.osmId}` : null,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }))
  const conFila = new Set(filas.map((f) => f.id))
  for (const r of resultado.resumenProvincial) {
    const sinPuntos = r.lugares.filter((lugar) => !filas.some((f) => f.id === r.id_evento && f.lugar === lugar))
    if (sinPuntos.length === 0 && !conFila.has(r.id_evento)) {
      filas.push({ id: r.id_evento, lugar: '', metodo: 'resumen', osm: null, lat: null, lon: null })
    }
    for (const lugar of sinPuntos) {
      filas.push({ id: r.id_evento, lugar, metodo: 'resumen', osm: null, lat: null, lon: null })
    }
  }
  for (const s of resultado.sinUbicacionPrecisa) {
    filas.push({ id: s.id, lugar: s.lugar, metodo: 'no determinada', osm: null, lat: null, lon: null })
  }
  for (const id of resultado.sinUbicar) {
    filas.push({ id, lugar: '', metodo: 'no determinada', osm: null, lat: null, lon: null })
  }
  return filas
}
