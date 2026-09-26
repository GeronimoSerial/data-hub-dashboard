import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { infraMovimiento, infraParte } from '@/lib/db/schema'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { crearEpisodio } from '@/lib/infraestructura/episodios'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { crearVerificacion, obtenerVerificacion } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'vincular-movimiento-route-'))
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
  return `1801605-7${String(contadorCue).padStart(2, '0')}`
}

async function verificacionPendiente(cueAnexo: string) {
  const episodio = await crearEpisodio({ periodoId: PERIODO_ENOS_2026_2027_ID, nombre: 'Episodio de prueba' })
  const creada = await crearVerificacion({
    episodioId: episodio.id,
    cueAnexo,
    solicitadaPorUserId: 'user-director',
  })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

// La FK de infra_verificacion.movimiento_id -> infra_movimiento.id está
// enforced (HUB_DDL setea PRAGMA foreign_keys = ON), así que un uuid
// inventado haría fallar el UPDATE. El endpoint no valida el movimiento; acá
// se inserta una fila real para poder ejercitar el camino feliz.
async function movimientoDePrueba(cueAnexo: string): Promise<string> {
  const db = getDb()
  const ahora = new Date().toISOString()
  const parteId = randomUUID()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId: 1,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  const movimientoId = randomUUID()
  await db.insert(infraMovimiento).values({
    id: movimientoId,
    parteId,
    tipo: 'reporte_inicial',
    rol: 'director',
    resumen: {},
    rigeDesde: ahora,
    creadaEn: ahora,
    idempotencyKey: null,
    episodioId: null,
  })
  return movimientoId
}

function postReq(id: string, body: unknown, ip = '10.0.0.3'): Request {
  return new Request(`http://localhost/api/problematicas/verificaciones/${id}/vincular-movimiento`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

function contexto(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/problematicas/verificaciones/[id]/vincular-movimiento', () => {
  it('token válido + movimientoId: 200 y guarda con_afectacion con el movimiento', async () => {
    const cue = cueUnico()
    const { token, verificacion } = await verificacionPendiente(cue)
    const movimientoId = await movimientoDePrueba(cue)

    const res = await POST(
      postReq(verificacion.id, { token, movimientoId }),
      contexto(verificacion.id),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('cache-control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.verificacion.estado).toBe('respondida')
    expect(body.verificacion.resultado).toBe('con_afectacion')
    expect(body.verificacion.movimientoId).toBe(movimientoId)
    expect('tokenHash' in body.verificacion).toBe(false)

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('respondida')
    expect(fila?.resultado).toBe('con_afectacion')
    expect(fila?.movimientoId).toBe(movimientoId)
  })

  it('token inválido: 403', async () => {
    const cue = cueUnico()
    const { verificacion } = await verificacionPendiente(cue)
    const movimientoId = await movimientoDePrueba(cue)

    const res = await POST(
      postReq(verificacion.id, { token: 'token-malo', movimientoId }),
      contexto(verificacion.id),
    )
    expect(res.status).toBe(403)

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
  })
})
