import { describe, expect, it } from 'vitest'
import {
  ETIQUETA_ESTABLECIMIENTO,
  ETIQUETA_SERVICIO,
  formatearMomento,
  resumirAlcance,
  rigeDesdeDelServicio,
  sinSituacionEnSeguimiento,
  type EstadoActualRespuesta,
} from './estado-actual-textos'
import type { ServicioAlcance } from '@/lib/infraestructura/trayectoria-tipos'

function alcance(id: string, rigeDesde: string): ServicioAlcance {
  return {
    id,
    parteId: 'p1',
    tipo: 'establecimiento',
    referenciaId: null,
    estado: 'suspendido',
    rigeDesde,
    creadaEn: rigeDesde,
    retiradaEn: null,
  }
}

describe('resumirAlcance', () => {
  it('uses the spec §6 shape "3 secciones · 74 alumnos"', () => {
    expect(resumirAlcance({ secciones: 3, alumnos: 74 })).toBe('3 secciones · 74 alumnos')
  })

  it('keeps singulars readable', () => {
    expect(resumirAlcance({ secciones: 1, alumnos: 1 })).toBe('1 sección · 1 alumno')
  })

  it('omits the student half instead of printing "0 alumnos"', () => {
    expect(resumirAlcance({ secciones: 2, alumnos: 0 })).toBe('2 secciones')
  })

  it('says so plainly when nothing is reported', () => {
    expect(resumirAlcance({ secciones: 0, alumnos: 0 })).toBe('Sin secciones ni alumnos informados')
  })
})

describe('formatearMomento', () => {
  it('renders the spec §6 "18 de septiembre, 10:30" shape in provincial time', () => {
    // 13:30Z is 10:30 in America/Argentina/Buenos_Aires (UTC-3).
    expect(formatearMomento('2026-09-18T13:30:00.000Z')).toBe('18 de septiembre, 10:30')
  })

  it('returns null when there is nothing to show', () => {
    expect(formatearMomento(null)).toBeNull()
    expect(formatearMomento(undefined)).toBeNull()
  })

  it('falls back to the raw value rather than printing "Invalid Date"', () => {
    expect(formatearMomento('no es una fecha')).toBe('no es una fecha')
  })
})

describe('rigeDesdeDelServicio', () => {
  it('takes the most recent vigente scope', () => {
    expect(
      rigeDesdeDelServicio([
        alcance('a', '2026-09-17T10:00:00.000Z'),
        alcance('b', '2026-09-18T13:30:00.000Z'),
      ]),
    ).toBe('2026-09-18T13:30:00.000Z')
  })

  it('returns null with no scopes at all', () => {
    expect(rigeDesdeDelServicio([])).toBeNull()
    expect(rigeDesdeDelServicio(undefined)).toBeNull()
  })
})

describe('sinSituacionEnSeguimiento', () => {
  const base: EstadoActualRespuesta = {
    ok: true,
    periodo: { id: 'per1', nombre: 'ENOS 2026/2027' },
    parte: {
      id: 'p1',
      cueAnexo: '180001000',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: '2026-09-18T13:30:00.000Z',
      actualizadaEn: '2026-09-18T13:35:00.000Z',
    },
    afectaciones: [],
  }

  it('is true when there is no provincial period open', () => {
    expect(sinSituacionEnSeguimiento({ ok: true, periodo: null, parte: null })).toBe(true)
  })

  it('is true when the parte was never opened', () => {
    expect(sinSituacionEnSeguimiento({ ...base, parte: null })).toBe(true)
  })

  it('is true when the parte has no vigente afectación', () => {
    expect(sinSituacionEnSeguimiento(base)).toBe(true)
  })

  it('is false as soon as one afectación is vigente', () => {
    expect(
      sinSituacionEnSeguimiento({
        ...base,
        afectaciones: [
          {
            id: 'a1',
            motivo: 'Inundación del establecimiento',
            categoria: 'establecimiento',
            severidad: 'Alta',
            descripcion: null,
            rigeDesde: '2026-09-18T13:30:00.000Z',
            secciones: [],
            totales: { secciones: 3, alumnos: 74 },
          },
        ],
      }),
    ).toBe(false)
  })
})

describe('vocabulary', () => {
  it('shows "Clases parcialmente suspendidas" as a derived label (spec §3.4)', () => {
    expect(ETIQUETA_SERVICIO.parcial).toBe('Clases parcialmente suspendidas')
    expect(ETIQUETA_SERVICIO.normal).toBe('Clases normales')
    expect(ETIQUETA_SERVICIO.suspendido).toBe('Clases suspendidas')
  })

  it('names the establishment states as spec §3.5 does', () => {
    expect(ETIQUETA_ESTABLECIMIENTO.habitual).toBe('Funcionamiento habitual')
    expect(ETIQUETA_ESTABLECIMIENTO.evacuado).toBe('Establecimiento evacuado')
    expect(ETIQUETA_ESTABLECIMIENTO.centro_evacuados).toBe('Utilizado como centro de evacuados')
  })
})
