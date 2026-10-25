// @vitest-environment jsdom
// Un parte de institutos encolado sin conexión se reenvía por la cola existente
// con el mismo cuerpo de carreras y alumnos y la misma idempotencyKey.
import { describe, expect, it, vi } from 'vitest'
import { crearAlmacenMemoria, intentarEnviar, leerBorrador, reenviarCola, type EnviarOpciones } from './envio-offline'

type PayloadInstituto = Record<string, unknown>

const payload: PayloadInstituto = {
  cue: '12345678',
  rigeDesde: '2026-10-25T10:00:00.000Z',
  afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', carreras: [1, 2], alumnos: [100] }],
  servicioEducativo: { estado: 'suspendido', alcance: { tipo: 'carrera', carreras: [1, 2] } },
}

function respuesta(status: number, cuerpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: () => Promise.resolve(cuerpo) } as unknown as Response
}

function opciones(almacen: ReturnType<typeof crearAlmacenMemoria>, fetchImpl: EnviarOpciones<PayloadInstituto>['fetchImpl']): EnviarOpciones<PayloadInstituto> {
  return {
    almacen,
    tipo: 'nuevo',
    cue: '12345678',
    fetchImpl,
    url: '/api/problematicas/parte',
    construirCuerpo: (datos, idempotencyKey) => ({ ...datos, idempotencyKey }),
  }
}

describe('reenvío de un parte de instituto desde la cola offline', () => {
  it('reenvía el cuerpo de carreras y alumnos con la misma idempotencyKey', async () => {
    const almacen = crearAlmacenMemoria()
    const sinConexion = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const primero = await intentarEnviar(payload, opciones(almacen, sinConexion))
    expect(primero).toEqual({ ok: false, estado: 'pendiente-envio' })

    const conexion = vi.fn().mockResolvedValue(respuesta(201, { ok: true, movimientoId: 'm-9' }))
    const reenvio = await reenviarCola(opciones(almacen, conexion))

    expect(reenvio).toEqual({ ok: true, respuesta: { ok: true, movimientoId: 'm-9' } })
    const claveAntes = new Headers((sinConexion.mock.calls[0][1] as RequestInit).headers).get('Idempotency-Key')
    const [, init] = conexion.mock.calls[0] as [string, RequestInit]
    const cuerpo = JSON.parse(init.body as string)
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe(claveAntes)
    expect(cuerpo.afectacionesNuevas[0].carreras).toEqual([1, 2])
    expect(cuerpo.afectacionesNuevas[0].alumnos).toEqual([100])
    expect(cuerpo.afectacionesNuevas[0]).not.toHaveProperty('secciones')
    expect(cuerpo.servicioEducativo).toEqual({ estado: 'suspendido', alcance: { tipo: 'carrera', carreras: [1, 2] } })
    expect(await leerBorrador(almacen, 'nuevo', '12345678')).toBeNull()
  })
})
