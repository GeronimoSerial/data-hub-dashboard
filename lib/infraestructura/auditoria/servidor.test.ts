import { randomUUID } from 'node:crypto'
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type * as DbModulo from '@/lib/db'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, infraMotivo } from '@/lib/db/schema'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { actorAuditoria, describirAuditoria } from './contexto'
import { cambioAuditado, conAuditoria, jobAuditado, metadatosPermitidos } from './servidor'

// Spy sobre migrarDb: la envoltura de rutas no debe migrar en cada solicitud.
vi.mock('@/lib/db', async importOriginal => {
  const real = await importOriginal<typeof DbModulo>()
  return { ...real, migrarDb: vi.fn(real.migrarDb) }
})

beforeAll(() => migrarDb())
afterEach(() => vi.restoreAllMocks())

const RUTA = '/api/infraestructura/motivos'
const solicitud = () => new Request('https://example.test/api/infraestructura/motivos?token=secreto', { method: 'POST', headers: { 'X-Request-Id': 'id-del-cliente' } })
const filasDe = (requestId: string) => getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId))
const filasPorObjeto = (objetoId: string) => getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.objetoId, objetoId))

function filaEvento() {
  return {
    id: randomUUID(), requestId: randomUUID(), ocurridoEn: new Date(), actorTipo: 'anonimo', viaAcceso: 'prueba',
    accion: 'verificacion.responder', metodo: 'POST', rutaPlantilla: RUTA, resultado: 'exito', httpStatus: 200, duracionMs: 1,
  }
}

function guardarMotivo(id: string) {
  return conAuditoria('motivo.guardar', RUTA, async (_request: Request) => {
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
    const response = await guardarMotivo(id)(solicitud())
    expect(response.status).toBe(201)
    const [evento] = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.objetoId, id))
    expect(evento).toMatchObject({ actorTipo: 'usuario', actorId: 'admin-auditoria', actorRol: 'admin', resultado: 'exito', httpStatus: 201, rutaPlantilla: RUTA, metadatos: { campos: ['nombre'] } })
    expect(response.headers.get('X-Request-Id')).toBe(evento.requestId)
    expect(evento.requestId).not.toBe('id-del-cliente')
    expect(JSON.stringify(evento)).not.toContain('secreto')
    expect(await filasDe(evento.requestId)).toHaveLength(1)
    await getDb().delete(infraMotivo).where(eq(infraMotivo.id, id))
    expect(await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.id, evento.id))).toHaveLength(1)
  })

  it('revierte el cambio si falla la inserción de auditoría, aunque el handler capture el error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const id = randomUUID()
    const handler = conAuditoria('motivo.guardar', RUTA, async (request: Request) => {
      try {
        return await guardarMotivo(id)(request)
      } catch {
        return Response.json({ error: 'capturado' }, { status: 500 })
      }
    })
    const response = await conFalloAuditoria(() => handler(solicitud()))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await getDb().select().from(infraMotivo).where(eq(infraMotivo.id, id))).toHaveLength(0)
  })

  it('bloquea cookies, firmas y lecturas cuando no puede registrar la respuesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handler = conAuditoria('foto.autorizar_carga', '/api/problematicas/parte/adjuntos/autorizaciones', async (_request: Request) =>
      Response.json({ url: 'https://obs.test/?signature=secreto' }, { headers: { 'Set-Cookie': 'sesion=secreto' } }))
    const response = await conFalloAuditoria(() => handler(solicitud()))
    expect(response.status).toBe(503)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ code: 'auditoria_no_disponible', error: 'No se pudo registrar la operación. Reintentá en unos instantes.' })
  })

  it.each([
    [400, 'invalido'], [401, 'rechazado'], [403, 'rechazado'], [409, 'conflicto'], [429, 'rechazado'], [500, 'error'],
  ] as const)('registra el retorno temprano HTTP %s como %s', async (status, resultado) => {
    const response = await conAuditoria('verificacion.responder', RUTA, async (_request: Request) => new Response(null, { status }))(solicitud())
    expect(response.status).toBe(status)
    const [evento] = await filasDe(response.headers.get('X-Request-Id')!)
    expect(evento).toMatchObject({ httpStatus: status, resultado, actorTipo: 'anonimo', accion: 'verificacion.responder' })
  })

  it('aísla el actor entre solicitudes concurrentes y registra la excepción sin su mensaje', async () => {
    const sufijo = randomUUID()
    const handler = conAuditoria('verificacion.responder', RUTA, async (id: string) => {
      actorAuditoria({ actorTipo: 'enlace', actorId: id, actorRol: null, viaAcceso: 'token_verificacion' })
      describirAuditoria({ objetoTipo: 'prueba', objetoId: id })
      await Promise.resolve()
      if (id.startsWith('excepcion')) throw new Error('password=secreto')
      return new Response(null, { status: 204 })
    })
    const ids = [`uno-${sufijo}`, `dos-${sufijo}`, `excepcion-${sufijo}`]
    const resultados = await Promise.allSettled(ids.map(id => handler(id)))
    expect(resultados.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected'])
    const [uno, dos, excepcion] = await Promise.all(ids.map(async id => (await filasPorObjeto(id))[0]))
    expect([uno.actorId, dos.actorId]).toEqual([ids[0], ids[1]])
    expect(excepcion).toMatchObject({ actorId: ids[2], resultado: 'error', httpStatus: 500 })
    expect(JSON.stringify(excepcion)).not.toContain('secreto')
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
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const ejecutar = vi.fn()
    await expect(conFalloAuditoria(() => jobAuditado('prueba', ejecutar, () => true))).rejects.toThrow('auditoria_no_disponible')
    expect(ejecutar).not.toHaveBeenCalled()
  })

  it('relanza la excepción original y registra el error sin su mensaje', async () => {
    const error = new Error('password=secreto')
    const objetoId = `falla-${randomUUID()}`
    const handler = conAuditoria('verificacion.responder', RUTA, async (_request: Request) => {
      describirAuditoria({ objetoTipo: 'prueba', objetoId })
      throw error
    })
    await expect(handler(solicitud())).rejects.toBe(error)
    const [evento] = await filasPorObjeto(objetoId)
    expect(evento).toMatchObject({ resultado: 'error', httpStatus: 500 })
    expect(JSON.stringify(evento)).not.toContain('secreto')
  })

  it('devuelve intacta la respuesta exitosa y solo agrega X-Request-Id', async () => {
    const cuerpo = JSON.stringify({ ok: true, dato: 'x' })
    const handler = conAuditoria('verificacion.responder', RUTA, async (_request: Request) =>
      new Response(cuerpo, { status: 202, headers: { 'Content-Type': 'application/json', 'X-Propio': 'valor' } }))
    const response = await handler(solicitud())
    expect(response.status).toBe(202)
    expect(await response.text()).toBe(cuerpo)
    expect(response.headers.get('X-Propio')).toBe('valor')
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect([...response.headers.keys()].sort()).toEqual(['content-type', 'x-propio', 'x-request-id'])
  })

  it('no llama migrarDb por solicitud auditada', async () => {
    vi.mocked(migrarDb).mockClear()
    await conAuditoria('verificacion.responder', RUTA, async (_request: Request) => new Response(null, { status: 204 }))(solicitud())
    await conAuditoria('verificacion.responder', RUTA, async (_request: Request) => { throw new Error('falla') })(solicitud()).catch(() => undefined)
    expect(migrarDb).not.toHaveBeenCalled()
  })

  it('escribe exactamente un evento por solicitud auditada', async () => {
    const confirmada = await guardarMotivo(randomUUID())(solicitud())
    const temprana = await conAuditoria('verificacion.responder', RUTA, async (_request: Request) => new Response(null, { status: 409 }))(solicitud())
    const objetoId = `unico-${randomUUID()}`
    await conAuditoria('verificacion.responder', RUTA, async (_request: Request) => {
      describirAuditoria({ objetoTipo: 'prueba', objetoId })
      throw new Error('falla')
    })(solicitud()).catch(() => undefined)
    for (const requestId of [confirmada.headers.get('X-Request-Id')!, temprana.headers.get('X-Request-Id')!]) {
      expect(await filasDe(requestId)).toHaveLength(1)
    }
    expect(await filasPorObjeto(objetoId)).toHaveLength(1)
  })

  it('la falla forzada no es bloqueada por el trigger de solo inserción', async () => {
    const fila = filaEvento()
    const error = await conFalloAuditoria(() => getDb().insert(auditoriaEvento).values(fila)).catch((e: unknown) => e)
    expect(mensajeCompleto(error)).toContain('fallo simulado')
    expect(mensajeCompleto(error)).not.toContain('solo inserción')
    await getDb().insert(auditoriaEvento).values(fila)
    const actualizar = await getDb().update(auditoriaEvento).set({ accion: 'alterada' }).where(eq(auditoriaEvento.id, fila.id)).catch((e: unknown) => e)
    expect(mensajeCompleto(actualizar)).toContain('auditoria_evento es de solo inserción')
  })
})

function mensajeCompleto(error: unknown): string {
  const partes: string[] = []
  for (let actual: unknown = error; actual; actual = (actual as { cause?: unknown }).cause) {
    partes.push(String((actual as { message?: unknown }).message ?? actual))
  }
  return partes.join(' | ')
}
