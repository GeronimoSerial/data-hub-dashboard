import { describe, expect, it } from 'vitest'
import { destinoParaParte, enlaceDestino } from './destino-carga'
import type { ParteActual } from './parte-consulta'
import type { Afectacion, Parte, ServicioAlcance } from './trayectoria-tipos'

const AHORA = '2026-09-18T10:00:00.000Z'
const FUTURO = '2099-01-01T00:00:00.000Z'

function parte(overrides: Partial<Parte> = {}): Parte {
  return {
    id: 'parte-1',
    periodoId: 'periodo-1',
    cueAnexo: '1800001-00',
    corteId: 1,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: AHORA,
    creadaEn: AHORA,
    actualizadaEn: AHORA,
    ...overrides,
  } as Parte
}

function alcanceEstablecimiento(estado: ServicioAlcance['estado']): ServicioAlcance {
  return {
    id: 'sa-1',
    parteId: 'parte-1',
    tipo: 'establecimiento',
    referenciaId: null,
    estado,
    creadaEn: AHORA,
    rigeDesde: AHORA,
    retiradaEn: null,
  } as ServicioAlcance
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

  it('sin afectaciones y con el edificio en la normalidad manda al primer reporte', () => {
    expect(destinoParaParte(actual())).toBe('nuevo')
  })

  // Tras cerrar la última afectación, un edificio o servicio fuera de lo normal
  // no puede quedar sin salida: /actualizar es la pantalla que ofrece restablecerlo.
  it.each(['evacuado', 'centro_evacuados', 'parcial'] as const)(
    'sin afectaciones con el edificio %s manda a actualizar para restablecerlo',
    (estadoEstablecimiento) => {
      expect(destinoParaParte(actual({ parte: parte({ estadoEstablecimiento }) }))).toBe('actualizar')
    },
  )

  it('sin afectaciones con el servicio suspendido en todo el establecimiento manda a actualizar', () => {
    const destino = destinoParaParte(
      actual({ servicioAlcance: [alcanceEstablecimiento('suspendido')] }),
    )

    expect(destino).toBe('actualizar')
  })

  it('sin afectaciones con el servicio suspendido en un turno manda a actualizar', () => {
    const destino = destinoParaParte(
      actual({
        servicioAlcance: [{ ...alcanceEstablecimiento('suspendido'), tipo: 'turno', referenciaId: 'Mañana' } as ServicioAlcance],
      }),
    )

    expect(destino).toBe('actualizar')
  })

  it('sin afectaciones y con el servicio suspendido ya retirado manda al primer reporte', () => {
    const destino = destinoParaParte(
      actual({ servicioAlcance: [{ ...alcanceEstablecimiento('suspendido'), retiradaEn: AHORA } as ServicioAlcance] }),
    )

    expect(destino).toBe('nuevo')
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
