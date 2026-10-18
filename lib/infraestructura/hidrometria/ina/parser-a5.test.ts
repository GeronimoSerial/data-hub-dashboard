import { describe, expect, it } from 'vitest'
import estacionesA5 from '../__fixtures__/ina/estaciones-a5.json'
import observacionesCorrientes from '../__fixtures__/ina/observaciones-corrientes.json'
import { ErrorPayloadA5, fechaLocalA5, normalizarSerieDiaria, parsearEstacionesA5, parsearObservacionesA5 } from './parser-a5'
import { crearClienteA5 } from './cliente-a5'

describe('parsearEstacionesA5', () => {
  it('lee la respuesta real de estaciones con cero IGN y umbrales, conservando null', () => {
    const estaciones = parsearEstacionesA5(estacionesA5)
    const corrientes = estaciones.find((e) => e.idExterno === '130')
    expect(corrientes).toMatchObject({ id: 19, ceroIgnM: 42.39, alertaM: 6.5, evacuacionM: 7, rio: 'PARANAMED' })
    expect(estaciones.find((e) => e.idExterno === '90')?.ceroIgnM).toBeNull()
  })

  it('rechaza un payload que no es una lista de estaciones', () => {
    expect(() => parsearEstacionesA5({ error: 'x' })).toThrow(ErrorPayloadA5)
  })
})

describe('parsearObservacionesA5', () => {
  it('lee observaciones reales de la serie de Corrientes y tolera qualifier ausente', () => {
    const obs = parsearObservacionesA5(observacionesCorrientes, 19)
    expect(obs).toHaveLength(5)
    expect(obs[0]).toMatchObject({ timestart: '2026-10-10T03:00:00.000Z', valor: 4.92, qualifier: null })
  })

  it('acepta el envoltorio con metadata: null', () => {
    const obs = parsearObservacionesA5({ metadata: null, rows: observacionesCorrientes }, 19)
    expect(obs).toHaveLength(5)
  })

  it('rechaza observaciones de otra serie (estación incorrecta)', () => {
    expect(() => parsearObservacionesA5(observacionesCorrientes, 23)).toThrow(ErrorPayloadA5)
  })

  it('rechaza valores no numéricos sin convertirlos en cero', () => {
    const malo = [{ ...observacionesCorrientes[0], valor: null }]
    expect(() => parsearObservacionesA5(malo, 19)).toThrow(ErrorPayloadA5)
  })
})

describe('normalizarSerieDiaria', () => {
  it('asigna la fecha local de Argentina (UTC-3) y no la fecha UTC', () => {
    expect(fechaLocalA5('2026-10-10T03:00:00.000Z')).toBe('2026-10-10')
    expect(fechaLocalA5('2026-10-10T02:59:00.000Z')).toBe('2026-10-09')
    expect(fechaLocalA5('1905-01-01T11:16:48.000Z')).toBe('1905-01-01')
  })

  it('deduplica filas repetidas de forma determinística (primera por hora, luego id)', () => {
    const base = parsearObservacionesA5(observacionesCorrientes, 19)
    const repetida = { ...base[1], id: base[1].id - 1, timestart: '2026-10-11T12:00:00.000Z', valor: 9.99 }
    const r1 = normalizarSerieDiaria([...base, repetida, base[0]])
    const r2 = normalizarSerieDiaria([repetida, base[0], ...base].reverse())
    expect(r1).toEqual(r2)
    expect(r1.filas.map((f) => f.fecha)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
    expect(r1.filas[1].valorM).toBe(4.95)
    expect(r1.repetidas).toBe(2)
    expect(r1.conflictosInternos).toEqual(['2026-10-11'])
  })
})

describe('crearClienteA5', () => {
  const respuesta = (cuerpo: string, status = 200) => async () => new Response(cuerpo, { status })

  it('pide observaciones de una ventana y devuelve el payload crudo con sha256', async () => {
    const urls: string[] = []
    const cliente = crearClienteA5({
      fetchImpl: async (url) => {
        urls.push(String(url))
        return new Response(JSON.stringify(observacionesCorrientes))
      },
    })
    const r = await cliente.obtenerObservaciones(19, '2026-10-10', '2026-10-17')
    if (!r.ok) throw new Error(r.detalle)
    expect(urls[0]).toBe('https://alerta.ina.gob.ar/a5/obs/puntual/series/19/observaciones?timestart=2026-10-10&timeend=2026-10-17&format=json')
    expect(r.datos.observaciones).toHaveLength(5)
    expect(r.datos.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('devuelve payload_invalido ante JSON inválido', async () => {
    const cliente = crearClienteA5({ fetchImpl: respuesta('<html>no</html>'), maxIntentos: 1 })
    const r = await cliente.obtenerEstaciones()
    expect(r).toMatchObject({ ok: false, motivo: 'payload_invalido' })
  })

  it('devuelve timeout con reintentos acotados', async () => {
    let llamadas = 0
    const cliente = crearClienteA5({
      fetchImpl: () => {
        llamadas++
        return new Promise<Response>(() => {})
      },
      timeoutMs: 5,
      maxIntentos: 2,
      backoffBaseMs: 1,
    })
    const r = await cliente.obtenerObservaciones(19, '2026-10-10', '2026-10-17')
    expect(r).toMatchObject({ ok: false, motivo: 'timeout' })
    expect(llamadas).toBe(2)
  })
})
