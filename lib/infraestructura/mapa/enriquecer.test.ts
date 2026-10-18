import { describe, expect, it } from 'vitest'
import type { EscuelaMapa, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import {
  derivarApoyo,
  derivarClases,
  enriquecerEscuela,
  esSinActualizar,
  gravedadDe,
} from './enriquecer'

const H = 60 * 60 * 1000
const ahora = Date.parse('2026-10-04T12:00:00Z')

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function parte(opciones: {
  actualizadaEn?: string
  abiertas?: number
  severidad?: ParteMapa['afectaciones'][number]['severidad']
  estadoEstablecimiento?: ParteMapa['estadoEstablecimiento']
  servicio?: ParteMapa['servicio']
  categoria?: ParteMapa['afectaciones'][number]['categoria']
} = {}): ParteMapa {
  const abiertas = opciones.abiertas ?? 1
  return {
    parteId: 'parte-1',
    cueAnexo: '123456789',
    nombre: 'Escuela de prueba',
    departamento: 'Capital',
    localidad: 'Ciudad',
    lat: -27.4,
    lon: -58.9,
    servicio: opciones.servicio ?? 'normal',
    estadoEstablecimiento: opciones.estadoEstablecimiento ?? 'habitual',
    peorSeveridad: opciones.severidad ?? 'Alta',
    categorias: [opciones.categoria ?? 'establecimiento'],
    afectaciones: Array.from({ length: abiertas }, (_, indice) => ({
      id: `afectacion-${indice}`,
      motivo: 'Lluvia',
      categoria: opciones.categoria ?? 'establecimiento',
      severidad: opciones.severidad ?? 'Alta',
      descripcion: null,
      rigeDesde: iso(ahora - (indice + 1) * H),
      creadaEn: iso(ahora - (indice + 1) * H),
    })),
    seccionesAlcanzadas: 1,
    alumnosDelHecho: 12,
    alumnosAlcanzados: 12,
    rigeDesde: iso(ahora - H),
    actualizadaEn: opciones.actualizadaEn ?? iso(ahora),
  }
}

function escuela(overrides: Partial<EscuelaMapa> = {}): EscuelaMapa {
  return {
    cueAnexo: '123456789',
    nombre: 'Escuela de prueba',
    departamento: 'Capital',
    localidad: 'Ciudad',
    lat: -27.4,
    lon: -58.9,
    estado: 'afectada',
    ...overrides,
  }
}

describe('esSinActualizar', () => {
  it('situación abierta sin novedades hace más de 72 h → true', () => {
    expect(esSinActualizar(parte({ actualizadaEn: iso(ahora - 73 * H), abiertas: 1 }), ahora)).toBe(true)
  })
  it('situación abierta actualizada hace 10 h → false', () => {
    expect(esSinActualizar(parte({ actualizadaEn: iso(ahora - 10 * H), abiertas: 1 }), ahora)).toBe(false)
  })
  it('todas las situaciones solucionadas → false aunque sea vieja', () => {
    expect(esSinActualizar(parte({ actualizadaEn: iso(ahora - 200 * H), abiertas: 0 }), ahora)).toBe(false)
  })
  it('escuela sin parte → false', () => {
    expect(esSinActualizar(undefined, ahora)).toBe(false)
  })
})

describe('derivarClases', () => {
  it.each([
    ['evacuado', 'suspendido', 'evacuado'],
    ['centro_evacuados', 'normal', 'centro'],
    ['habitual', 'suspendido', 'sin'],
    ['parcial', 'parcial', 'parcial'],
    ['habitual', 'normal', 'normal'],
  ] as const)('%s + %s → %s', (estado, servicio, esperado) => {
    expect(derivarClases(estado, servicio)).toBe(esperado)
  })
})

describe('derivarApoyo', () => {
  it('con clases normales no corresponde', () => {
    expect(derivarApoyo('normal', { brinda: true, modalidades: ['Cuadernillos impresos'] })).toBeNull()
  })
  it('sin clases y sin dato → sin_dato', () => expect(derivarApoyo('sin', null)).toBe('sin_dato'))
  it('ambas modalidades → ambos', () => {
    expect(derivarApoyo('sin', { brinda: true, modalidades: ['Asistencia virtual', 'Cuadernillos impresos'] })).toBe('ambos')
  })
  it('sólo modalidad virtual → virtual', () => {
    expect(derivarApoyo('sin', { brinda: true, modalidades: ['Asistencia virtual'] })).toBe('virtual')
  })
  it('sólo modalidad cuadernillo → cuadernillo', () => {
    expect(derivarApoyo('sin', { brinda: true, modalidades: ['Cuadernillos impresos'] })).toBe('cuadernillo')
    expect(derivarApoyo('sin', { brinda: true, modalidades: ['Cuadernillos digitales'] })).toBe('cuadernillo')
    expect(derivarApoyo('sin', { brinda: true, modalidades: ['Otras propuestas'] })).toBe('brinda')
  })
  it('brinda false → no', () => {
    expect(derivarApoyo('sin', { brinda: false, modalidades: ['Asistencia virtual'] })).toBe('no')
  })
  it('brinda true sin modalidades → brinda', () => {
    expect(derivarApoyo('sin', { brinda: true, modalidades: [] })).toBe('brinda')
  })
  it('clases parciales con dato ausente → sin_dato', () => expect(derivarApoyo('parcial', null)).toBe('sin_dato'))
})

describe('gravedadDe', () => {
  it('sin parte → 0', () => expect(gravedadDe(undefined)).toBe(0))
  it('usa la severidad de la situación principal', () => {
    expect(gravedadDe(parte({ severidad: 'Crítica' }))).toBe(4)
  })
})

describe('enriquecerEscuela', () => {
  it('deriva clases normales cuando el parte no tiene situaciones abiertas', () => {
    const original = escuela({ parte: parte({ estadoEstablecimiento: 'evacuado', abiertas: 0 }) })

    expect(enriquecerEscuela(original, {
      niveles: [], alumnos: 12, asistencia: null, situacionesHistoricas: 1, solucionadasRecientes: 0,
    }, ahora)).toMatchObject({ clases: 'normal', apoyo: null, alumnosSinClases: 0 })
  })

  it('ignora el edificio y el servicio del parte cuando sólo hay situaciones de alumnos', () => {
    const original = escuela({ parte: parte({
      estadoEstablecimiento: 'evacuado', servicio: 'suspendido', categoria: 'alumnos',
    }) })

    expect(enriquecerEscuela(original, {
      niveles: [], alumnos: 12, asistencia: null, situacionesHistoricas: 1, solucionadasRecientes: 0,
    }, ahora)).toMatchObject({ clases: 'normal', apoyo: null, alumnosSinClases: 0 })
  })

  it('conserva evacuado cuando hay una situación abierta de establecimiento', () => {
    const original = escuela({ parte: parte({ estadoEstablecimiento: 'evacuado' }) })

    expect(enriquecerEscuela(original, {
      niveles: [], alumnos: 12, asistencia: null, situacionesHistoricas: 1, solucionadasRecientes: 0,
    }, ahora).clases).toBe('evacuado')
  })

  it('conserva sin clases por servicio suspendido cuando hay situación de establecimiento', () => {
    const original = escuela({ parte: parte({ servicio: 'suspendido' }) })

    expect(enriquecerEscuela(original, {
      niveles: [], alumnos: 12, asistencia: null, situacionesHistoricas: 1, solucionadasRecientes: 0,
    }, ahora).clases).toBe('sin')
  })

  it('aplica el estado del establecimiento si hay situaciones de alumnos y establecimiento', () => {
    const original = escuela({ parte: {
      ...parte({ estadoEstablecimiento: 'evacuado', categoria: 'alumnos' }),
      categorias: ['alumnos', 'establecimiento'],
      afectaciones: [
        ...parte({ estadoEstablecimiento: 'evacuado', categoria: 'alumnos' }).afectaciones,
        { ...parte().afectaciones[0], id: 'afectacion-establecimiento', categoria: 'establecimiento' },
      ],
    } })

    expect(enriquecerEscuela(original, {
      niveles: [], alumnos: 12, asistencia: null, situacionesHistoricas: 2, solucionadasRecientes: 0,
    }, ahora).clases).toBe('evacuado')
  })

  it('construye los datos enriquecidos del padrón y del parte', () => {
    const original = escuela({ parte: {
      ...parte({ actualizadaEn: iso(ahora - 73 * H), severidad: 'Media' }),
      servicio: 'suspendido',
    } })

    expect(enriquecerEscuela(original, {
      niveles: ['Primario', 'Inicial', 'Primario'],
      alumnos: 42,
      asistencia: { brinda: true, modalidades: ['Cuadernillos impresos'] },
      situacionesHistoricas: 7,
      solucionadasRecientes: 3,
    }, ahora)).toMatchObject({
      niveles: ['Inicial', 'Primario'],
      alumnos: 42,
      clases: 'sin',
      apoyo: 'cuadernillo',
      sinActualizar: true,
      gravedad: 2,
      categoriaPrincipal: 'establecimiento',
      ultimaNovedad: iso(ahora - 73 * H),
      alumnosSinClases: 42,
      situacionesHistoricas: 7,
      solucionadasRecientes: 3,
      parte: original.parte,
    })
  })
})
