import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { infraPeriodo, infraRiskRun } from '@/lib/db/schema'
import type { publicarRunOperativo as PublicarRunOperativo } from './publicar-run'

usarDbTemporal('publicar-run-')

let publicarRunOperativo: typeof PublicarRunOperativo
let periodoId: string

beforeAll(async () => {
  ;({ publicarRunOperativo } = await import('./publicar-run'))
  const [periodo] = await getDb().select().from(infraPeriodo).where(eq(infraPeriodo.estado, 'vigente')).limit(1)
  if (!periodo) throw new Error('la siembra no dejó período vigente')
  periodoId = periodo.id
})

const INSTANTE = '2026-10-17T18:00:00.000Z'

async function insertarRun(valores: Partial<typeof infraRiskRun.$inferInsert> = {}): Promise<string> {
  const id = randomUUID()
  await getDb()
    .insert(infraRiskRun)
    .values({
      id,
      periodoId,
      modeloVersion: 'motor-v0.4',
      iniciadoEn: INSTANTE,
      publicadoEn: null,
      estado: 'preparando',
      cobertura: null,
      creadaEn: INSTANTE,
      ...valores,
    })
  return id
}

async function leerRun(id: string) {
  const [fila] = await getDb().select().from(infraRiskRun).where(eq(infraRiskRun.id, id))
  return fila
}

async function idVigente(): Promise<string | undefined> {
  const filas = await getDb().select().from(infraRiskRun).where(eq(infraRiskRun.estado, 'vigente'))
  expect(filas.length).toBeLessThanOrEqual(1)
  return filas[0]?.id
}

// Error de drizzle con la causa del driver: el nombre de la restricción viaja
// en la causa, no siempre en el mensaje principal.
function textoDeError(error: unknown): string {
  const partes: string[] = []
  let actual: unknown = error
  while (actual instanceof Error) {
    partes.push(actual.message, String((actual as { constraint?: unknown }).constraint ?? ''))
    actual = (actual as { cause?: unknown }).cause
  }
  return partes.join(' | ')
}

describe('publicarRunOperativo', () => {
  it('publica un run operativo de la versión vigente y vence el anterior', async () => {
    const anterior = await insertarRun()
    expect(await publicarRunOperativo({ runId: anterior, cobertura: { procesadas: 1 } })).toEqual({ publicado: true })
    expect(await idVigente()).toBe(anterior)

    const nuevo = await insertarRun()
    expect(await publicarRunOperativo({ runId: nuevo, cobertura: { procesadas: 2 } })).toEqual({ publicado: true })
    expect(await idVigente()).toBe(nuevo)
    expect((await leerRun(anterior))?.estado).toBe('vencido')
    expect((await leerRun(nuevo))?.cobertura).toEqual({ procesadas: 2 })
    expect((await leerRun(nuevo))?.publicadoEn).not.toBeNull()
  })

  it('rechaza un candidato y deja intacto el puntero vigente', async () => {
    const vigenteAntes = await idVigente()
    const candidato = await insertarRun({ modo: 'candidato', modeloVersion: 'motor-v0.4' })

    expect(await publicarRunOperativo({ runId: candidato, cobertura: {} })).toEqual({
      publicado: false,
      motivo: 'modo_candidato',
    })
    expect(await idVigente()).toBe(vigenteAntes)
    expect((await leerRun(candidato))?.estado).toBe('preparando')
  })

  it('publica únicamente v0.4 y rechaza volver a publicar v0.3', async () => {
    const v04 = await insertarRun({ modeloVersion: 'motor-v0.4' })
    expect(await publicarRunOperativo({ runId: v04, cobertura: {} })).toEqual({ publicado: true })
    expect(await idVigente()).toBe(v04)
    const v03 = await insertarRun({ modeloVersion: 'motor-v0.3' })
    expect(await publicarRunOperativo({ runId: v03, cobertura: {} })).toEqual({ publicado: false, motivo: 'version_no_operativa' })
    expect(await idVigente()).toBe(v04)
  })

  it('rechaza un run operativo de una versión que no es operativa', async () => {
    const vigenteAntes = await idVigente()
    const otra = await insertarRun({ modeloVersion: 'motor-v0.2' })
    expect(await publicarRunOperativo({ runId: otra, cobertura: {} })).toEqual({
      publicado: false,
      motivo: 'version_no_operativa',
    })
    expect(await idVigente()).toBe(vigenteAntes)
  })

  it('rechaza un run inexistente o que no está preparando', async () => {
    const vigenteAntes = await idVigente()
    expect(await publicarRunOperativo({ runId: randomUUID(), cobertura: {} })).toEqual({
      publicado: false,
      motivo: 'run_inexistente',
    })
    const fallido = await insertarRun({ estado: 'fallido' })
    expect(await publicarRunOperativo({ runId: fallido, cobertura: {} })).toEqual({
      publicado: false,
      motivo: 'estado_no_publicable',
    })
    expect(await idVigente()).toBe(vigenteAntes)
  })
})

describe('restricción infra_risk_run_candidato_no_vigente', () => {
  it('conserva las corridas históricas v0.3 pero impide volverlas vigentes desde SQL', async () => {
    const historico = await insertarRun({ modeloVersion: 'motor-v0.3', estado: 'vencido' })
    const vigente = await insertarRun()
    await publicarRunOperativo({ runId: vigente, cobertura: {} })
    const error = await getDb().update(infraRiskRun).set({ modeloVersion: 'motor-v0.3' })
      .where(eq(infraRiskRun.id, vigente)).then(() => null, (e: unknown) => e)
    expect(textoDeError(error)).toContain('infra_risk_run_vigente_solo_v04')
    expect((await leerRun(vigente))?.modeloVersion).toBe('motor-v0.4')
    expect((await leerRun(historico))?.estado).toBe('vencido')
  })

  it('las filas existentes leen modo operativo por defecto', async () => {
    const id = await insertarRun()
    expect((await leerRun(id))?.modo).toBe('operativo')
    expect((await leerRun(id))?.metadatos).toBeNull()
  })

  it('la base rechaza insertar un candidato vigente', async () => {
    const vigenteAntes = await idVigente()
    // Se vence el vigente para que el rechazo no venga del índice único parcial.
    await getDb().update(infraRiskRun).set({ estado: 'vencido' }).where(eq(infraRiskRun.estado, 'vigente'))
    try {
      const error = await insertarRun({ modo: 'candidato', estado: 'vigente' }).then(
        () => null,
        (e: unknown) => e,
      )
      expect(textoDeError(error)).toContain('infra_risk_run_candidato_no_vigente')
    } finally {
      if (vigenteAntes) {
        await getDb().update(infraRiskRun).set({ estado: 'vigente' }).where(eq(infraRiskRun.id, vigenteAntes))
      }
    }
  })

  it('la base rechaza promover un candidato a vigente por UPDATE directo', async () => {
    const candidato = await insertarRun({ modo: 'candidato', estado: 'completado' })
    await getDb().update(infraRiskRun).set({ estado: 'vencido' }).where(eq(infraRiskRun.estado, 'vigente'))
    const error = await getDb()
      .update(infraRiskRun)
      .set({ estado: 'vigente' })
      .where(eq(infraRiskRun.id, candidato))
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(textoDeError(error)).toContain('infra_risk_run_candidato_no_vigente')
    expect((await leerRun(candidato))?.estado).toBe('completado')
  })

  it('la base rechaza un modo desconocido', async () => {
    const error = await insertarRun({ modo: 'Candidato' }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(textoDeError(error)).toContain('infra_risk_run_modo_check')
  })
})
