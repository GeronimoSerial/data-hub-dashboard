import { randomUUID } from 'node:crypto'
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, infraMotivo } from '@/lib/db/schema'
import { actorAuditoria, describirAuditoria } from './contexto'
import { cambioAuditado, conAuditoria, jobAuditado, metadatosPermitidos } from './servidor'
import { consultarAuditoria } from './consulta'

beforeAll(() => migrarDb())
afterEach(async () => {
  await getDb().execute(sql`DROP TRIGGER IF EXISTS test_fallo_auditoria ON auditoria_evento`)
  vi.restoreAllMocks()
})

async function fallarAuditoria() {
  await getDb().execute(sql`CREATE OR REPLACE FUNCTION test_fallo_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo simulado'; END $$`)
  await getDb().execute(sql`CREATE TRIGGER test_fallo_auditoria BEFORE INSERT ON auditoria_evento FOR EACH ROW EXECUTE FUNCTION test_fallo_auditoria()`)
}
const request = () => new Request('https://example.test/api/infraestructura/motivos?token=secreto', { method: 'POST', headers: { 'X-Request-Id': 'id-del-cliente' } })

function guardarMotivo(id: string) {
  return conAuditoria('motivo.guardar', '/api/infraestructura/motivos', async (_request: Request) => {
    actorAuditoria({ actorTipo: 'usuario', actorId: 'admin-auditoria', actorRol: 'admin', viaAcceso: 'sesion' })
    return cambioAuditado(async tx => {
      await tx.insert(infraMotivo).values({ id, nombre: id, categoria: 'establecimiento', orden: 0 })
      describirAuditoria({ objetoTipo: 'motivo', objetoId: id, metadatos: { campos: ['nombre'], token: 'secreto', password: 'secreto', nombreAlumno: 'Nombre' } })
      return Response.json({ ok: true }, { status: 201 })
    }, response => ({ status: response.status }))
  })
}

describe('auditoría durable', () => {
  it('confirma dato y un solo evento con identidad y correlación del servidor', async () => {
    const id = randomUUID()
    const response = await guardarMotivo(id)(request())
    expect(response.status).toBe(201)
    const [evento] = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.objetoId, id))
    expect(evento).toMatchObject({ actorTipo: 'usuario', actorId: 'admin-auditoria', actorRol: 'admin', resultado: 'exito', httpStatus: 201, rutaPlantilla: '/api/infraestructura/motivos', metadatos: { campos: ['nombre'] } })
    expect(response.headers.get('X-Request-Id')).toBe(evento.requestId)
    expect(evento.requestId).not.toBe('id-del-cliente')
    expect(JSON.stringify(evento)).not.toContain('secreto')
    expect(await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, evento.requestId))).toHaveLength(1)
    await getDb().delete(infraMotivo).where(eq(infraMotivo.id, id))
    expect(await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.id, evento.id))).toHaveLength(1)
  })

  it('revierte el cambio si falla la inserción de auditoría, aunque el handler capture el error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await fallarAuditoria()
    const id = randomUUID()
    const response = await guardarMotivo(id)(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await getDb().select().from(infraMotivo).where(eq(infraMotivo.id, id))).toHaveLength(0)
  })

  it('bloquea cookies, firmas y lecturas cuando no puede registrar la respuesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await fallarAuditoria()
    const handler = conAuditoria('foto.autorizar_carga', '/api/problematicas/parte/adjuntos/autorizaciones', async () => Response.json({ url: 'https://obs.test/?signature=secreto' }, { headers: { 'Set-Cookie': 'sesion=secreto' } }))
    const response = await handler()
    expect(response.status).toBe(503)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(await response.text()).not.toContain('secreto')
  })

  it.each([400, 401, 403, 409, 429, 500])('registra retornos tempranos HTTP %s', async status => {
    const accion = `test.${status}.${randomUUID()}`
    const response = await conAuditoria(accion, '/api/prueba', async () => new Response(null, { status }))()
    expect(response.status).toBe(status)
    const [evento] = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.accion, accion))
    expect(evento.httpStatus).toBe(status)
    expect(evento.actorTipo).toBe('anonimo')
  })

  it('aísla el actor entre solicitudes concurrentes y registra excepciones sin su mensaje', async () => {
    const handler = conAuditoria('test.concurrente', '/api/prueba', async (id: string) => {
      actorAuditoria({ actorTipo: 'enlace', actorId: id, actorRol: null, viaAcceso: 'token_verificacion' })
      await Promise.resolve()
      if (id === 'excepcion') throw new Error('password=secreto')
      return new Response(null, { status: 204 })
    })
    await Promise.all(['uno', 'dos', 'excepcion'].map(id => handler(id)))
    const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.accion, 'test.concurrente'))
    expect(filas.map(f => f.actorId).sort()).toEqual(['dos', 'excepcion', 'uno'])
    expect(filas.find(f => f.actorId === 'excepcion')?.resultado).toBe('error')
    expect(JSON.stringify(filas)).not.toContain('secreto')
  })

  it('pagina por fecha e ID sin repetir filas que comparten la hora', async () => {
    const accion = `test.pagina.${randomUUID()}`
    const ocurridoEn = new Date('2026-10-19T12:00:00Z')
    await getDb().insert(auditoriaEvento).values(Array.from({ length: 5 }, () => ({
      id: randomUUID(), requestId: randomUUID(), ocurridoEn, actorTipo: 'anonimo', viaAcceso: 'prueba',
      accion, metodo: 'POST', rutaPlantilla: '/api/prueba', resultado: 'exito', httpStatus: 200, duracionMs: 1,
    })))
    const ids: string[] = []
    let cursor: string | undefined
    do {
      const page = await consultarAuditoria({ accion, limite: 2, cursor })
      ids.push(...page.items.map(item => item.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(new Set(ids).size).toBe(5)
    expect(ids.length).toBe(5)
  })

  it('limita los metadatos y descarta URLs, cuerpos y campos desconocidos', () => {
    expect(metadatosPermitidos({ movimientoId: 'mov-1', url: 'secreto', revision: 3, formato: 'https://obs.test/?token=secret', campos: ['estado'], token: 'secret' }))
      .toEqual({ movimientoId: 'mov-1', revision: 3, campos: ['estado'] })
    expect(Buffer.byteLength(JSON.stringify(metadatosPermitidos({ campos: Array(1000).fill('x') })))).toBeLessThanOrEqual(4096)
  })

  it('guarda intención y resultado correlacionados antes y después de un job', async () => {
    const nombre = `prueba-${randomUUID()}`
    await jobAuditado(nombre, async () => ({ jobRunId: 'run-prueba' }), () => true)
    const eventos = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.objetoId, nombre))
    expect(eventos).toHaveLength(2)
    expect(new Set(eventos.map(e => e.requestId)).size).toBe(1)
    expect(eventos.map(e => e.resultado).sort()).toEqual(['exito', 'pendiente'])
    expect(eventos.find(e => e.resultado === 'exito')?.metadatos.jobRunId).toBe('run-prueba')
  })

  it('no despacha un job cuando no puede persistir su intención', async () => {
    await fallarAuditoria()
    const ejecutar = vi.fn()
    await expect(jobAuditado('prueba', ejecutar, () => true)).rejects.toThrow('auditoria_no_disponible')
    expect(ejecutar).not.toHaveBeenCalled()
  })
})
