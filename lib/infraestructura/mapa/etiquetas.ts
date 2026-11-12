import { ETIQUETA_ESTABLECIMIENTO, ETIQUETA_SERVICIO } from '@/components/infraestructura/estado-actual-textos'
import type { EstadoClases, GravedadMapa } from '@/lib/infraestructura/mapa/tipos'
import { severidadDeGravedad } from './gravedad'
import { contar } from '@/lib/infraestructura/parte/instituto-ui'
import { regionPublicaActual } from '@/lib/infraestructura/region/publica'

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')

/**
 * Detalle de una escuela en listas y paneles: los niveles GE, o para un
 * instituto superior "N carreras · M alumnos matriculados" (igual que la ficha).
 */
export function detalleNivelOInstituto(escuela: { niveles: string[]; carreras?: number; alumnos: number }): string {
  if (escuela.carreras === undefined) return escuela.niveles.join(', ')
  return [
    contar(escuela.carreras, 'carrera', 'carreras'),
    `${FORMATO_NUMERO.format(escuela.alumnos)} ${escuela.alumnos === 1 ? 'alumno matriculado' : 'alumnos matriculados'}`,
  ].join(' · ')
}

const ETIQUETAS_DEPARTAMENTO: Record<string, string> = {
  'BELLA VISTA': 'Bella Vista',
  'BERON DE ASTRADA': 'Berón de Astrada',
  CAPITAL: 'Capital',
  CONCEPCION: 'Concepción',
  'CURUZU CUATIA': 'Curuzú Cuatiá',
  EMPEDRADO: 'Empedrado',
  ESQUINA: 'Esquina',
  'GENERAL ALVEAR': 'General Alvear',
  'GENERAL PAZ': 'General Paz',
  GOYA: 'Goya',
  ITATI: 'Itatí',
  ITUZAINGO: 'Ituzaingó',
  LAVALLE: 'Lavalle',
  MBURUCUYA: 'Mburucuyá',
  MERCEDES: 'Mercedes',
  'MONTE CASEROS': 'Monte Caseros',
  'PASO DE LOS LIBRES': 'Paso de los Libres',
  SALADAS: 'Saladas',
  'SAN COSME': 'San Cosme',
  'SAN LUIS DEL PALMAR': 'San Luis del Palmar',
  'SAN MARTIN': 'San Martín',
  'SAN MIGUEL': 'San Miguel',
  'SAN ROQUE': 'San Roque',
  'SANTO TOME': 'Santo Tomé',
  SAUCE: 'Sauce',
}

const CONECTORES_DEPARTAMENTO = new Set(['de', 'del', 'los'])

const ETIQUETAS_DEPARTAMENTO_POR_REGION: Record<string, Record<string, string>> = {
  corrientes: ETIQUETAS_DEPARTAMENTO,
}

// A region without its own table gets no labels and uses the generic fallback.
export function etiquetasDepartamentoDeRegion(regionId: string): Record<string, string> {
  return Object.hasOwn(ETIQUETAS_DEPARTAMENTO_POR_REGION, regionId) ? ETIQUETAS_DEPARTAMENTO_POR_REGION[regionId] : {}
}

export function etiquetaDepartamento(valor: string): string {
  return etiquetaDepartamentoDeRegion(regionPublicaActual().id, valor)
}

export function etiquetaDepartamentoDeRegion(regionId: string, valor: string): string {
  const etiqueta = etiquetasDepartamentoDeRegion(regionId)[valor]
  if (etiqueta) return etiqueta

  return valor.trim().split(/\s+/u).map((palabra, indice) => {
    const minuscula = palabra.toLocaleLowerCase('es')
    if (indice > 0 && CONECTORES_DEPARTAMENTO.has(minuscula)) return minuscula
    const primeraLetra = minuscula.charAt(0).toLocaleUpperCase('es')
    return `${primeraLetra}${minuscula.slice(1)}`
  }).join(' ')
}

export const ETIQUETA_GRAVEDAD: Record<GravedadMapa, string> = {
  0: 'Sin situaciones',
  1: severidadDeGravedad(1) ?? '',
  2: severidadDeGravedad(2) ?? '',
  3: severidadDeGravedad(3) ?? '',
  4: severidadDeGravedad(4) ?? '',
}

export const ETIQUETA_ESTADO_CLASES: Record<EstadoClases, string> = {
  normal: ETIQUETA_SERVICIO.normal,
  parcial: ETIQUETA_SERVICIO.parcial,
  sin: ETIQUETA_SERVICIO.suspendido,
  evacuado: ETIQUETA_ESTABLECIMIENTO.evacuado,
  centro: ETIQUETA_ESTABLECIMIENTO.centro_evacuados,
}

export const ETIQUETA_APOYO: Record<'brinda' | 'no' | 'sin_dato', string> = {
  brinda: 'Se brinda',
  no: 'No se brinda',
  sin_dato: 'Sin dato',
}
