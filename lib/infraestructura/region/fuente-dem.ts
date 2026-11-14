import type { FUENTES_DEM } from './esquema'
import { cargarRegion } from './registro'

export type FuenteDem = (typeof FUENTES_DEM)[number]

export const FUENTE_DEM_POR_DEFECTO: FuenteDem = 'copernicus'

// Prefix of the `fuente` column written by services/geo-static for FABDEM rows.
const PREFIJO_FUENTE_FABDEM = 'fabdem'

export function fuenteDemDe(region: { fuenteDem?: FuenteDem }): FuenteDem {
  return region.fuenteDem ?? FUENTE_DEM_POR_DEFECTO
}

export function fuenteDemDeRegionId(id: string): FuenteDem {
  return fuenteDemDe(cargarRegion(id))
}

export function esFuenteFabdem(fuente: string): boolean {
  return fuente.startsWith(PREFIJO_FUENTE_FABDEM)
}

export const LICENCIA_SALUD_FABDEM =
  'FABDEM V1-2 (Universidade de Bristol / Fathom), licença CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/), uso não comercial; ' +
  'Copernicus WorldDEM-30 © DLR e.V. 2010-2014 e © Airbus Defence and Space GmbH 2014-2018, fornecido sob COPERNICUS pela União Europeia e ESA; todos os direitos reservados; ' +
  'valores derivados e modificados (percentil 10 por escola) + JRC Global Surface Water (CC BY 4.0)'
