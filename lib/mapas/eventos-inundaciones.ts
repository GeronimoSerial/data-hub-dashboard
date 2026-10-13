import { normalizarNombreDepartamento } from './normalizar-departamento'

export const EVENTOS_INUNDACIONES_URLS = {
  eventos: '/data/eventos-inundaciones/eventos.geojson',
  evidencias: '/data/eventos-inundaciones/evidencias.csv',
} as const

export type PrecisionMostrada = 'estación' | 'localidad' | 'departamento' | string

type Punto = { nombre: string; lon: number; lat: number }

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
}

export type EventoUbicado = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: PropiedadesUbicacion
}

export type ResultadoUbicacion = {
  geojson: { type: 'FeatureCollection'; features: EventoUbicado[] }
  sinUbicar: string[]
}

export type EntradaUbicacion = {
  eventos: { features: EventoEntrada[] }
  evidenciasCsv: string
  localidades: Punto[]
  departamentos: Punto[]
  estaciones: readonly EstacionEntrada[]
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
  }))
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

function ubicarLugar(
  lugar: string,
  datos: EntradaUbicacion,
  precisionFuente: unknown,
): { coordenadas: [number, number]; precision: PrecisionMostrada } | null {
  if (precisionFuente === 'estación') {
    const buscada = clave(lugar)
    const estacion = datos.estaciones.find(
      (e) => e.coordenadas !== null && normalizarNombreDepartamento(e.nombrePna) === buscada,
    )
    if (estacion?.coordenadas) {
      return { coordenadas: [estacion.coordenadas.lon, estacion.coordenadas.lat], precision: 'estación' }
    }
  }

  const localidad = buscarPorNombre(datos.localidades, lugar)
  if (localidad) {
    return { coordenadas: [localidad.lon, localidad.lat], precision: 'localidad' }
  }
  return null
}

function ubicarEnDepartamento(
  nombreDepartamento: string,
  datos: EntradaUbicacion,
): { coordenadas: [number, number]; precision: PrecisionMostrada } | null {
  const departamento = buscarPorNombre(datos.departamentos, nombreDepartamento)
  if (!departamento) return null
  return { coordenadas: [departamento.lon, departamento.lat], precision: 'departamento' }
}

function indexarEvidencias(csv: string): Map<string, { titulo: string | null; url: string | null }> {
  const mapa = new Map<string, { titulo: string | null; url: string | null }>()
  for (const fila of parsearCsv(csv)) {
    const id = fila.id_evidencia?.trim()
    if (!id) continue
    mapa.set(id, {
      titulo: fila.titulo?.trim() || null,
      url: fila.url?.trim() || null,
    })
  }
  return mapa
}

export function ubicarEventos(datos: EntradaUbicacion): ResultadoUbicacion {
  const evidencias = indexarEvidencias(datos.evidenciasCsv)
  const features: EventoUbicado[] = []
  const sinUbicar = new Set<string>()

  for (const evento of datos.eventos.features) {
    const p = evento.properties
    const idEvento = String(p.id_evento ?? '')
    const lugares = dividirLista(p.localidad)
    const departamentos = dividirLista(p.departamento)
    const fuenteId = dividirLista(p.fuente_principal)[0]
    const fuente = fuenteId ? evidencias.get(fuenteId) : undefined
    const precisionFuente = p.geometria_precision

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
    }

    if (evento.geometry?.type === 'Point' && Array.isArray(evento.geometry.coordinates)) {
      const [lon, lat] = evento.geometry.coordinates as [number, number]
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          ...base,
          lugar: lugares.join('; ') || String(p.localidad ?? ''),
          precisionMostrada: String(precisionFuente ?? ''),
        },
      })
      continue
    }

    let faltaAlgunLugar = lugares.length === 0
    lugares.forEach((lugar, indice) => {
      const ubicado =
        ubicarLugar(lugar, datos, precisionFuente) ??
        // Department list is index-aligned with the locality list when present;
        // otherwise the locality name itself is looked up as a department.
        ubicarEnDepartamento(departamentos[indice] ?? lugar, datos)
      if (!ubicado) {
        faltaAlgunLugar = true
        return
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: ubicado.coordenadas },
        properties: { ...base, lugar, precisionMostrada: ubicado.precision },
      })
    })

    if (faltaAlgunLugar && idEvento) sinUbicar.add(idEvento)
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    sinUbicar: [...sinUbicar],
  }
}
