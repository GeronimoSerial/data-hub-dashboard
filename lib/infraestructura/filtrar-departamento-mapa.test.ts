import { describe, expect, it } from 'vitest'
import type { ParteMapa } from './parte-mapa'
import { filtrarDepartamentoMapa } from './filtrar-departamento-mapa'

const ahora = Date.parse('2026-09-23T12:00:00Z')

function parte(cueAnexo: string, departamento: string, servicio: ParteMapa['servicio']): ParteMapa {
  return {
    parteId: cueAnexo,
    cueAnexo,
    nombre: cueAnexo,
    departamento,
    localidad: 'Otra localidad',
    lat: -28,
    lon: -58,
    servicio,
    estadoEstablecimiento: 'habitual',
    peorSeveridad: 'Alta',
    categorias: ['establecimiento'],
    afectaciones: [],
    seccionesAlcanzadas: 2,
    alumnosAlcanzados: 10,
    rigeDesde: '2026-09-20T00:00:00Z',
    actualizadaEn: '2026-09-23T11:00:00Z',
  }
}

describe('filtrarDepartamentoMapa', () => {
  const partes = [
    parte('a', 'CONCEPCION', 'suspendido'),
    parte('b', 'CONCEPCIÓN', 'parcial'),
    parte('c', 'CAPITAL', 'normal'),
  ]
  const data = {
    partes,
    indicadores: {
      escuelas: 3, conServicioSuspendido: 1, conServicioParcial: 1,
      evacuadas: 0, centrosDeEvacuados: 0, sinReportar: 0,
      alumnosAlcanzados: 30, seccionesAlcanzadas: 6,
    },
  }

  it('mantiene los datos del servidor cuando no hay departamento seleccionado', () => {
    expect(filtrarDepartamentoMapa(data, null, ahora)).toBe(data)
  })

  it('muestra las variantes de nombre y recalcula indicadores sin otra petición', () => {
    const visible = filtrarDepartamentoMapa(data, 'Concepción', ahora)
    expect(visible.partes.map((p) => p.cueAnexo)).toEqual(['a', 'b'])
    expect(visible.indicadores).toMatchObject({
      escuelas: 2,
      conServicioSuspendido: 1,
      conServicioParcial: 1,
      alumnosAlcanzados: 20,
      seccionesAlcanzadas: 4,
    })
  })
})
