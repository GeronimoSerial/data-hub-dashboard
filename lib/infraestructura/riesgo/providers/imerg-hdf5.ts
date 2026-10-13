import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FS, File, ready } from 'h5wasm/node'
import {
  calcularIndicesGrillaImerg,
  IMERG_LAT_MAX,
  IMERG_LAT_MIN,
  IMERG_LON_MAX,
  IMERG_LON_MIN,
  type RespuestaAsciiImerg,
} from './imerg'

// ---------------------------------------------------------------------------
// Lectura HDF5 de gránulos IMERG (alternativa al OPeNDAP ASCII)
// ---------------------------------------------------------------------------
//
// Produce la misma forma que `parsearRespuestaAsciiImerg`, así `mapearAsciiImergACeldas`
// se reutiliza sin cambios. h5wasm es un lector HDF5 en WebAssembly puro (sin build
// nativo), pensado para descargas HTTPS directas cuando OPeNDAP responde 503.
//
// Las dimensiones de `precipitation` y `precipitationQualityIndex` son [tiempo, lon, lat],
// igual que el subset OPeNDAP. Los valores negativos o NaN de relleno no se filtran acá:
// el parser ASCII y el mapper tampoco los filtran, así que ambos caminos se comportan igual.

type IndicesGrilla = ReturnType<typeof calcularIndicesGrillaImerg>

function aArrayNumerico(datos: unknown): number[] {
  return Array.from(datos as ArrayLike<number>)
}

// Devuelve filas por índice relativo de lon, con valores por lat (mismo orden que el ASCII).
// Redondeo igual al texto ASCII de OPeNDAP (tasa 5 decimales, calidad 3), para
// que ambos caminos guarden exactamente los mismos valores.
const redondear = (valor: number, decimales: number): number =>
  Math.round(valor * 10 ** decimales) / 10 ** decimales

function filasDesdeSlice(
  valores: number[],
  cantidadLon: number,
  cantidadLat: number,
  decimales: number,
): Array<{ lonIndiceRelativo: number; valoresPorLat: number[] }> {
  const filas: Array<{ lonIndiceRelativo: number; valoresPorLat: number[] }> = []
  for (let lonIndiceRelativo = 0; lonIndiceRelativo < cantidadLon; lonIndiceRelativo++) {
    const inicio = lonIndiceRelativo * cantidadLat
    filas.push({
      lonIndiceRelativo,
      valoresPorLat: valores.slice(inicio, inicio + cantidadLat).map((v) => redondear(v, decimales)),
    })
  }
  return filas
}

export async function parsearHdf5Imerg(
  buffer: ArrayBuffer | Uint8Array,
  indices: IndicesGrilla = calcularIndicesGrillaImerg(
    IMERG_LAT_MIN,
    IMERG_LAT_MAX,
    IMERG_LON_MIN,
    IMERG_LON_MAX,
  ),
): Promise<RespuestaAsciiImerg> {
  await ready
  const fs = FS as NonNullable<typeof FS>

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  // h5wasm en Node opera sobre el sistema de archivos real: el granulo va a un directorio temporal propio.
  const directorio = mkdtempSync(join(tmpdir(), 'imerg-hdf5-'))
  const ruta = join(directorio, 'granulo.h5')

  let archivo: File | null = null
  try {
    fs.writeFile(ruta, bytes)
    archivo = new File(ruta, 'r')
    const grid = archivo.get('Grid')
    if (grid === null || grid === undefined || !('get' in grid)) {
      throw new Error('Gránulo HDF5 IMERG inválido: falta el grupo "Grid"')
    }

    const lonSlice: [number, number] = [indices.lonIndiceInicio, indices.lonIndiceFin + 1]
    const latSlice: [number, number] = [indices.latIndiceInicio, indices.latIndiceFin + 1]
    const cantidadLon = lonSlice[1] - lonSlice[0]
    const cantidadLat = latSlice[1] - latSlice[0]

    const latDataset = grid.get('lat') as unknown as { slice: (r: number[][]) => unknown }
    const lonDataset = grid.get('lon') as unknown as { slice: (r: number[][]) => unknown }
    const precipDataset = grid.get('precipitation') as unknown as { slice: (r: number[][]) => unknown }
    const calidadDataset = grid.get('precipitationQualityIndex') as unknown as {
      slice: (r: number[][]) => unknown
    }

    const lat = aArrayNumerico(latDataset.slice([[latSlice[0], latSlice[1]]]))
    const lon = aArrayNumerico(lonDataset.slice([[lonSlice[0], lonSlice[1]]]))
    const precipitacion = aArrayNumerico(
      precipDataset.slice([[0, 1], [lonSlice[0], lonSlice[1]], [latSlice[0], latSlice[1]]]),
    )
    const calidad = aArrayNumerico(
      calidadDataset.slice([[0, 1], [lonSlice[0], lonSlice[1]], [latSlice[0], latSlice[1]]]),
    )

    return {
      lat,
      lon,
      filas: filasDesdeSlice(precipitacion, cantidadLon, cantidadLat, 5),
      filasCalidad: filasDesdeSlice(calidad, cantidadLon, cantidadLat, 3),
    }
  } finally {
    archivo?.close()
    rmSync(directorio, { recursive: true, force: true })
  }
}
