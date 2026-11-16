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

describe('calcularAcumuladoObservado: confianza por calidad IMERG', () => {
  const ASOF = new Date('2026-11-15T00:00:00.000Z')
  const conCalidad = (calidades: Array<number | null>, valor = 1) =>
    calidades.map((calidad, i) => ({
      valor,
      calidad,
      validoHasta: new Date(ASOF.getTime() - i * 30 * 60 * 1000).toISOString(),
    }))
  const calcular = (granulos: ReturnType<typeof conCalidad>) =>
    calcularAcumuladoObservado({ geometryRef: CELDA, horizonteHoras: 24, granulos, asOf: ASOF })

  it('lluvia con calidad baja (14/11: 0.33-0.50) se marca confianza baja y conserva el acumulado', () => {
    const calidades = Array.from({ length: 48 }, (_, i) => (i % 2 === 0 ? 0.33 : 0.5))
    const resultado = calcular(conCalidad(calidades))

    expect(resultado.confianza).toBe('baja')
    expect(resultado.calidadPonderada).toBeCloseTo(0.415, 3)
    expect(resultado.acumuladoMm).toBe(48)
  })

  it('lluvia con calidad alta se marca confianza alta', () => {
    const resultado = calcular(conCalidad(Array.from({ length: 48 }, () => 0.7)))

    expect(resultado.confianza).toBe('alta')
    expect(resultado.calidadPonderada).toBeCloseTo(0.7, 5)
  })

  it('pondera por mm: un gránulo lluvioso de buena calidad pesa más que muchos casi secos de mala', () => {
    const granulos = conCalidad(Array.from({ length: 48 }, () => 0.3), 0.01)
    granulos[0] = { ...granulos[0], valor: 20, calidad: 0.8 }

    expect(calcular(granulos).confianza).toBe('alta')
  })

  it('calidad null es desconocida: no baja la confianza ni entra en el promedio', () => {
    const resultado = calcular(conCalidad(Array.from({ length: 48 }, () => null)))

    expect(resultado.confianza).toBe('alta')
    expect(resultado.calidadPonderada).toBeNull()
  })

  it('sin lluvia (todo 0) o sin acumulado (cobertura insuficiente) la confianza es alta', () => {
    const seco = calcular(conCalidad(Array.from({ length: 48 }, () => 0.2), 0))
    const incompleto = calcular(conCalidad([0.2, 0.2, 0.2]))

    expect(seco.confianza).toBe('alta')
    expect(seco.calidadPonderada).toBeNull()
    expect(incompleto.acumuladoMm).toBeNull()
    expect(incompleto.confianza).toBe('alta')
  })

  it('no altera el acumulado: igual con o sin calidad', () => {
    const base = conCalidad(Array.from({ length: 48 }, () => null), 1.5)
    const baja = conCalidad(Array.from({ length: 48 }, () => 0.2), 1.5)

    expect(calcular(baja).acumuladoMm).toBe(calcular(base).acumuladoMm)
    expect(calcular(baja).acumuladoMm).toBe(72)
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
