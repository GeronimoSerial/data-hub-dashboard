import {
  construirUrlSubsetImerg,
  parsearRespuestaAsciiImerg,
  type RespuestaAsciiImerg,
} from './imerg'
import { parsearHdf5Imerg } from './imerg-hdf5'

// Subset OPeNDAP ASCII: respuesta rápida y pequeña; si no contesta, se cae a HDF5.
export const TIMEOUT_SUBSET_MS = 30_000
// Descarga completa del gránulo HDF5 (varios MB): timeout más generoso.
export const TIMEOUT_HDF5_MS = 120_000

export type IndicesSubsetImerg = {
  lonIndiceInicio: number
  lonIndiceFin: number
  latIndiceInicio: number
  latIndiceFin: number
}

export type ParametrosObtencionImerg = {
  urlDatosGranulo: string
  indices: IndicesSubsetImerg
  fetchImpl: typeof fetch
  headers: Record<string, string>
  timeoutMs?: number
}

export type ResultadoObtencionImerg = {
  parseado: RespuestaAsciiImerg
  via: 'opendap' | 'hdf5'
}

// Intenta el subset OPeNDAP ASCII y, ante 5xx o falla de red/timeout, descarga el
// gránulo HDF5 por HTTPS. Un 4xx del subset (p. ej. 404 = no publicado) no hace
// fallback: se lanza `subset HTTP <status>` tal cual para que el job lo clasifique.
export async function obtenerParseadoImerg(
  params: ParametrosObtencionImerg,
): Promise<ResultadoObtencionImerg> {
  const { urlDatosGranulo, indices, fetchImpl, headers, timeoutMs = TIMEOUT_SUBSET_MS } = params

  const urlSubset = construirUrlSubsetImerg({ urlDatosGranulo, ...indices })
  let respuesta: Response | null
  try {
    respuesta = await fetchImpl(urlSubset, { headers, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    respuesta = null
  }

  if (respuesta?.ok) {
    return { parseado: parsearRespuestaAsciiImerg(await respuesta.text()), via: 'opendap' }
  }
  if (respuesta !== null && respuesta.status < 500) {
    throw new Error(`subset HTTP ${respuesta.status}`)
  }
  const estadoSubset = respuesta === null ? 'sin respuesta' : `HTTP ${respuesta.status}`

  let estadoHdf5: string
  try {
    const respuesta = await fetchImpl(urlDatosGranulo, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_HDF5_MS),
    })
    if (!respuesta.ok) {
      estadoHdf5 = `HTTP ${respuesta.status}`
    } else {
      const parseado = await parsearHdf5Imerg(await respuesta.arrayBuffer(), indices)
      return { parseado, via: 'hdf5' }
    }
  } catch {
    estadoHdf5 = 'error'
  }

  throw new Error(`subset ${estadoSubset}; hdf5 ${estadoHdf5}`)
}
