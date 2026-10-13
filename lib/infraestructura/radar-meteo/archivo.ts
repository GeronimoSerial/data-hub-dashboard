import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

type FilaArchivable = { id: string; fetchedAt: string }

// Escribe las filas como NDJSON comprimido en `<dir>/radar_meteo_run_<primera>_<ultima>.ndjson.gz`.
// Escribe a un temporal y lo renombra sólo tras flush completo: ante error no queda un archivo parcial.
// Lanza si no puede escribir; quien llama decide no purgar.
export async function archivarRuns<T extends FilaArchivable>(dir: string, filas: T[]): Promise<string> {
  const ordenadas = [...filas].sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt))
  const primera = ordenadas[0]?.fetchedAt
  const ultima = ordenadas.at(-1)?.fetchedAt
  if (!primera || !ultima) throw new Error('sin filas que archivar')
  await mkdir(dir, { recursive: true })
  const destino = path.join(dir, `radar_meteo_run_${primera}_${ultima}.ndjson.gz`)
  const temporal = `${destino}.tmp`
  try {
    await pipeline(
      Readable.from((function* () { for (const fila of ordenadas) yield `${JSON.stringify(fila)}\n` })()),
      createGzip(),
      createWriteStream(temporal),
    )
    await rename(temporal, destino)
  } catch (error) {
    await rm(temporal, { force: true }).catch(() => {})
    throw error
  }
  return destino
}
