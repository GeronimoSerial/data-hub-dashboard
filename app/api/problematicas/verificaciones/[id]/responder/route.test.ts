import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { crearEpisodio } from '@/lib/infraestructura/episodios'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { crearVerificacion, obtenerVerificacion } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'responder-route-'))
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
  return `1801605-8${String(contadorCue).padStart(2, '0')}`
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

function postReq(id: string, body: unknown, ip = '10.0.0.2'): Request {
  return new Request(`http://localhost/api/problematicas/verificaciones/${id}/responder`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

function contexto(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/problematicas/verificaciones/[id]/responder', () => {
  it("'sin_afectacion' con token válido: 200 y estado respondida", async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await POST(
      postReq(verificacion.id, { token, resultado: 'sin_afectacion' }),
      contexto(verificacion.id),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('cache-control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.verificacion.estado).toBe('respondida')
    expect(body.verificacion.resultado).toBe('sin_afectacion')
    expect('tokenHash' in body.verificacion).toBe(false)

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('respondida')
  })

  it("'con_afectacion' en el body: 400 rechazado por el schema, sin escritura", async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await POST(
      postReq(verificacion.id, { token, resultado: 'con_afectacion' }),
      contexto(verificacion.id),
    )
    expect(res.status).toBe(400)

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
  })

  it('retry idéntico: 200 replay', async () => {
    const { token, verificacion } = await verificacionPendiente()
    const payload = { token, resultado: 'sin_afectacion' }

    const primera = await POST(postReq(verificacion.id, payload), contexto(verificacion.id))
    const segunda = await POST(postReq(verificacion.id, payload), contexto(verificacion.id))

    expect(primera.status).toBe(200)
    expect(segunda.status).toBe(200)
    const body = await segunda.json()
    expect(body.ok).toBe(true)
    expect(body.verificacion.estado).toBe('respondida')
  })

  it('segunda respuesta contradictoria: 409 respuesta_contradictoria', async () => {
    const { token, verificacion } = await verificacionPendiente()

    await POST(
      postReq(verificacion.id, { token, resultado: 'sin_afectacion' }),
      contexto(verificacion.id),
    )
    const contradictoria = await POST(
      postReq(verificacion.id, { token, resultado: 'no_disponible' }),
      contexto(verificacion.id),
    )

    expect(contradictoria.status).toBe(409)
    const body = await contradictoria.json()
    expect(body.error).toBe('Ya se registró una respuesta distinta para esta solicitud.')
  })

  it('token inválido: 403 y sin escritura (sigue pendiente)', async () => {
    const { verificacion } = await verificacionPendiente()

    const res = await POST(
      postReq(verificacion.id, { token: 'token-malo', resultado: 'sin_afectacion' }),
      contexto(verificacion.id),
    )
    expect(res.status).toBe(403)

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.tokenConsumidoEn).toBeNull()
  })
})
