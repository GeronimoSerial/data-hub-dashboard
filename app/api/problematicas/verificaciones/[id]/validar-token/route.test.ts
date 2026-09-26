import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { infraVerificacion } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { crearVerificacion } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

// Mismo patrón que app/api/problematicas/parte/route.test.ts: base real en un
// tmpdir, ensureSeeded() una vez y rate limit reseteado entre tests.
let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'validar-token-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  _resetLimitesParaTests()
})

let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801605-9${String(contadorCue).padStart(2, '0')}`
}

async function verificacionPendiente(ahora?: Date) {
  const creada = await crearVerificacion(
    { cueAnexo: cueUnico(), solicitadaPorUserId: 'user-director' },
    ahora,
  )
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

function postReq(id: string, body: unknown, ip = '10.0.0.1'): Request {
  return new Request(`http://localhost/api/problematicas/verificaciones/${id}/validar-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

function contexto(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/problematicas/verificaciones/[id]/validar-token', () => {
  it('token correcto sobre pendiente: 200, sin tokenHash y con Referrer-Policy', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('cache-control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.verificacion.id).toBe(verificacion.id)
    expect(body.verificacion.estado).toBe('pendiente')
    expect('tokenHash' in body.verificacion).toBe(false)
  })

  it('token incorrecto: 403', async () => {
    const { verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token: 'token-malo' }), contexto(verificacion.id))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('El enlace no es válido.')
  })

  it('verificación inexistente: 404', async () => {
    const id = randomUUID()
    const res = await POST(postReq(id, { token: 'cualquiera' }), contexto(id))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('La solicitud no existe.')
  })

  it('token revocado: 410', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toBe('Este enlace fue revocado.')
  })

  it('token vencido: 410', async () => {
    const { token, verificacion } = await verificacionPendiente(new Date('2020-01-01T00:00:00.000Z'))

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toBe('Este enlace venció.')
  })

  it('body sin token: 400', async () => {
    const { verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, {}), contexto(verificacion.id))
    expect(res.status).toBe(400)
  })

  it('rate limit por IP: la request 11 desde el mismo IP da 429', async () => {
    const { token, verificacion } = await verificacionPendiente()
    const ip = '10.9.9.9'

    for (let i = 0; i < 10; i += 1) {
      const res = await POST(postReq(verificacion.id, { token }, ip), contexto(verificacion.id))
      expect(res.status).toBe(200)
    }
    const onceava = await POST(postReq(verificacion.id, { token }, ip), contexto(verificacion.id))
    expect(onceava.status).toBe(429)
  })
})
