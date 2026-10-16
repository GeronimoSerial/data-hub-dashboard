import { referencia, versionReferencia } from '@/lib/infraestructura/datasets/memoria'
// Versioned catalogue of the Prefectura Naval Argentina (PNA) stations relevant to
// Corrientes, plus upstream context stations. Thresholds are never stored here:
// they always come from each reading. Coordinates are the publisher's declared
// positions (mapa.php), not field-verified.

import type { FilaAlturaPrefectura } from './prefectura-parser'

// v2 adds publisher-declared coordinates (unverified) from mapa.php.
export function obtenerVersionCatalogoPrefectura(): string { return versionReferencia('estaciones-prefectura') }

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
  represaAguasArriba?: boolean
}


export function obtenerEstacionesPrefectura(): readonly EstacionPrefectura[] { return referencia('estaciones-prefectura') }

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
    const porId = obtenerEstacionesPrefectura().find((e) => e.idHistorico === fila.idHistorico)
    if (porId) return porId
  }
  const clave = claveNombre(fila.puerto)
  return obtenerEstacionesPrefectura().find((e) => claveNombre(e.nombrePna) === clave) ?? null
}
