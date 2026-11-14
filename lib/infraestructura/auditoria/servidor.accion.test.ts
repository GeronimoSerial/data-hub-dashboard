import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { AccionAuditoria } from './catalogo'
import { describirAuditoria } from './contexto'
import { conAuditoria } from './servidor'

usarDbTemporal('servidor-accion-auditoria-')

const handler = (accion: string) => async (_request: Request) => {
  describirAuditoria({ accion: accion as AccionAuditoria })
  return Response.json({ ok: true })
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('describirAuditoria refina la acción por solicitud', () => {
  it('una acción del catálogo reemplaza la declarada por la ruta', async () => {
    const ruta = conAuditoria('session.login_fallo', '/api/prueba-accion', handler('session.logout_exito'))

    const res = await ruta(new Request('http://localhost/api/prueba-accion', { method: 'POST' }))

    expect((await eventoDe(res)).accion).toBe('session.logout_exito')
  })

  it('una acción fuera del catálogo se ignora y queda la declarada', async () => {
    const ruta = conAuditoria('session.login_fallo', '/api/prueba-accion', handler('accion.inventada'))

    const res = await ruta(new Request('http://localhost/api/prueba-accion', { method: 'POST' }))

    expect((await eventoDe(res)).accion).toBe('session.login_fallo')
  })
})
