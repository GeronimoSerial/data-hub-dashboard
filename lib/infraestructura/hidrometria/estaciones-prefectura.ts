// Versioned catalogue of the Prefectura Naval Argentina (PNA) stations relevant to
// Corrientes, plus upstream context stations. Thresholds are never stored here:
// they always come from each reading. Coordinates are the publisher's declared
// positions (mapa.php), not field-verified.

import type { FilaAlturaPrefectura } from './prefectura-parser'

// v2 adds publisher-declared coordinates (unverified) from mapa.php.
export const CATALOGO_ESTACIONES_PREFECTURA_VERSION = 'estaciones-prefectura-v2'

export type CoordenadasDeclaradas = {
  lat: number
  lon: number
  fuente: 'pna-mapa.php'
  consultadaEl: string
  // Always false: these are the publisher's declared positions, not field-verified.
  // G-1 requires verified coordinates before any event geometry uses them.
  verificada: false
  // Smallest count of decimals published for lat and lon.
  precisionDecimales: number
}

export type EstacionPrefectura = {
  estacionId: string
  nombrePna: string
  idHistorico: number
  rio: 'parana' | 'uruguay'
  rol: 'corrientes' | 'contexto-aguas-arriba'
  coordenadas: CoordenadasDeclaradas | null
}

const MAPA_PNA = { fuente: 'pna-mapa.php', consultadaEl: '2026-10-13', verificada: false } as const

export const CATALOGO_ESTACIONES_PREFECTURA: readonly EstacionPrefectura[] = [
  // Paraná, relevant to Corrientes
  { estacionId: 'pna-ituzaingo', nombrePna: 'ITUZAINGO', idHistorico: 90, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -27.60825, lon: -56.834663, precisionDecimales: 5 } },
  { estacionId: 'pna-ita-ibate', nombrePna: 'ITA IBATE', idHistorico: 100, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -27.42225, lon: -57.333306, precisionDecimales: 5 } },
  { estacionId: 'pna-itati', nombrePna: 'ITATI', idHistorico: 110, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -27.27, lon: -58.24, precisionDecimales: 2 } },
  { estacionId: 'pna-paso-de-la-patria', nombrePna: 'PASO DE LA PATRIA', idHistorico: 120, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -27.315833, lon: -58.576944, precisionDecimales: 6 } },
  { estacionId: 'pna-corrientes', nombrePna: 'CORRIENTES', idHistorico: 130, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -27.46, lon: -58.84, precisionDecimales: 2 } },
  { estacionId: 'pna-empedrado', nombrePna: 'EMPEDRADO', idHistorico: 150, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -27.958948, lon: -58.820198, precisionDecimales: 6 } },
  { estacionId: 'pna-bella-vista', nombrePna: 'BELLA VISTA', idHistorico: 160, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -28.505997, lon: -59.050133, precisionDecimales: 6 } },
  { estacionId: 'pna-goya', nombrePna: 'GOYA', idHistorico: 170, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -29.14, lon: -59.27, precisionDecimales: 2 } },
  { estacionId: 'pna-esquina', nombrePna: 'ESQUINA', idHistorico: 190, rio: 'parana', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -30.016222, lon: -59.536583, precisionDecimales: 6 } },
  // Uruguay, relevant to Corrientes
  { estacionId: 'pna-garruchos', nombrePna: 'GARRUCHOS', idHistorico: 560, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -28.177688, lon: -55.641362, precisionDecimales: 6 } },
  { estacionId: 'pna-santo-tome', nombrePna: 'SANTO TOME', idHistorico: 570, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -28.545389, lon: -56.028472, precisionDecimales: 6 } },
  { estacionId: 'pna-alvear', nombrePna: 'ALVEAR', idHistorico: 580, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -29.11339, lon: -56.55634, precisionDecimales: 5 } },
  { estacionId: 'pna-la-cruz', nombrePna: 'LA CRUZ', idHistorico: 590, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -29.17933752, lon: -56.63205059, precisionDecimales: 8 } },
  { estacionId: 'pna-yapeyu', nombrePna: 'YAPEYU', idHistorico: 600, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -29.470186, lon: -56.810651, precisionDecimales: 6 } },
  { estacionId: 'pna-paso-de-los-libres', nombrePna: 'PASO DE LOS LIBRES', idHistorico: 610, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -29.721111, lon: -57.082222, precisionDecimales: 6 } },
  { estacionId: 'pna-bompland', nombrePna: 'BOMPLAND', idHistorico: 620, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -29.979167, lon: -57.337222, precisionDecimales: 6 } },
  { estacionId: 'pna-monte-caseros', nombrePna: 'MONTE CASEROS', idHistorico: 630, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -30.251627, lon: -57.621348, precisionDecimales: 6 } },
  { estacionId: 'pna-mocoreta', nombrePna: 'MOCORETA', idHistorico: 640, rio: 'uruguay', rol: 'corrientes', coordenadas: { ...MAPA_PNA, lat: -30.690372, lon: -57.820794, precisionDecimales: 6 } },
  // Upstream context, Paraná
  { estacionId: 'pna-iguazu', nombrePna: 'IGUAZU', idHistorico: 20, rio: 'parana', rol: 'contexto-aguas-arriba', coordenadas: { ...MAPA_PNA, lat: -25.593194, lon: -54.580083, precisionDecimales: 6 } },
  { estacionId: 'pna-libertador', nombrePna: 'LIBERTADOR', idHistorico: 50, rio: 'parana', rol: 'contexto-aguas-arriba', coordenadas: { ...MAPA_PNA, lat: -26.791528, lon: -55.024889, precisionDecimales: 6 } },
  { estacionId: 'pna-posadas', nombrePna: 'POSADAS', idHistorico: 80, rio: 'parana', rol: 'contexto-aguas-arriba', coordenadas: { ...MAPA_PNA, lat: -27.353611, lon: -55.913806, precisionDecimales: 6 } },
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
