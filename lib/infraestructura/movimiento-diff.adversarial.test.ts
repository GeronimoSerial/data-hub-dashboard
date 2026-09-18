import { describe, expect, it } from 'vitest'
import { diffParte, esDiffVacio } from './movimiento-diff'
import { crearSnapshotVacio } from './trayectoria-tipos'
import type { Afectacion, ParteSnapshot, ServicioAlcance } from './trayectoria-tipos'

function baseAfectacion(): Afectacion {
  return {
    id: 'af-1',
    parteId: 'parte-1',
    motivo: 'Inundacion',
    categoria: 'establecimiento',
    severidad: 'Alta',
    descripcion: null,
    rigeDesde: '2026-09-18T10:00:00.000Z',
    creadaEn: '2026-09-18T10:00:00.000Z',
    retiradaEn: null,
    secciones: [{ geSectionId: 1, seccionCompleta: true, alumnos: [10, 11] }],
  }
}

function snapshotConAfectacion(afectacion: Afectacion): ParteSnapshot {
  return { ...crearSnapshotVacio('habitual'), afectaciones: [afectacion] }
}

describe('diffParte frente a cambios sobre una afectación existente (mismo id)', () => {
  it('detecta un cambio de motivo manteniendo id y alcance idénticos', () => {
    const antes = snapshotConAfectacion(baseAfectacion())

    const despuesAfectacion = { ...baseAfectacion(), motivo: 'Inundacion por desborde' }
    const despues = snapshotConAfectacion(despuesAfectacion)

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(false)
    expect(diff.datosCambiados).toEqual([
      {
        afectacionId: 'af-1',
        motivo: 'Inundacion por desborde',
        campos: [{ campo: 'motivo', de: 'Inundacion', a: 'Inundacion por desborde' }],
        seccionesConSeleccionCambiada: [],
      },
    ])
  })

  it('detecta un cambio de categoria manteniendo id y alcance idénticos', () => {
    const antes = snapshotConAfectacion(baseAfectacion())

    const despuesAfectacion = { ...baseAfectacion(), categoria: 'alumnos' as const }
    const despues = snapshotConAfectacion(despuesAfectacion)

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(false)
    expect(diff.datosCambiados).toEqual([
      {
        afectacionId: 'af-1',
        motivo: 'Inundacion',
        campos: [{ campo: 'categoria', de: 'establecimiento', a: 'alumnos' }],
        seccionesConSeleccionCambiada: [],
      },
    ])
  })

  it('detecta un cambio de descripcion (null -> texto) manteniendo id y alcance idénticos', () => {
    const antes = snapshotConAfectacion(baseAfectacion())

    const despuesAfectacion = { ...baseAfectacion(), descripcion: 'texto nuevo' }
    const despues = snapshotConAfectacion(despuesAfectacion)

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(false)
  })

  it('detecta un cambio de seccionCompleta en la misma sección con los mismos alumnos', () => {
    const antes = snapshotConAfectacion(baseAfectacion())

    const despuesAfectacion = {
      ...baseAfectacion(),
      secciones: [{ geSectionId: 1, seccionCompleta: false, alumnos: [10, 11] }],
    }
    const despues = snapshotConAfectacion(despuesAfectacion)

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(false)
  })

  it('reporta diff vacío cuando el servicioAlcance es idéntico en ambos snapshots', () => {
    const fila: ServicioAlcance = {
      id: 'sa-1',
      parteId: 'parte-1',
      tipo: 'establecimiento',
      referenciaId: null,
      estado: 'normal',
      rigeDesde: '2026-09-18T10:30:00.000Z',
      creadaEn: '2026-09-18T10:30:00.000Z',
      retiradaEn: null,
    }

    const antes = { ...crearSnapshotVacio('habitual'), servicioAlcance: [fila] }
    const despues = { ...crearSnapshotVacio('habitual'), servicioAlcance: [{ ...fila }] }

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(true)
  })
})
/*
  Regresión encontrada en el navegador el 2026-09-18, en la pantalla de
  actualización: al abrirla, SIN tocar nada, el resumen declaraba "24 alumnos
  retirados de Anegamiento", "60 alumnos retirados de Acceso interrumpido"…
  para las cuatro afectaciones vigentes, y "Revisar cambios" quedaba
  habilitado en contra de spec §17.

  Causa: una sección marcada como completa significa "todos los alumnos de esa
  sección, quienes sean". El lado "antes" enumera ese padrón desde la
  respuesta de la API, y el lado "después" lo reconstruye desde el contexto
  del corte (`turnos`), que puede entregar la sección SIN padrón —por ejemplo
  cuando las identidades de los alumnos no se pueden resolver—. Comparar las
  dos enumeraciones hacía que el mismo hecho, sin cambio alguno, se leyera
  como un vaciado masivo.

  Regla: si la sección está completa de los dos lados, su padrón enumerado no
  puede generar diff. Un cambio real de completitud lo sigue reportando
  diffDatosAfectacion vía `seccionesConSeleccionCambiada`.
*/
describe('secciones completas: el padrón enumerado no debe generar diff', () => {
  it('no hay cambio cuando la sección está completa de los dos lados aunque el padrón venga vacío de un lado', () => {
    const antes = snapshotConAfectacion(baseAfectacion())
    const despues = snapshotConAfectacion({
      ...baseAfectacion(),
      secciones: [{ geSectionId: 1, seccionCompleta: true, alumnos: [] }],
    })

    const diff = diffParte(antes, despues)

    expect(diff.alcancesCambiados).toEqual([])
    expect(esDiffVacio(diff)).toBe(true)
  })

  it('tampoco al revés: el padrón vacío del lado "antes" no se lee como alta masiva', () => {
    const antes = snapshotConAfectacion({
      ...baseAfectacion(),
      secciones: [{ geSectionId: 1, seccionCompleta: true, alumnos: [] }],
    })
    const despues = snapshotConAfectacion(baseAfectacion())

    expect(esDiffVacio(diffParte(antes, despues))).toBe(true)
  })

  // La regla NO debe tapar cambios reales.
  it('sigue detectando el paso de sección completa a selección nominal', () => {
    const antes = snapshotConAfectacion(baseAfectacion())
    const despues = snapshotConAfectacion({
      ...baseAfectacion(),
      secciones: [{ geSectionId: 1, seccionCompleta: false, alumnos: [10] }],
    })

    const diff = diffParte(antes, despues)

    expect(esDiffVacio(diff)).toBe(false)
    expect(diff.datosCambiados[0]?.seccionesConSeleccionCambiada).toContain(1)
    expect(diff.alcancesCambiados[0]?.alumnosRetirados).toBe(1)
  })

  it('sigue contando altas y bajas entre dos selecciones nominales', () => {
    const antes = snapshotConAfectacion({
      ...baseAfectacion(),
      secciones: [{ geSectionId: 1, seccionCompleta: false, alumnos: [10, 11] }],
    })
    const despues = snapshotConAfectacion({
      ...baseAfectacion(),
      secciones: [{ geSectionId: 1, seccionCompleta: false, alumnos: [11, 12] }],
    })

    const diff = diffParte(antes, despues)

    expect(diff.alcancesCambiados[0]).toMatchObject({ alumnosAgregados: 1, alumnosRetirados: 1 })
  })

  it('sigue contando las secciones completas agregadas o retiradas enteras', () => {
    const antes = snapshotConAfectacion(baseAfectacion())
    const despues = snapshotConAfectacion({
      ...baseAfectacion(),
      secciones: [
        { geSectionId: 1, seccionCompleta: true, alumnos: [10, 11] },
        { geSectionId: 2, seccionCompleta: true, alumnos: [20] },
      ],
    })

    const diff = diffParte(antes, despues)

    expect(diff.alcancesCambiados[0]).toMatchObject({ seccionesAgregadas: 1, alumnosAgregados: 1 })
  })
})
