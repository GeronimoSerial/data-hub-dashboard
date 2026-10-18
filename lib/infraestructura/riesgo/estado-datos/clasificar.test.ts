import { describe, expect, it } from 'vitest'
import type { EstadoJobRun } from '../salud'
import {
  armarEstadoDatos,
  clasificarClimatologia,
  clasificarFuente,
  clasificarImerg,
  clasificarJob,
  clasificarPrefectura,
  clasificarRunVigente,
  type ItemEstadoDato,
} from './clasificar'

const AHORA = new Date('2026-10-17T22:00:00.000Z')
const CLIMATOLOGIA_CAUDAL = {
  nombre: 'climatologia-caudal',
  tipo: 'calcular-hazard-climatologia-caudal',
  intervaloMinutos: 1440,
  habilitado: true,
}

function corrida(parcial: Partial<EstadoJobRun>): EstadoJobRun {
  return {
    tipo: 'calcular-hazard-climatologia-caudal',
    estado: 'completado',
    intento: 1,
    iniciadoEn: '2026-10-17T21:41:00.000Z',
    finalizadoEn: '2026-10-17T21:50:00.000Z',
    actualizadaEn: '2026-10-17T21:50:00.000Z',
    errorSaneado: null,
    leaseVencido: false,
    ultimaCompletadaEn: '2026-10-17T21:50:00.000Z',
    ...parcial,
  }
}

describe('clasificarJob', () => {
  it('ok: última corrida completada dentro de la tolerancia', () => {
    const item = clasificarJob({ job: CLIMATOLOGIA_CAUDAL, ultima: corrida({}), enosJobsEnabled: true, ahora: AHORA })
    expect(item.estado).toBe('ok')
    expect(item.grupo).toBe('climatologias')
    expect(item.ultimoExitoEn).toBe('2026-10-17T21:50:00.000Z')
    expect(item.intervaloMinutos).toBe(1440)
    expect(item.edadMinutos).toBe(10)
  })

  it('fallido: el último intento falló aunque exista un éxito anterior', () => {
    const item = clasificarJob({
      job: CLIMATOLOGIA_CAUDAL,
      ultima: corrida({
        estado: 'fallido',
        intento: 3,
        actualizadaEn: '2026-10-17T21:45:00.000Z',
        errorSaneado: 'GloFAS   respondió 503\nreintentar más tarde',
        ultimaCompletadaEn: '2026-10-16T21:50:00.000Z',
      }),
      enosJobsEnabled: true,
      ahora: AHORA,
    })
    expect(item.estado).toBe('fallido')
    expect(item.ultimoExitoEn).toBe('2026-10-16T21:50:00.000Z')
    expect(item.ultimoIntentoEn).toBe('2026-10-17T21:45:00.000Z')
    expect(item.ultimoError).toBe('GloFAS respondió 503 reintentar más tarde')
    expect(item.motivo).toMatch(/intento 3/)
  })

  it('fallido: error largo se recorta', () => {
    const item = clasificarJob({
      job: CLIMATOLOGIA_CAUDAL,
      ultima: corrida({ estado: 'fallido', errorSaneado: 'x'.repeat(500) }),
      enosJobsEnabled: true,
      ahora: AHORA,
    })
    expect(item.ultimoError!.length).toBeLessThanOrEqual(160)
  })

  it('fallido: corrida en progreso con lease vencido', () => {
    const item = clasificarJob({
      job: CLIMATOLOGIA_CAUDAL,
      ultima: corrida({ estado: 'en_progreso', leaseVencido: true }),
      enosJobsEnabled: true,
      ahora: AHORA,
    })
    expect(item.estado).toBe('fallido')
  })

  it('atrasado: último éxito más viejo que intervalo × tolerancia', () => {
    const item = clasificarJob({
      job: CLIMATOLOGIA_CAUDAL,
      ultima: corrida({ actualizadaEn: '2026-10-14T21:50:00.000Z', ultimaCompletadaEn: '2026-10-14T21:50:00.000Z' }),
      enosJobsEnabled: true,
      ahora: AHORA,
    })
    expect(item.estado).toBe('atrasado')
  })

  it('sin_datos: nunca corrió', () => {
    const item = clasificarJob({ job: CLIMATOLOGIA_CAUDAL, ultima: undefined, enosJobsEnabled: true, ahora: AHORA })
    expect(item.estado).toBe('sin_datos')
    expect(item.ultimoExitoEn).toBeNull()
    expect(item.edadMinutos).toBeNull()
  })

  it('sin_datos: corrió pero nunca completó', () => {
    const item = clasificarJob({
      job: CLIMATOLOGIA_CAUDAL,
      ultima: corrida({ estado: 'en_progreso', ultimaCompletadaEn: null }),
      enosJobsEnabled: true,
      ahora: AHORA,
    })
    expect(item.estado).toBe('sin_datos')
  })

  it('deshabilitado: job no programado, aunque nunca haya corrido', () => {
    const item = clasificarJob({
      job: { ...CLIMATOLOGIA_CAUDAL, habilitado: false },
      ultima: undefined,
      enosJobsEnabled: true,
      ahora: AHORA,
    })
    expect(item.estado).toBe('deshabilitado')
  })

  it('deshabilitado: jobs batch en pausa operativa', () => {
    const item = clasificarJob({ job: CLIMATOLOGIA_CAUDAL, ultima: undefined, enosJobsEnabled: false, ahora: AHORA })
    expect(item.estado).toBe('deshabilitado')
  })
})

describe('clasificarPrefectura', () => {
  const estaciones = [
    { estacionId: 'corrientes', nombre: 'Corrientes' },
    { estacionId: 'itati', nombre: 'Itatí' },
    { estacionId: 'goya', nombre: 'Goya' },
  ]

  it('ok cuando todas las estaciones tienen lectura de menos de 18 h', () => {
    const item = clasificarPrefectura({
      estaciones,
      ultimaPorEstacion: new Map([
        ['corrientes', '2026-10-17T12:00:00.000Z'],
        ['itati', '2026-10-17T15:00:00.000Z'],
        ['goya', '2026-10-17T12:00:00.000Z'],
      ]),
      ahora: AHORA,
    })
    expect(item.estado).toBe('ok')
    expect(item.ultimoExitoEn).toBe('2026-10-17T15:00:00.000Z')
  })

  it('atrasado con las estaciones vencidas (> 18 h) o sin lectura, por nombre', () => {
    const item = clasificarPrefectura({
      estaciones,
      ultimaPorEstacion: new Map([
        ['corrientes', '2026-10-17T12:00:00.000Z'],
        ['itati', '2026-10-17T03:59:00.000Z'],
      ]),
      ahora: AHORA,
    })
    expect(item.estado).toBe('atrasado')
    expect(item.motivo).toContain('2 de 3')
    expect(item.motivo).toContain('Itatí')
    expect(item.motivo).toContain('Goya')
    expect(item.motivo).not.toContain('Corrientes')
  })

  it('sin_datos cuando no hay ninguna lectura', () => {
    const item = clasificarPrefectura({ estaciones, ultimaPorEstacion: new Map(), ahora: AHORA })
    expect(item.estado).toBe('sin_datos')
  })
})

describe('clasificarRunVigente', () => {
  it('ok con menos de 2 ciclos de 6 h', () => {
    expect(clasificarRunVigente({ publicadoEn: '2026-10-17T18:05:00.000Z', ahora: AHORA }).estado).toBe('ok')
  })
  it('atrasado con más de 12 h', () => {
    expect(clasificarRunVigente({ publicadoEn: '2026-10-17T09:00:00.000Z', ahora: AHORA }).estado).toBe('atrasado')
  })
  it('sin_datos sin run vigente', () => {
    expect(clasificarRunVigente({ publicadoEn: null, ahora: AHORA }).estado).toBe('sin_datos')
  })
})

describe('clasificarImerg', () => {
  it('ok y muestra desde cuándo hay cobertura', () => {
    const item = clasificarImerg({ desde: '2026-10-10T12:00:00.000Z', hasta: '2026-10-17T20:30:00.000Z', ahora: AHORA })
    expect(item.estado).toBe('ok')
    expect(item.motivo).toContain('10/10/2026')
  })
  it('atrasado si el gránulo más nuevo supera 6 h', () => {
    const item = clasificarImerg({ desde: '2026-10-10T12:00:00.000Z', hasta: '2026-10-17T12:00:00.000Z', ahora: AHORA })
    expect(item.estado).toBe('atrasado')
  })
  it('sin_datos sin observaciones', () => {
    expect(clasificarImerg({ desde: null, hasta: null, ahora: AHORA }).estado).toBe('sin_datos')
  })
})

describe('clasificarClimatologia', () => {
  const base = { aniosMin: 0, aniosMediana: 30, aniosMax: 30, aniosObjetivo: 30 as const, minimoUsable: 20 }
  it('ok con todas las celdas usables', () => {
    expect(clasificarClimatologia({ ...base, celdasTotal: 10, celdasUsables: 10 }).estado).toBe('ok')
  })
  it('atrasado con cobertura parcial', () => {
    const item = clasificarClimatologia({ ...base, celdasTotal: 10, celdasUsables: 4 })
    expect(item.estado).toBe('atrasado')
    expect(item.motivo).toContain('4 de 10')
  })
  it('sin_datos sin celdas usables', () => {
    expect(clasificarClimatologia({ ...base, celdasTotal: 10, celdasUsables: 0 }).estado).toBe('sin_datos')
    expect(clasificarClimatologia({ ...base, celdasTotal: 0, celdasUsables: 0 }).estado).toBe('sin_datos')
  })
})

describe('clasificarFuente', () => {
  const fuente = {
    provider: 'open-meteo',
    estado: 'ok',
    ultimoExitoEn: '2026-10-17T21:00:00.000Z',
    ultimoIntentoEn: '2026-10-17T21:00:00.000Z',
    ultimoErrorSaneado: null,
    ttlMinutos: 360,
    datoMasRecienteImerg: null,
    ahora: AHORA,
  }
  it('ok dentro del TTL', () => {
    expect(clasificarFuente(fuente).estado).toBe('ok')
  })
  it('fallido si la última consulta no estuvo disponible, con su error', () => {
    const item = clasificarFuente({ ...fuente, estado: 'no_disponible', ultimoErrorSaneado: 'timeout' })
    expect(item.estado).toBe('fallido')
    expect(item.ultimoError).toBe('timeout')
  })
  it('atrasado si venció el TTL', () => {
    expect(clasificarFuente({ ...fuente, ultimoExitoEn: '2026-10-17T10:00:00.000Z' }).estado).toBe('atrasado')
  })
  it('sin_datos si nunca tuvo éxito', () => {
    expect(clasificarFuente({ ...fuente, ultimoExitoEn: null }).estado).toBe('sin_datos')
  })
})

describe('armarEstadoDatos', () => {
  function item(id: string, estado: ItemEstadoDato['estado']): ItemEstadoDato {
    return {
      id, grupo: 'riesgo', nombre: id, estado, motivo: '', ultimoExitoEn: null, ultimoIntentoEn: null,
      ultimoError: null, edadMinutos: null, intervaloMinutos: null,
    }
  }
  it('ordena problemas primero y cuenta sólo fallido, sin_datos y atrasado', () => {
    const estado = armarEstadoDatos({
      items: [item('a', 'ok'), item('b', 'deshabilitado'), item('c', 'atrasado'), item('d', 'fallido'), item('e', 'sin_datos')],
      ahora: AHORA,
    })
    expect(estado.items.map((i) => i.id)).toEqual(['d', 'e', 'c', 'a', 'b'])
    expect(estado.problemas).toBe(3)
    expect(estado.generadoEn).toBe(AHORA.toISOString())
  })
})
