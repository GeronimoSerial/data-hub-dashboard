import { gunzipSync } from 'node:zlib'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { archivarRuns } from './archivo'

let raiz = ''

beforeEach(() => {
  raiz = mkdtempSync(path.join(tmpdir(), 'radar-archivo-'))
})

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true })
})

function fila(id: string, fetchedAt: string) {
  return { id, fetchedAt, payload: { id } }
}

describe('archivarRuns', () => {
  it('escribe NDJSON comprimido con nombre por rango y crea el directorio recursivamente', async () => {
    const dir = path.join(raiz, 'a', 'b')
    const ruta = await archivarRuns(dir, [fila('r2', '2026-08-02T00:00:00.000Z'), fila('r1', '2026-08-01T00:00:00.000Z')])
    expect(path.basename(ruta)).toBe('radar_meteo_run_2026-08-01T00:00:00.000Z_2026-08-02T00:00:00.000Z.ndjson.gz')
    const lineas = gunzipSync(readFileSync(ruta)).toString('utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lineas.map((f: { id: string }) => f.id)).toEqual(['r1', 'r2'])
    expect(lineas[0]).toEqual(fila('r1', '2026-08-01T00:00:00.000Z'))
  })

  it('no deja archivos temporales tras escribir', async () => {
    await archivarRuns(raiz, [fila('r1', '2026-08-01T00:00:00.000Z')])
    expect(readdirSync(raiz).filter((n) => !n.endsWith('.ndjson.gz'))).toEqual([])
  })

  it('rechaza cuando la ruta del directorio es un archivo', async () => {
    const bloqueo = path.join(raiz, 'no-es-dir')
    writeFileSync(bloqueo, 'x')
    await expect(archivarRuns(bloqueo, [fila('r1', '2026-08-01T00:00:00.000Z')])).rejects.toThrow()
  })
})
