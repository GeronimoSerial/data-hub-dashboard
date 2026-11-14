import { describe, expect, it } from 'vitest'
import { fechaCorta } from './alertas-agrupadas'
import { fechaD1 } from './verificacion'
import { pronosticoEscuela } from './escuela'

const INSTANTE = '2026-11-12T15:30:00Z'

describe('zona horaria regional en radar-meteo', () => {
  it('fechaCorta de alertas formatea en la hora de Corrientes', () => {
    expect(fechaCorta(INSTANTE)).toBe('jue 12, 12:30')
  })

  it('fechaD1 cambia de día según la medianoche de Corrientes', () => {
    expect(fechaD1(new Date('2026-11-12T02:30:00Z'))).toBe('2026-11-10')
    expect(fechaD1(new Date(INSTANTE))).toBe('2026-11-11')
  })

  it('pronosticoEscuela informa la zona regional y agrupa los días por fecha local', () => {
    const datos = {
      times: [INSTANTE, '2026-11-12T23:30:00Z'],
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
    const pronostico = pronosticoEscuela(datos, escuela, new Date(INSTANTE))
    expect(pronostico.zonaHoraria).toBe('America/Argentina/Buenos_Aires')
    expect(pronostico.dias.map((d) => d.fecha)).toEqual(['2026-11-12'])
  })
})
