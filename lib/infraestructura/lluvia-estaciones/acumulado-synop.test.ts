import { describe, expect, it } from 'vitest'
import type { PrecipitacionSynop } from './synop-parser'
import { acumularSynop, MIN_PERIODOS_72H } from './acumulado-synop'

const WMO = '87166'
const HORA_MS = 3_600_000

function registro(
  observadoEn: string,
  precipitacionMm: number,
  opciones: Partial<Pick<PrecipitacionSynop, 'periodoHoras' | 'seccion' | 'traza'>> = {},
): PrecipitacionSynop {
  return {
    estacionWmo: WMO,
    observadoEn,
    periodoHoras: opciones.periodoHoras ?? 6,
    precipitacionMm,
    traza: opciones.traza ?? false,
    seccion: opciones.seccion ?? 1,
  }
}

/** Registros reales de Corrientes (87166) usados en los escenarios de 24 h. */
function datosCorrientes(): PrecipitacionSynop[] {
  return [
    registro('2026-10-12T18:00:00Z', 13),
    registro('2026-10-13T00:00:00Z', 0.1),
    registro('2026-10-13T06:00:00Z', 0.6),
    registro('2026-10-13T12:00:00Z', 3, { seccion: 3 }),
    registro('2026-10-13T12:00:00Z', 16, { periodoHoras: 24 }),
    registro('2026-10-13T18:00:00Z', 0.2),
    registro('2026-10-14T00:00:00Z', 1),
  ]
}

describe('acumularSynop', () => {
  describe('ventana de 24 h', () => {
    it('suma los cuatro periodos de 6 h anteriores a la hora sinóptica previa', () => {
      const resultado = acumularSynop(datosCorrientes(), '2026-10-14T01:30:00Z', 24)

      expect(resultado).toEqual({
        acumuladoMm: 4.8,
        observadoEn: '2026-10-14T00:00:00.000Z',
        periodosCubiertos: 4,
        periodosEsperados: 4,
      })
    })

    it('usa la hora sinóptica exacta cuando asOf coincide con una (12:00 UTC)', () => {
      const resultado = acumularSynop(datosCorrientes(), '2026-10-13T12:00:00Z', 24)

      expect(resultado).toEqual({
        acumuladoMm: 16.7,
        observadoEn: '2026-10-13T12:00:00.000Z',
        periodosCubiertos: 4,
        periodosEsperados: 4,
      })
    })

    it('calcula con asOf entre sinópticas (13:00 UTC toma la de 12:00)', () => {
      const resultado = acumularSynop(datosCorrientes(), '2026-10-13T13:00:00Z', 24)

      expect(resultado?.acumuladoMm).toBe(16.7)
      expect(resultado?.observadoEn).toBe('2026-10-13T12:00:00.000Z')
    })

    it('usa el registro de 24 h como respaldo cuando falta un periodo de 6 h', () => {
      const datos = datosCorrientes().filter(
        (r) => !(r.periodoHoras === 6 && r.observadoEn === '2026-10-13T06:00:00Z'),
      )

      const resultado = acumularSynop(datos, '2026-10-13T12:00:00Z', 24)

      expect(resultado).toEqual({
        acumuladoMm: 16,
        observadoEn: '2026-10-13T12:00:00.000Z',
        periodosCubiertos: 4,
        periodosEsperados: 4,
      })
    })

    it('devuelve null si falta un periodo de 6 h y no hay registro de 24 h', () => {
      const datos = datosCorrientes().filter((r) => r.periodoHoras === 6)
      const sinHueco = datos.filter((r) => r.observadoEn !== '2026-10-13T06:00:00Z')

      expect(acumularSynop(sinHueco, '2026-10-13T12:00:00Z', 24)).toBeNull()
    })

    it('ignora los registros posteriores a asOf', () => {
      const datos = [
        ...datosCorrientes(),
        registro('2026-10-14T06:00:00Z', 50),
        registro('2026-10-14T12:00:00Z', 60, { periodoHoras: 24 }),
      ]

      const resultado = acumularSynop(datos, '2026-10-14T01:30:00Z', 24)

      expect(resultado?.acumuladoMm).toBe(4.8)
      expect(resultado?.observadoEn).toBe('2026-10-14T00:00:00.000Z')
    })

    it('prefiere la sección 1 sobre la sección 3 cuando ambas existen para el mismo fin', () => {
      const datos = [
        ...datosCorrientes(),
        registro('2026-10-14T00:00:00Z', 9, { seccion: 3 }),
      ]

      const resultado = acumularSynop(datos, '2026-10-14T01:30:00Z', 24)

      expect(resultado?.acumuladoMm).toBe(4.8)
    })
  })

  describe('ventana de 72 h', () => {
    /** Periodos de 6 h con fin en E, E-6h, ... (12 finales). */
    function periodosDe72h(fin: string, omitidos: readonly number[]): PrecipitacionSynop[] {
      const finMs = Date.parse(fin)
      return Array.from({ length: 12 }, (_, i) => i)
        .filter((i) => !omitidos.includes(i))
        .map((i) => registro(new Date(finMs - i * 6 * HORA_MS).toISOString(), 1))
    }

    it('suma los periodos presentes cuando hay al menos 10 de 12', () => {
      const datos = periodosDe72h('2026-10-14T00:00:00Z', [3, 7])

      const resultado = acumularSynop(datos, '2026-10-14T00:00:00Z', 72)

      expect(MIN_PERIODOS_72H).toBe(10)
      expect(resultado).toEqual({
        acumuladoMm: 10,
        observadoEn: '2026-10-14T00:00:00.000Z',
        periodosCubiertos: 10,
        periodosEsperados: 12,
      })
    })

    it('devuelve null cuando hay menos de 10 de 12 periodos', () => {
      const datos = periodosDe72h('2026-10-14T00:00:00Z', [1, 3, 7])

      expect(acumularSynop(datos, '2026-10-14T00:00:00Z', 72)).toBeNull()
    })
  })
})
