import { describe, expect, it } from 'vitest'
import { destinoParaParte, enlaceDestino } from './destino-carga'
import type { ParteActual } from './parte-consulta'
import type { Afectacion, Parte } from './trayectoria-tipos'

const AHORA = '2026-09-18T10:00:00.000Z'
const FUTURO = '2099-01-01T00:00:00.000Z'

function parte(): Parte {
  return {
    id: 'parte-1',
    periodoId: 'periodo-1',
    cueAnexo: '1800001-00',
    corteId: 1,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: AHORA,
    creadaEn: AHORA,
    actualizadaEn: AHORA,
  } as Parte
}

function afectacion(overrides: Partial<Afectacion> = {}): Afectacion {
  return {
    id: 'af-1',
    parteId: 'parte-1',
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    descripcion: null,
    rigeDesde: AHORA,
    creadaEn: AHORA,
    retiradaEn: null,
    secciones: [{ geSectionId: 1, seccionCompleta: true, alumnos: [] }],
    ...overrides,
  }
}

function actual(overrides: Partial<ParteActual> = {}): ParteActual {
  return {
    periodo: { id: 'periodo-1', nombre: 'ENOS 2026' },
    parte: parte(),
    afectaciones: [],
    servicioAlcance: [],
    secciones: [],
    ...overrides,
  }
}

describe('destinoParaParte', () => {
  it('sin período vigente manda al primer reporte', () => {
    expect(destinoParaParte(null)).toBe('nuevo')
  })

  it('con período pero sin parte iniciado manda al primer reporte', () => {
    expect(destinoParaParte(actual({ parte: null }))).toBe('nuevo')
  })

  // Mismo criterio que sinSituacionEnSeguimiento (§17): un parte sin ninguna
  // afectación vigente no es una situación en seguimiento, así que no hay
  // nada que actualizar.
  it('con un parte cuyas afectaciones fueron todas retiradas manda al primer reporte', () => {
    const destino = destinoParaParte(
      actual({ afectaciones: [afectacion({ retiradaEn: AHORA })] }),
    )

    expect(destino).toBe('nuevo')
  })

  it('una afectación que todavía no entró en vigencia no cuenta como situación en seguimiento', () => {
    const destino = destinoParaParte(actual({ afectaciones: [afectacion({ rigeDesde: FUTURO })] }))

    expect(destino).toBe('nuevo')
  })

  it('con al menos una afectación vigente manda a actualizar', () => {
    expect(destinoParaParte(actual({ afectaciones: [afectacion()] }))).toBe('actualizar')
  })
})

describe('enlaceDestino', () => {
  it('conserva el CUE del enlace, escapado', () => {
    expect(enlaceDestino('actualizar', '1800001-00')).toBe(
      '/problematicas/parte/actualizar?cue=1800001-00',
    )
    expect(enlaceDestino('nuevo', 'a b')).toBe('/problematicas/parte/nuevo?cue=a%20b')
  })
})
