import type { EstadoClases, GravedadMapa } from '@/lib/infraestructura/mapa/tipos'
import { severidadDeGravedad } from './gravedad'

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

export function etiquetaDepartamento(valor: string): string {
  const etiqueta = ETIQUETAS_DEPARTAMENTO[valor]
  if (etiqueta) return etiqueta

  return valor.trim().split(/\s+/u).map((palabra, indice) => {
    const minuscula = palabra.toLocaleLowerCase('es')
    if (indice > 0 && CONECTORES_DEPARTAMENTO.has(minuscula)) return minuscula
    const primeraLetra = minuscula.charAt(0).toLocaleUpperCase('es')
    return `${primeraLetra}${minuscula.slice(1)}`
  }).join(' ')
}

export const ETIQUETA_GRAVEDAD: Record<GravedadMapa, string> = {
  0: 'Sin reporte',
  1: severidadDeGravedad(1) ?? '',
  2: severidadDeGravedad(2) ?? '',
  3: severidadDeGravedad(3) ?? '',
  4: severidadDeGravedad(4) ?? '',
}

export const ETIQUETA_CLASES: Record<EstadoClases, string> = {
  normal: 'Con clases',
  parcial: 'Clases parciales',
  sin: 'Sin clases',
  evacuado: 'Evacuado',
  centro: 'Centro de evacuados',
}

export const ETIQUETA_APOYO: Record<'brinda' | 'no' | 'sin_dato', string> = {
  brinda: 'Se brinda',
  no: 'No se brinda',
  sin_dato: 'Sin dato',
}
