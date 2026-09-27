import { describe, expect, it } from 'vitest'
import type { EscuelaMapa, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import {
  COLOR_SIN_AFECTACION,
  construirEscuelasMapaFeatureCollection,
} from './construir-escuelas-mapa-feature-collection'

// Parte mínimo pero con el shape real de ParteMapa: sólo se cargan los campos
// que la función consulta, el resto queda con valores neutros.
function parte(overrides: Partial<ParteMapa> = {}): ParteMapa {
  return {
    parteId: 'parte-1',
    cueAnexo: '1800001',
    nombre: 'Escuela Afectada',
    departamento: 'Capital',
    localidad: 'Corrientes',
    lat: -27.46,
    lon: -58.83,
    servicio: 'normal',
    estadoEstablecimiento: 'habitual',
    peorSeveridad: 'Baja',
    categorias: [],
    afectaciones: [],
    seccionesAlcanzadas: 0,
    alumnosAlcanzados: 0,
    rigeDesde: '2026-09-01T00:00:00.000Z',
    actualizadaEn: '2026-09-27T00:00:00.000Z',
    ...overrides,
  }
}

function escuelaAfectada(overrides: Partial<EscuelaMapa> = {}): EscuelaMapa {
  const p = parte(overrides.parte ?? {})
  return {
    cueAnexo: p.cueAnexo,
    nombre: p.nombre,
    departamento: p.departamento,
    localidad: p.localidad,
    lat: p.lat,
    lon: p.lon,
    estado: 'afectada',
    parte: p,
    ...overrides,
  }
}

function escuelaSinAfectacion(overrides: Partial<EscuelaMapa> = {}): EscuelaMapa {
  return {
    cueAnexo: '1800002',
    nombre: 'Escuela Sin Reportar',
    departamento: 'Goya',
    localidad: 'Goya',
    lat: -29.14,
    lon: -59.26,
    estado: 'sin_afectacion_reportada',
    ...overrides,
  }
}

describe('construirEscuelasMapaFeatureCollection', () => {
  it("una escuela 'afectada' usa el color de severidad y estado 'afectada'", () => {
    const escuela = escuelaAfectada({ parte: parte({ peorSeveridad: 'Crítica' }) })
    // peorSeveridad se lleve al parte; el cueAnexo/nombre de la escuela también.
    escuela.cueAnexo = '1800001'

    const fc = construirEscuelasMapaFeatureCollection([escuela], null)

    expect(fc.features).toHaveLength(1)
    const props = fc.features[0].properties
    expect(props.color).toBe('#F4492E')
    expect(props.severidad).toBe('Crítica')
    expect(props.estado).toBe('afectada')
  })

  it("una escuela 'sin_afectacion_reportada' usa el gris sin-afectación y valores neutros", () => {
    const fc = construirEscuelasMapaFeatureCollection([escuelaSinAfectacion()], null)

    expect(fc.features).toHaveLength(1)
    const props = fc.features[0].properties
    expect(props.color).toBe('#8a8886')
    expect(props.color).toBe(COLOR_SIN_AFECTACION)
    expect(props.servicio).toBe('normal')
    expect(props.severidadRango).toBe(0)
    expect(props.sinReportar).toBe(false)
    expect(props.esEvacuado).toBe(false)
    expect(props.estado).toBe('sin_afectacion_reportada')
  })

  it('excluye escuelas sin lat o sin lon aunque vengan en la entrada', () => {
    const sinLat = escuelaSinAfectacion({ cueAnexo: 'X1', lat: null, lon: -58 })
    const sinLon = escuelaSinAfectacion({ cueAnexo: 'X2', lat: -27, lon: null })
    const valida = escuelaSinAfectacion({ cueAnexo: 'V1' })

    const fc = construirEscuelasMapaFeatureCollection([sinLat, sinLon, valida], null)

    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].properties.cueAnexo).toBe('V1')
  })

  it('el orden y la cantidad de features coincide con las escuelas válidas de entrada', () => {
    const entrada = [
      escuelaAfectada({ cueAnexo: 'A' }),
      escuelaSinAfectacion({ cueAnexo: 'B' }),
      escuelaSinAfectacion({ cueAnexo: 'C', lat: null }),
      escuelaAfectada({ cueAnexo: 'D' }),
    ]

    const fc = construirEscuelasMapaFeatureCollection(entrada, null)

    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(3)
    expect(fc.features.map((f) => f.properties.cueAnexo)).toEqual(['A', 'B', 'D'])
    expect(fc.features.map((f) => f.geometry.coordinates)).toEqual([
      [entrada[0].lon, entrada[0].lat],
      [entrada[1].lon, entrada[1].lat],
      [entrada[3].lon, entrada[3].lat],
    ])
  })
})
