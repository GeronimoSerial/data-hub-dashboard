import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { crearEpisodio } from '@/lib/infraestructura/episodios'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { NOMBRE_COOKIE_SESION_VERIFICACION } from '@/lib/infraestructura/verificacion-sesion'
import { crearVerificacion, responderPorEnlace } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

// Mismo patrón que app/api/problematicas/verificaciones/[id]/validar-token/route.test.ts:
// base real en un tmpdir, ensureSeeded() una vez y rate limit reseteado entre tests.
let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'canjear-sesion-route-'))
  prevDataDir = process.env.DATA_DIR
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.DATA_DIR = dir
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = claveDePrueba()
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  _resetLimitesParaTests()
})

let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801606-${String(contadorCue).padStart(2, '0')}`
}

async function verificacionPendiente() {
  const episodio = await crearEpisodio({ periodoId: PERIODO_ENOS_2026_2027_ID, nombre: 'Episodio de prueba' })
  const creada = await crearVerificacion({
    episodioId: episodio.id,
    cueAnexo: cueUnico(),
    solicitadaPorUserId: 'user-director',
  })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

function postReq(id: string, body: unknown, ip = '10.0.0.3'): Request {
  return new Request(`http://localhost/api/problematicas/verificaciones/${id}/canjear-sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

function contexto(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/problematicas/verificaciones/[id]/canjear-sesion', () => {
  it('token válido: 200, sesión acotada en Set-Cookie y sin tokenHash', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('cache-control')).toBe('private, no-store')

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain(NOMBRE_COOKIE_SESION_VERIFICACION)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.verificacion.id).toBe(verificacion.id)
    expect('tokenHash' in body.verificacion).toBe(false)
  })

  it('token inválido: 403 y sin cookie seteada', async () => {
    const { verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token: 'token-malo' }), contexto(verificacion.id))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('El enlace no es válido.')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('body sin token: 400', async () => {
    const { verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, {}), contexto(verificacion.id))
    expect(res.status).toBe(400)
  })

  // Regla de N1: aunque validarCredencial (de sólo lectura) siga devolviendo
  // ok:true para mostrar el comprobante, una verificación ya respondida no
  // puede canjear una sesión nueva.
  it('verificación ya respondida: 409, sin cookie y con el token intacto', async () => {
    const { token, verificacion } = await verificacionPendiente()
    const respuesta = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(respuesta.ok).toBe(true)

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(409)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie === null || !setCookie.includes(NOMBRE_COOKIE_SESION_VERIFICACION)).toBe(true)
    const body = await res.json()
    expect(body.error).toBe('Esta solicitud ya fue respondida.')
  })
})
