import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb } from './ge-db'
import { asegurarGeAdjuntada } from './impacto'
import { listarSeccionesDelCue } from './secciones-cue'

const CUE = '1801605-11'
const OTRO_CUE = '1801605-12'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'secciones-cue-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 1, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 2, '${CUE}', '2', 'B', 'PRIMARIA', 'TARDE')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 3, '${OTRO_CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
  } finally {
    ge.close()
  }
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

function openHub(): Client {
  return createClient({ url: `file:${path.join(dir, 'hub-test.sqlite')}` })
}

describe('listarSeccionesDelCue', () => {
  it('devuelve las secciones del CUE indicado, con su turno', async () => {
    const hub = openHub()
    try {
      await asegurarGeAdjuntada(hub)
      const secciones = await listarSeccionesDelCue(hub, 1, CUE)
      expect(secciones).toEqual(
        expect.arrayContaining([
          { geSectionId: 1, turno: 'MAÑANA' },
          { geSectionId: 2, turno: 'TARDE' },
        ]),
      )
      expect(secciones).toHaveLength(2)
    } finally {
      hub.close()
    }
  })

  it('no devuelve secciones de otro CUE', async () => {
    const hub = openHub()
    try {
      await asegurarGeAdjuntada(hub)
      const secciones = await listarSeccionesDelCue(hub, 1, CUE)
      expect(secciones.some((s) => s.geSectionId === 3)).toBe(false)
    } finally {
      hub.close()
    }
  })
})
