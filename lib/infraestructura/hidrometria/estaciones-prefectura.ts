// Versioned catalogue of the Prefectura Naval Argentina (PNA) stations relevant to
// Corrientes, plus upstream context stations. Static data: no coordinates and no
// thresholds. Thresholds always come from each reading.

import type { FilaAlturaPrefectura } from './prefectura-parser'

export const CATALOGO_ESTACIONES_PREFECTURA_VERSION = 'estaciones-prefectura-v1'

export type EstacionPrefectura = {
  estacionId: string
  nombrePna: string
  idHistorico: number
  rio: 'parana' | 'uruguay'
  rol: 'corrientes' | 'contexto-aguas-arriba'
}

export const CATALOGO_ESTACIONES_PREFECTURA: readonly EstacionPrefectura[] = [
  // Paraná, relevant to Corrientes
  { estacionId: 'pna-ituzaingo', nombrePna: 'ITUZAINGO', idHistorico: 90, rio: 'parana', rol: 'corrientes' },
  { estacionId: 'pna-ita-ibate', nombrePna: 'ITA IBATE', idHistorico: 100, rio: 'parana', rol: 'corrientes' },
  { estacionId: 'pna-itati', nombrePna: 'ITATI', idHistorico: 110, rio: 'parana', rol: 'corrientes' },
  { estacionId: 'pna-paso-de-la-patria', nombrePna: 'PASO DE LA PATRIA', idHistorico: 120, rio: 'parana', rol: 'corrientes' },
  { estacionId: 'pna-corrientes', nombrePna: 'CORRIENTES', idHistorico: 130, rio: 'parana', rol: 'corrientes' },
  { estacionId: 'pna-empedrado', nombrePna: 'EMPEDRADO', idHistorico: 150, rio: 'parana', rol: 'corrientes' },
  { estacionId: 'pna-bella-vista', nombrePna: 'BELLA VISTA', idHistorico: 160, rio: 'parana', rol: 'corrientes' },
  { estacionId: 'pna-goya', nombrePna: 'GOYA', idHistorico: 170, rio: 'parana', rol: 'corrientes' },
  { estacionId: 'pna-esquina', nombrePna: 'ESQUINA', idHistorico: 190, rio: 'parana', rol: 'corrientes' },
  // Uruguay, relevant to Corrientes
  { estacionId: 'pna-garruchos', nombrePna: 'GARRUCHOS', idHistorico: 560, rio: 'uruguay', rol: 'corrientes' },
  { estacionId: 'pna-santo-tome', nombrePna: 'SANTO TOME', idHistorico: 570, rio: 'uruguay', rol: 'corrientes' },
  { estacionId: 'pna-alvear', nombrePna: 'ALVEAR', idHistorico: 580, rio: 'uruguay', rol: 'corrientes' },
  { estacionId: 'pna-la-cruz', nombrePna: 'LA CRUZ', idHistorico: 590, rio: 'uruguay', rol: 'corrientes' },
  { estacionId: 'pna-yapeyu', nombrePna: 'YAPEYU', idHistorico: 600, rio: 'uruguay', rol: 'corrientes' },
  { estacionId: 'pna-paso-de-los-libres', nombrePna: 'PASO DE LOS LIBRES', idHistorico: 610, rio: 'uruguay', rol: 'corrientes' },
  { estacionId: 'pna-bompland', nombrePna: 'BOMPLAND', idHistorico: 620, rio: 'uruguay', rol: 'corrientes' },
  { estacionId: 'pna-monte-caseros', nombrePna: 'MONTE CASEROS', idHistorico: 630, rio: 'uruguay', rol: 'corrientes' },
  { estacionId: 'pna-mocoreta', nombrePna: 'MOCORETA', idHistorico: 640, rio: 'uruguay', rol: 'corrientes' },
  // Upstream context, Paraná
  { estacionId: 'pna-iguazu', nombrePna: 'IGUAZU', idHistorico: 20, rio: 'parana', rol: 'contexto-aguas-arriba' },
  { estacionId: 'pna-libertador', nombrePna: 'LIBERTADOR', idHistorico: 50, rio: 'parana', rol: 'contexto-aguas-arriba' },
  { estacionId: 'pna-posadas', nombrePna: 'POSADAS', idHistorico: 80, rio: 'parana', rol: 'contexto-aguas-arriba' },
]

// Accent-, case- and whitespace-insensitive key for name matching.
function claveNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Maps a parsed Prefectura row to its catalogue entry. Matches by idHistorico first,
 * then by normalized name. Returns null for stations outside the catalogue; the sync
 * job ignores those rows.
 */
export function buscarEstacionPrefectura(
  fila: Pick<FilaAlturaPrefectura, 'puerto' | 'idHistorico'>,
): EstacionPrefectura | null {
  if (fila.idHistorico !== null) {
    const porId = CATALOGO_ESTACIONES_PREFECTURA.find((e) => e.idHistorico === fila.idHistorico)
    if (porId) return porId
  }
  const clave = claveNombre(fila.puerto)
  return CATALOGO_ESTACIONES_PREFECTURA.find((e) => claveNombre(e.nombrePna) === clave) ?? null
}
