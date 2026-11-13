import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { correrJob, ejecutarJobAuditado } from './jobs.mjs'

const mocks = vi.hoisted(() => ({ enosJobsEnabled: vi.fn(() => true) }))
vi.mock('../lib/infraestructura/jobs/flags.ts', () => ({ enosJobsEnabled: mocks.enosJobsEnabled }))

usarDbTemporal('jobs-region-auditoria', { env: { REGION: undefined, INFRA_AUDIT_TRIGGER: undefined, INVOCATION_ID: undefined, DATABASE_URL: undefined } })
beforeAll(() => migrarDb())
afterEach(() => {
  mocks.enosJobsEnabled.mockReset()
  mocks.enosJobsEnabled.mockImplementation(() => true)
  delete process.env.REGION
})

const eventosDe = (nombre: string) => getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.accion, `job.${nombre}`))

describe('scripts/jobs.mjs: región en los eventos de job', () => {
  it('una corrida de Corrientes deja intención y resultado con metadatos.region corrientes', async () => {
    mocks.enosJobsEnabled.mockReturnValue(false)
    const resultado = await ejecutarJobAuditado('veredicto-cierre')

    const filas = await eventosDe('veredicto-cierre')
    expect(filas).toHaveLength(2)
    expect(filas.map(fila => fila.resultado).sort()).toEqual(['exito', 'pendiente'])
    expect(filas.map(fila => fila.metadatos.region)).toEqual(['corrientes', 'corrientes'])
    expect(resultado).toEqual(await correrJob('veredicto-cierre'))
  })

  it('una corrida de Manaos deja intención y resultado con metadatos.region manaos', async () => {
    process.env.REGION = 'manaos'
    mocks.enosJobsEnabled.mockReturnValue(false)
    const resultado = await ejecutarJobAuditado('sync-ana-niveis')

    const filas = await eventosDe('sync-ana-niveis')
    expect(filas).toHaveLength(2)
    expect(filas.map(fila => fila.resultado).sort()).toEqual(['exito', 'pendiente'])
    expect(filas.map(fila => fila.metadatos.region)).toEqual(['manaos', 'manaos'])
    expect(resultado).toEqual(await correrJob('sync-ana-niveis'))
  })
})
