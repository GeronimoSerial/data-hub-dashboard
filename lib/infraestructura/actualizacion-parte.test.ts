// Pruebas del puente entre el estado de edición del formulario y el motor de
// diffing puro (spec §13): cubren la fotografía "después" armada en pantalla
// y el payload de POST /api/problematicas/parte. Framework-free: nada acá
// toca el DOM ni React, así que no hace falta jsdom.
import { describe, expect, it } from 'vitest'
import type { AfectacionVigente } from '@/components/infraestructura/estado-actual-textos'
import type { TurnoContexto } from './contexto'
import type { ParteSnapshot, ServicioAlcance } from './trayectoria-tipos'
import {
  afectacionVigenteABorrador,
  construirPayloadActualizacion,
  snapshotAntesDeVigente,
  snapshotDespuesDeFormulario,
  type AfectacionActualizable,
  type ServicioSeleccionado,
} from './actualizacion-parte'
import { diffParte, esDiffVacio } from './movimiento-diff'

function alumnoAfectado(gePersonId: number) {
  return { gePersonId, nombre: 'Nombre', apellido: 'Apellido' }
}

const BASE_SERVICIO = {
  parteId: 'parte-1',
  rigeDesde: '2026-09-18T10:30:00.000Z',
  creadaEn: '2026-09-18T10:30:00.000Z',
  retiradaEn: null,
} as const

function servicio(overrides: Partial<ServicioAlcance> & { id: string }): ServicioAlcance {
  return {
    ...BASE_SERVICIO,
    tipo: 'seccion',
    referenciaId: '10',
    estado: 'suspendido',
    etiqueta: '2.º A',
    ...overrides,
  }
}

// Corte vigente usado por snapshotDespuesDeFormulario: la sección 10 tiene
// matrícula vacía, así que una afectación sobre esa sección resuelve a
// "sección completa con 0 alumnos" — y el diff contra el estado vigente
// correspondiente queda vacío de punta a punta.
const TURNOS: TurnoContexto[] = [
  {
    turno: 'Mañana',
    niveles: [
      {
        nivel: 'Primaria',
        secciones: [
          {
            geSectionId: 10,
            curso: '2.º',
            division: 'A',
            nivel: 'Primaria',
            turno: 'Mañana',
            matricula: 0,
            alumnos: [],
          },
        ],
      },
    ],
  },
]

const VIGENTE: AfectacionVigente = {
  id: 'af-1',
  motivo: 'Inundación',
  categoria: 'establecimiento',
  severidad: 'Media',
  descripcion: null,
  rigeDesde: '2026-09-17T16:20:00.000Z',
  secciones: [{ geSectionId: 10, seccionCompleta: true, alumnos: [] }],
  totales: { secciones: 1, alumnos: 0 },
}

const ANTES: ParteSnapshot = snapshotAntesDeVigente({
  parte: { estadoEstablecimiento: 'habitual' },
  afectaciones: [VIGENTE],
  servicio: { alcanceVigente: [] },
})

function baseBorrador(): AfectacionActualizable {
  return afectacionVigenteABorrador(VIGENTE)
}

function despuesDeFormulario(afectaciones: AfectacionActualizable[]): ParteSnapshot {
  return snapshotDespuesDeFormulario({
    estadoEstablecimientoVigente: 'habitual',
    estadoEstablecimientoSeleccionado: '',
    servicioAlcanceVigente: [],
    servicioSeleccionado: null,
    afectaciones,
    turnos: TURNOS,
  })
}

// Vigente con una sección completa (2 alumnos) y una parcial (1 de 3
// seleccionado): el caso que ejercita la lógica de alumnos de
// afectacionVigenteABorrador y construirPayloadActualizacion.
const VIGENTE_PAYLOAD: AfectacionVigente = {
  id: 'af-1',
  motivo: 'Inundación',
  categoria: 'establecimiento',
  severidad: 'Media',
  descripcion: 'Aula inundada',
  rigeDesde: '2026-09-17T16:20:00.000Z',
  secciones: [
    { geSectionId: 10, seccionCompleta: true, alumnos: [alumnoAfectado(101), alumnoAfectado(102)] },
    { geSectionId: 20, seccionCompleta: false, alumnos: [alumnoAfectado(201)] },
  ],
  totales: { secciones: 2, alumnos: 3 },
}

describe('afectacionVigenteABorrador', () => {
  it('conserva el id vigente y solo arrastra los alumnos de las secciones parciales', () => {
    const vigente: AfectacionVigente = {
      id: 'af-1',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Media',
      descripcion: 'Aula afectada',
      rigeDesde: '2026-09-17T16:20:00.000Z',
      secciones: [
        { geSectionId: 10, seccionCompleta: true, alumnos: [alumnoAfectado(101), alumnoAfectado(102)] },
        // La sección matricula 3 alumnos, pero la selección vigente es 1.
        { geSectionId: 20, seccionCompleta: false, alumnos: [alumnoAfectado(201)] },
      ],
      totales: { secciones: 2, alumnos: 3 },
    }

    const borrador = afectacionVigenteABorrador(vigente)

    expect(borrador.origenId).toBe('af-1')
    expect(borrador.retirada).toBe(false)
    expect(borrador.secciones).toEqual([10, 20])
    // La sección completa no arrastra a sus 2 alumnos: solo el de la parcial.
    expect(borrador.alumnos).toEqual([201])
  })
})

describe('snapshotAntesDeVigente', () => {
  it('arma el snapshot desde la respuesta de GET con estado evacuado', () => {
    const snapshot = snapshotAntesDeVigente({
      parte: { estadoEstablecimiento: 'evacuado' },
      afectaciones: [
        {
          id: 'af-1',
          motivo: 'Inundación',
          categoria: 'establecimiento',
          severidad: 'Media',
          descripcion: null,
          rigeDesde: '2026-09-17T16:20:00.000Z',
          secciones: [
            { geSectionId: 10, seccionCompleta: true, alumnos: [alumnoAfectado(101), alumnoAfectado(102)] },
          ],
          totales: { secciones: 1, alumnos: 2 },
        },
      ],
      servicio: { alcanceVigente: [servicio({ id: 's-1' })] },
    })

    expect(snapshot.estadoEstablecimiento).toBe('evacuado')
    expect(snapshot.afectaciones).toHaveLength(1)
    expect(snapshot.afectaciones[0].secciones).toEqual([
      { geSectionId: 10, seccionCompleta: true, alumnos: [101, 102] },
    ])
    expect(snapshot.servicioAlcance).toHaveLength(1)
  })

  it('sin parte vigente usa los valores por defecto', () => {
    const snapshot = snapshotAntesDeVigente({ parte: null })

    expect(snapshot.estadoEstablecimiento).toBe('habitual')
    expect(snapshot.afectaciones).toEqual([])
    expect(snapshot.servicioAlcance).toEqual([])
  })
})

describe('snapshotDespuesDeFormulario y diffParte', () => {
  it('una afectación vigente sin tocar produce un diff vacío de punta a punta', () => {
    const despues = despuesDeFormulario([baseBorrador()])
    const diff = diffParte(ANTES, despues)

    expect(esDiffVacio(diff)).toBe(true)
  })

  it('cambiar la severidad en el formulario se refleja como severidadesCambiadas', () => {
    const despues = despuesDeFormulario([{ ...baseBorrador(), severidad: 'Alta' }])
    const diff = diffParte(ANTES, despues)

    expect(esDiffVacio(diff)).toBe(false)
    expect(diff.severidadesCambiadas).toEqual([
      { afectacionId: 'af-1', motivo: 'Inundación', de: 'Media', a: 'Alta' },
    ])
  })

  it('retirar una afectación vigente la saca del snapshot después', () => {
    const despues = despuesDeFormulario([{ ...baseBorrador(), retirada: true }])

    expect(despues.afectaciones).toEqual([])

    const diff = diffParte(ANTES, despues)
    expect(diff.afectacionesRetiradas).toEqual([{ afectacionId: 'af-1', motivo: 'Inundación' }])
  })

  it('una afectación nueva (origenId null) aparece como agregada', () => {
    const nueva: AfectacionActualizable = {
      clientId: 'cliente-nueva-1',
      origenId: null,
      retirada: false,
      categoria: 'establecimiento',
      motivo: 'Otro motivo',
      severidad: 'Baja',
      secciones: [10],
      alumnos: [],
      descripcion: '',
    }
    const despues = despuesDeFormulario([baseBorrador(), nueva])
    const diff = diffParte(ANTES, despues)

    expect(diff.afectacionesAgregadas).toEqual([
      {
        afectacionId: 'cliente-nueva-1',
        motivo: 'Otro motivo',
        categoria: 'establecimiento',
        severidad: 'Baja',
        secciones: 1,
        alumnos: 0,
      },
    ])
  })
})

describe('construirPayloadActualizacion', () => {
  function payload(
    overrides: Partial<Parameters<typeof construirPayloadActualizacion>[0]> = {},
  ) {
    return construirPayloadActualizacion({
      cue: '14000000-0',
      idempotencyKey: 'idempotencia-1',
      rigeDesde: '2026-09-18T10:30:00.000Z',
      afectaciones: [],
      vigentes: [],
      servicioSeleccionado: null,
      estadoEstablecimientoSeleccionado: '',
      ...overrides,
    })
  }

  it('una afectación vigente sin cambios no genera una modificación espuria', () => {
    const resultado = payload({
      afectaciones: [afectacionVigenteABorrador(VIGENTE_PAYLOAD)],
      vigentes: [VIGENTE_PAYLOAD],
    })

    expect(resultado.afectacionesModificadas).toEqual([])
  })

  it('cambiar solo la severidad manda id y severidad, sin secciones ni alumnos', () => {
    const resultado = payload({
      afectaciones: [{ ...afectacionVigenteABorrador(VIGENTE_PAYLOAD), severidad: 'Alta' }],
      vigentes: [VIGENTE_PAYLOAD],
    })

    expect(resultado.afectacionesModificadas).toEqual([{ id: 'af-1', severidad: 'Alta' }])
  })

  it('una afectación nueva va a afectacionesNuevas sin alumnos cuando no seleccionó', () => {
    const nueva: AfectacionActualizable = {
      clientId: 'cliente-nueva-1',
      origenId: null,
      retirada: false,
      categoria: 'establecimiento',
      motivo: 'Otro motivo',
      severidad: 'Baja',
      secciones: [10],
      alumnos: [],
      descripcion: '',
    }
    const resultado = payload({ afectaciones: [nueva] })

    expect(resultado.afectacionesNuevas).toHaveLength(1)
    expect(resultado.afectacionesNuevas[0]).toMatchObject({
      motivo: 'Otro motivo',
      severidad: 'Baja',
      secciones: [10],
    })
    expect(resultado.afectacionesNuevas[0].alumnos).toBeUndefined()
  })

  it('retirar una afectación vigente la manda a afectacionesRetiradas y no a modificadas', () => {
    const resultado = payload({
      afectaciones: [
        { ...afectacionVigenteABorrador(VIGENTE_PAYLOAD), retirada: true, severidad: 'Alta' },
      ],
      vigentes: [VIGENTE_PAYLOAD],
    })

    expect(resultado.afectacionesRetiradas).toEqual(['af-1'])
    expect(resultado.afectacionesModificadas).toEqual([])
  })

  it('el servicio educativo viaja solo si el director lo seleccionó', () => {
    const sinSeleccion = payload()
    expect(sinSeleccion.servicioEducativo).toBeUndefined()

    const seleccion: ServicioSeleccionado = {
      estado: 'suspendido',
      alcance: { tipo: 'turno', turnos: ['Mañana'] },
    }
    const conSeleccion = payload({ servicioSeleccionado: seleccion })
    expect(conSeleccion.servicioEducativo).toEqual({
      estado: 'suspendido',
      alcance: { tipo: 'turno', turnos: ['Mañana'] },
    })
  })

  it('la situación del establecimiento viaja solo si fue elegida', () => {
    const sinCambio = payload()
    expect(sinCambio.estadoEstablecimiento).toBeUndefined()

    const conCambio = payload({ estadoEstablecimientoSeleccionado: 'evacuado' })
    expect(conCambio.estadoEstablecimiento).toEqual({ estado: 'evacuado' })
  })
})