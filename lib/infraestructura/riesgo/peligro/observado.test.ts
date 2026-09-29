import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { hazardObservation } from '@/lib/db/schema'
import { crearGeneradoresGranulos } from '../__fixtures__/granulos'
import type { getDb as GetDb } from '@/lib/db'
import type {
  calcularAcumuladoObservado as CalcularAcumuladoObservado,
  obtenerAcumuladoObservado as ObtenerAcumuladoObservado,
  obtenerAcumuladosObservados as ObtenerAcumuladosObservados,
} from './observado'

usarDbTemporal('observado-')

beforeAll(async () => {
  const dbModule = await import('@/lib/db')
  db = dbModule.getDb()
  ;({ calcularAcumuladoObservado, obtenerAcumuladoObservado, obtenerAcumuladosObservados } = await import(
    './observado'
  ))
})

let db: ReturnType<typeof GetDb>
let calcularAcumuladoObservado: typeof CalcularAcumuladoObservado
let obtenerAcumuladoObservado: typeof ObtenerAcumuladoObservado
let obtenerAcumuladosObservados: typeof ObtenerAcumuladosObservados

const CELDA = '-27.5_-58.8'
const { granulo, granulosConsecutivos } = crearGeneradoresGranulos(CELDA)

beforeEach(async () => {
  await db.delete(hazardObservation)
})

describe('calcularAcumuladoObservado (función pura)', () => {
  const ASOF = new Date('2026-09-26T12:00:00.000Z')

  it('con cobertura completa (48/48) suma los 24h exactos y reporta cobertura 1', () => {
    const granulos = granulosConsecutivos(ASOF.toISOString(), 48, 1)

    const resultado = calcularAcumuladoObservado({
      geometryRef: CELDA,
      horizonteHoras: 24,
      granulos,
      asOf: ASOF,
    })

    expect(resultado.granulosEsperados).toBe(48)
    expect(resultado.granulosEncontrados).toBe(48)
    expect(resultado.cobertura).toBe(1)
    expect(resultado.acumuladoMm).toBe(48)
    expect(resultado.masRecienteEn).toBe(ASOF.toISOString())
  })

  it('con cobertura completa (144/144) suma los 72h exactos', () => {
    const granulos = granulosConsecutivos(ASOF.toISOString(), 144, 2)

    const resultado = calcularAcumuladoObservado({
      geometryRef: CELDA,
      horizonteHoras: 72,
      granulos,
      asOf: ASOF,
    })

    expect(resultado.granulosEsperados).toBe(144)
    expect(resultado.granulosEncontrados).toBe(144)
    expect(resultado.cobertura).toBe(1)
    expect(resultado.acumuladoMm).toBe(288)
  })

  it('ignora gránulos con validoHasta posterior a asOf (as-of aware)', () => {
    const granulos = [
      ...granulosConsecutivos(ASOF.toISOString(), 48, 1),
      // "Del futuro" respecto de asOf: nunca debería entrar en la ventana ni
      // mover el ancla.
      granulo(new Date(ASOF.getTime() + 30 * 60 * 1000).toISOString(), 1000),
    ]

    const resultado = calcularAcumuladoObservado({
      geometryRef: CELDA,
      horizonteHoras: 24,
      granulos,
      asOf: ASOF,
    })

    expect(resultado.masRecienteEn).toBe(ASOF.toISOString())
    expect(resultado.acumuladoMm).toBe(48)
  })

  it('cobertura por debajo del umbral (< 0.8): acumuladoMm null, nunca subestimado', () => {
    // Sólo 30 de 48 esperados (0.625 de cobertura) -> por debajo de 0.8.
    const granulos = granulosConsecutivos(ASOF.toISOString(), 30, 1)

    const resultado = calcularAcumuladoObservado({
      geometryRef: CELDA,
      horizonteHoras: 24,
      granulos,
      asOf: ASOF,
    })

    expect(resultado.granulosEncontrados).toBe(30)
    expect(resultado.cobertura).toBeCloseTo(30 / 48, 5)
    expect(resultado.acumuladoMm).toBeNull()
  })

  it('cobertura justo en el umbral (>= 0.8) sí acumula', () => {
    // 39/48 = 0.8125 >= 0.8.
    const granulos = granulosConsecutivos(ASOF.toISOString(), 39, 1)

    const resultado = calcularAcumuladoObservado({
      geometryRef: CELDA,
      horizonteHoras: 24,
      granulos,
      asOf: ASOF,
    })

    expect(resultado.cobertura).toBeGreaterThanOrEqual(0.8)
    expect(resultado.acumuladoMm).toBe(39)
  })

  it('sin ningún gránulo: cobertura 0, acumuladoMm null, masRecienteEn null', () => {
    const resultado = calcularAcumuladoObservado({
      geometryRef: CELDA,
      horizonteHoras: 24,
      granulos: [],
      asOf: ASOF,
    })

    expect(resultado.granulosEncontrados).toBe(0)
    expect(resultado.cobertura).toBe(0)
    expect(resultado.acumuladoMm).toBeNull()
    expect(resultado.masRecienteEn).toBeNull()
  })

  it('un gap en el medio de la ventana reduce granulosEncontrados y cobertura (no infla con gránulos más viejos)', () => {
    // 48 esperados; se quitan 10 del medio de la ventana (quedan 38, dentro de
    // la MISMA ventana de tiempo, no se compensa yendo más atrás).
    const todos = granulosConsecutivos(ASOF.toISOString(), 48, 1)
    const conGap = todos.filter((_, i) => i < 5 || i >= 15)

    const resultado = calcularAcumuladoObservado({
      geometryRef: CELDA,
      horizonteHoras: 24,
      granulos: conGap,
      asOf: ASOF,
    })

    expect(resultado.granulosEsperados).toBe(48)
    expect(resultado.granulosEncontrados).toBe(38)
    expect(resultado.cobertura).toBeCloseTo(38 / 48, 5)
  })
})

describe('obtenerAcumuladoObservado (lectura DB)', () => {
  it('suma lo persistido en hazard_observation para la celda pedida', async () => {
    const asOf = new Date('2026-09-26T06:00:00.000Z')
    const filas = granulosConsecutivos(asOf.toISOString(), 48, 3)
    await db.insert(hazardObservation).values(filas)

    const resultado = await obtenerAcumuladoObservado({ geometryRef: CELDA, horizonteHoras: 24, asOf })

    expect(resultado.cobertura).toBe(1)
    expect(resultado.acumuladoMm).toBe(144)
  })

  it('no mezcla celdas distintas', async () => {
    const asOf = new Date('2026-09-26T07:00:00.000Z')
    const propias = granulosConsecutivos(asOf.toISOString(), 48, 1)
    const ajenas = granulosConsecutivos(asOf.toISOString(), 48, 1000).map((fila) => ({
      ...fila,
      id: randomUUID(),
      geometryRef: '-30.0_-56.0',
    }))
    await db.insert(hazardObservation).values([...propias, ...ajenas])

    const resultado = await obtenerAcumuladoObservado({ geometryRef: CELDA, horizonteHoras: 24, asOf })

    expect(resultado.acumuladoMm).toBe(48)
  })

  it('obtenerAcumuladosObservados devuelve 24h y 72h en un solo llamado', async () => {
    const asOf = new Date('2026-09-26T08:00:00.000Z')
    const filas = granulosConsecutivos(asOf.toISOString(), 144, 1)
    await db.insert(hazardObservation).values(filas)

    const resultado = await obtenerAcumuladosObservados({ geometryRef: CELDA, asOf })

    expect(resultado).toHaveLength(2)
    const h24 = resultado.find((r) => r.horizonteHoras === 24)
    const h72 = resultado.find((r) => r.horizonteHoras === 72)
    expect(h24?.acumuladoMm).toBe(48)
    expect(h72?.acumuladoMm).toBe(144)
  })
})
