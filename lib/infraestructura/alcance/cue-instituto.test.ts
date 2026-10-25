import { beforeAll, describe, expect, it } from 'vitest'
import { getRawClient, migrarDb } from '@/lib/db'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { crearEjecutorSql, ensureGeSchema } from '../ge-db'
import { alcanceParaCue, cuesDeInstitutoVigentes, esCueInstituto } from './index'

// La decisión de instituto es una sola regla: la usan el adaptador por CUE
// (alcanceParaCue) y el lote (cuesDeInstitutoVigentes). Estos casos mixtos
// deben dar lo mismo en ambos caminos.

usarDbTemporal('alcance-cue-instituto', { seed: false, env: { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } })

const SUP_CON_CORTE = '1801800-1'
const SUP_SIN_CARRERAS = '1801800-2'
const SEC_CON_CORTE = '1801800-3'
const SIN_NIVEL = '1801800-4'

beforeAll(async () => {
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(`INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES
    (4, 'Dirección de Nivel Superior'), (1, 'Dirección de Nivel Secundario')`)
  await client.execute(`INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES
    ('${SUP_CON_CORTE}', 4, 2026), ('${SUP_SIN_CARRERAS}', 4, 2026), ('${SEC_CON_CORTE}', 1, 2026)`)
  await client.execute(`INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE
    VALUES (1, 2026, '2026-01-01T00:00:00Z', 'vigente')`)
  // Corte de matrícula vigente con carreras para todos (el sistema decide por nivel).
  await client.execute(`INSERT INTO matricula_corte (id, fuente, ciclo_lectivo, estado, creado_en)
    VALUES (1, 'test-alcance', 2026, 'vigente', '2026-10-01')`)
  for (const cue of [SUP_CON_CORTE, SEC_CON_CORTE]) {
    await client.execute({
      sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector)
            VALUES (1, ?, 'Instituto', 'Carrera', 'RM', 'Tecnicatura', 'ABIERTA', 'estatal')`,
      args: [cue],
    })
  }
})

describe('regla única de instituto', () => {
  it('esCueInstituto exige nivel Superior y corte de matrícula vigente', () => {
    expect(esCueInstituto('Dirección de Nivel Superior', 1)).toBe(true)
    expect(esCueInstituto('Dirección de Nivel Superior', null)).toBe(false)
    expect(esCueInstituto('Dirección de Nivel Secundario', 1)).toBe(false)
    expect(esCueInstituto(null, 1)).toBe(false)
  })

  it('adaptador por CUE y lote coinciden en CUEs mixtos', async () => {
    const client = crearEjecutorSql(getRawClient())
    const cues = [SUP_CON_CORTE, SUP_SIN_CARRERAS, SEC_CON_CORTE, SIN_NIVEL]
    const lote = await cuesDeInstitutoVigentes(client, cues)
    for (const cue of cues) {
      const porCue = await alcanceParaCue(client, 1, cue)
      expect(porCue.sistema === 'matricula', cue).toBe(lote.cues.has(cue))
    }
    // Superior con corte vigente es instituto, tenga o no carreras; el resto es GE.
    expect([...lote.cues].sort()).toEqual([SUP_CON_CORTE, SUP_SIN_CARRERAS].sort())
  })

  it('nivel Superior sin corte de matrícula vigente queda en GE en ambos caminos', async () => {
    const client = crearEjecutorSql(getRawClient())
    await client.execute("UPDATE matricula_corte SET estado = 'reemplazado' WHERE id = 1")
    try {
      const lote = await cuesDeInstitutoVigentes(client, [SUP_CON_CORTE])
      expect(lote.cues.size).toBe(0)
      expect((await alcanceParaCue(client, 1, SUP_CON_CORTE)).sistema).toBe('ge')
    } finally {
      await client.execute("UPDATE matricula_corte SET estado = 'vigente' WHERE id = 1")
    }
  })
})
