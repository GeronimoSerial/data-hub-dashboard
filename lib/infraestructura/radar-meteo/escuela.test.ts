import { describe, expect, it } from 'vitest'
import { pronosticoEscuela } from './escuela'
import { interpolarBilineal as interpolacionUi } from '@/components/mapas/radar-meteo/escalas'

describe('pronóstico puntual de escuela', () => {
  it('usa el mismo resultado bilineal que la implementación compartida con la UI', () => {
    const datos = {
      times: ['2026-10-01T00:00:00.000Z', '2026-10-01T01:00:00.000Z'],
      cells: [
        { id: 'noroeste', row: -137, col: -294, lat: -27.4, lon: -58.8 },
        { id: 'noreste', row: -137, col: -293, lat: -27.4, lon: -58.6 },
        { id: 'sudoeste', row: -138, col: -294, lat: -27.6, lon: -58.8 },
        { id: 'sudeste', row: -138, col: -293, lat: -27.6, lon: -58.6 },
      ],
      values: {
        precipitation: [[0, 4], [10, 14], [20, 24], [30, 34]],
        wind_gusts_10m: [[10, 10], [20, 20], [30, 30], [40, 40]],
        weather_code: [[3, 3], [3, 3], [3, 3], [3, 3]],
      },
    }
    const escuela = { cueAnexo: '1801605-04', nombre: 'Escuela', lat: -27.5, lon: -58.7, departamento: 'Capital' }
    const pronostico = pronosticoEscuela(datos, escuela, new Date('2026-10-01T00:00:00.000Z'))
    const esperadoUi = interpolacionUi({ filas: 2, columnas: 2 }, [0, 10, 20, 30], 0.5, 0.5)
    expect(pronostico.horas[0].lluviaMm.valor).toBe(esperadoUi)
    expect(pronostico.horas[0].lluviaMm.metodo).toBe('bilineal')
  })
})
