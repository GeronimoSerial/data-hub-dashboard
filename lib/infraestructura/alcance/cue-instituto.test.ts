import { beforeAll, describe, expect, it } from 'vitest'
import { getRawClient, migrarDb } from '@/lib/db'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { crearEjecutorSql, ensureGeSchema } from '../ge-db'
import { alcanceParaCue, cuesDeInstitutoVigentes, esCueInstituto } from './index'

// La decisión de instituto es una sola regla: tener carreras en el corte de
// matrícula vigente, sin mirar el nivel jurisdiccional. La usan el adaptador por
// CUE (alcanceParaCue) y el lote (cuesDeInstitutoVigentes); deben dar lo mismo.

usarDbTemporal('alcance-cue-instituto', { seed: false, env: { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } })

const SUP_CON_CARRERAS = '1801800-1'
const SUP_SIN_CARRERAS = '1801800-2'
const SEC_CON_CARRERAS = '1801800-3'
const SIN_NIVEL = '1801800-4'

beforeAll(async () => {
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(`INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES
    (4, 'Dirección de Nivel Superior'), (1, 'Dirección de Nivel Secundario')`)
  await client.execute(`INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES
    ('${SUP_CON_CARRERAS}', 4, 2026), ('${SUP_SIN_CARRERAS}', 4, 2026), ('${SEC_CON_CARRERAS}', 1, 2026)`)
  await client.execute(`INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE
    VALUES (1, 2026, '2026-01-01T00:00:00Z', 'vigente')`)
  await client.execute(`INSERT INTO matricula_corte (id, fuente, ciclo_lectivo, estado, creado_en)
    VALUES (1, 'test-alcance', 2026, 'vigente', '2026-10-01')`)
  for (const cue of [SUP_CON_CARRERAS, SEC_CON_CARRERAS]) {
    await client.execute({
      sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector)
            VALUES (1, ?, 'Instituto', 'Carrera', 'RM', 'Tecnicatura', 'ABIERTA', 'estatal')`,
      args: [cue],
    })
  }
})

describe('regla única de instituto', () => {
  it('esCueInstituto exige al menos una carrera vigente', () => {
    expect(esCueInstituto(1)).toBe(true)
    expect(esCueInstituto(3)).toBe(true)
    expect(esCueInstituto(0)).toBe(false)
  })

  it('adaptador por CUE y lote coinciden en CUEs mixtos', async () => {
    const client = crearEjecutorSql(getRawClient())
    const cues = [SUP_CON_CARRERAS, SUP_SIN_CARRERAS, SEC_CON_CARRERAS, SIN_NIVEL]
    const lote = await cuesDeInstitutoVigentes(client, cues)
    for (const cue of cues) {
      const porCue = await alcanceParaCue(client, 1, cue)
      expect(porCue.sistema === 'matricula', cue).toBe(lote.cues.has(cue))
    }
    // Instituto = CUE con carreras vigentes, sea Superior o no. Superior sin carreras es GE.
    expect([...lote.cues].sort()).toEqual([SUP_CON_CARRERAS, SEC_CON_CARRERAS].sort())
  })

  it('nivel Superior sin corte de matrícula vigente queda en GE en ambos caminos', async () => {
    const client = crearEjecutorSql(getRawClient())
    await client.execute("UPDATE matricula_corte SET estado = 'reemplazado' WHERE id = 1")
    try {
      const lote = await cuesDeInstitutoVigentes(client, [SUP_CON_CARRERAS])
      expect(lote.cues.size).toBe(0)
      expect((await alcanceParaCue(client, 1, SUP_CON_CARRERAS)).sistema).toBe('ge')
    } finally {
      await client.execute("UPDATE matricula_corte SET estado = 'vigente' WHERE id = 1")
    }
  })
})
