import { beforeAll, describe, expect, it } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { infraAfectacion, infraAfectacionAlumno, infraAfectacionSeccion, infraMovimiento, infraParte, infraServicioAlcance } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import {
  armarFichaParte,
  listarMovimientosDescritos,
  obtenerParteActual,
  obtenerPeriodoVigente,
  snapshotDesde,
} from './parte-consulta'

const CUE = '1801605-31'

usarDbTemporal('parte-consulta', { seed: false, env: { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } })

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 20, '${CUE}', '1', 'B', 'PRIMARIA', 'MAÑANA')`,
  )
  for (let i = 0; i < 5; i++) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
      args: [i],
    })
  }
  for (let i = 100; i < 105; i++) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 20, ?)',
      args: [i],
    })
  }

  await ensureSeeded()
})

describe('obtenerPeriodoVigente', () => {
  it('devuelve el período sembrado por el backfill como vigente', async () => {
    const periodo = await obtenerPeriodoVigente()
    expect(periodo).toEqual({ id: PERIODO_ENOS_2026_2027_ID, nombre: expect.any(String) })
  })
})

describe('obtenerParteActual', () => {
  it('devuelve parte: null cuando no existe parte para el CUE, sin lanzar', async () => {
    const actual = await obtenerParteActual('9999999-99', 1)
    expect(actual).not.toBeNull()
    expect(actual?.parte).toBeNull()
    expect(actual?.afectaciones).toEqual([])
    expect(actual?.servicioAlcance).toEqual([])
  })

  it('arma afectaciones con sección completa (matrícula íntegra) y parcial (intersección)', async () => {
    const db = getDb()
    const parteId = crypto.randomUUID()
    const ahora = new Date().toISOString()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: CUE,
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: ahora,
      corteId: 1,
      creadaEn: ahora,
      actualizadaEn: ahora,
    })

    const afectacionCompletaId = crypto.randomUUID()
    await db.insert(infraAfectacion).values({
      id: afectacionCompletaId,
      parteId,
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: null,
      rigeDesde: ahora,
      creadaEn: ahora,
      retiradaEn: null,
    })
    await db.insert(infraAfectacionSeccion).values({ afectacionId: afectacionCompletaId, geSectionId: 10 })

    const afectacionParcialId = crypto.randomUUID()
    await db.insert(infraAfectacion).values({
      id: afectacionParcialId,
      parteId,
      motivo: 'Anegamiento',
      categoria: 'alumnos',
      severidad: 'Media',
      descripcion: null,
      rigeDesde: ahora,
      creadaEn: ahora,
      retiradaEn: null,
    })
    await db.insert(infraAfectacionSeccion).values({ afectacionId: afectacionParcialId, geSectionId: 20 })
    await db.insert(infraAfectacionAlumno).values([
      { afectacionId: afectacionParcialId, gePersonId: 100 },
      { afectacionId: afectacionParcialId, gePersonId: 101 },
    ])

    const actual = await obtenerParteActual(CUE, 1)
    expect(actual).not.toBeNull()
    expect(actual?.parte?.id).toBe(parteId)

    const completa = actual!.afectaciones.find((a) => a.id === afectacionCompletaId)!
    expect(completa.secciones).toEqual([{ geSectionId: 10, seccionCompleta: true, alumnos: expect.arrayContaining([0, 1, 2, 3, 4]) }])
    expect(completa.secciones[0].alumnos).toHaveLength(5)

    const parcial = actual!.afectaciones.find((a) => a.id === afectacionParcialId)!
    expect(parcial.secciones).toEqual([
      { geSectionId: 20, seccionCompleta: false, alumnos: expect.arrayContaining([100, 101]) },
    ])
    expect(parcial.secciones[0].alumnos).toHaveLength(2)
  })

  it('excluye del snapshot vigente una afectación retirada en el pasado', async () => {
    const db = getDb()
    const parteId = crypto.randomUUID()
    const ahora = new Date().toISOString()
    const pasado = new Date(Date.now() - 60_000).toISOString()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: '1801605-32',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: ahora,
      corteId: 1,
      creadaEn: ahora,
      actualizadaEn: ahora,
    })
    const retiradaId = crypto.randomUUID()
    await db.insert(infraAfectacion).values({
      id: retiradaId,
      parteId,
      motivo: 'Tormenta severa',
      categoria: 'establecimiento',
      severidad: 'Baja',
      descripcion: null,
      rigeDesde: pasado,
      creadaEn: pasado,
      retiradaEn: pasado,
    })
    const vigenteId = crypto.randomUUID()
    await db.insert(infraAfectacion).values({
      id: vigenteId,
      parteId,
      motivo: 'Sin energía o agua',
      categoria: 'establecimiento',
      severidad: 'Baja',
      descripcion: null,
      rigeDesde: pasado,
      creadaEn: pasado,
      retiradaEn: null,
    })

    const actual = await obtenerParteActual('1801605-32', 1)
    const snapshot = snapshotDesde(actual!)
    expect(snapshot.afectaciones.map((a) => a.id)).toEqual([vigenteId])
  })

  it('excluye del snapshot vigente una afectación con rigeDesde futuro', async () => {
    const db = getDb()
    const parteId = crypto.randomUUID()
    const ahora = new Date().toISOString()
    const futuro = new Date(Date.now() + 60 * 60_000).toISOString()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: '1801605-33',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: ahora,
      corteId: 1,
      creadaEn: ahora,
      actualizadaEn: ahora,
    })
    const futuraId = crypto.randomUUID()
    await db.insert(infraAfectacion).values({
      id: futuraId,
      parteId,
      motivo: 'Evacuación preventiva',
      categoria: 'establecimiento',
      severidad: 'Crítica',
      descripcion: null,
      rigeDesde: futuro,
      creadaEn: ahora,
      retiradaEn: null,
    })

    const actual = await obtenerParteActual('1801605-33', 1)
    const snapshot = snapshotDesde(actual!)
    expect(snapshot.afectaciones).toEqual([])
  })

  it('servicioAlcance de tipo turno lleva la etiqueta del propio turno', async () => {
    const db = getDb()
    const parteId = crypto.randomUUID()
    const ahora = new Date().toISOString()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: '1801605-34',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: ahora,
      corteId: 1,
      creadaEn: ahora,
      actualizadaEn: ahora,
    })
    await db.insert(infraServicioAlcance).values({
      id: crypto.randomUUID(),
      parteId,
      tipo: 'turno',
      referenciaId: 'MAÑANA',
      estado: 'suspendido',
      rigeDesde: ahora,
      creadaEn: ahora,
      retiradaEn: null,
    })

    const actual = await obtenerParteActual('1801605-34', 1)
    expect(actual?.servicioAlcance).toEqual([
      expect.objectContaining({ tipo: 'turno', referenciaId: 'MAÑANA', etiqueta: 'MAÑANA' }),
    ])
  })
})

describe('armarFichaParte', () => {
  it('devuelve ficha con parte: null cuando no existe parte para el CUE, sin lanzar', async () => {
    const ficha = await armarFichaParte('9999999-99', 1)
    expect(ficha).not.toBeNull()
    expect(ficha?.parte).toBeNull()
    expect(ficha?.afectaciones).toEqual([])
  })

  it('arma totales por afectación a partir de las secciones vigentes (CUE con parte de un test anterior)', async () => {
    // Reutiliza el parte que 'obtenerParteActual' arma en el describe de
    // arriba para CUE: una afectación con sección completa (5 alumnos) y
    // otra con intersección (2 alumnos) — evita re-sembrar el mismo estado.
    const ficha = await armarFichaParte(CUE, 1)
    expect(ficha).not.toBeNull()
    expect(ficha?.parte).not.toBeNull()

    const completa = ficha!.afectaciones.find((a) => a.motivo === 'Inundación')!
    expect(completa.totales).toEqual({ secciones: 1, alumnos: 5 })

    const parcial = ficha!.afectaciones.find((a) => a.motivo === 'Anegamiento')!
    expect(parcial.totales).toEqual({ secciones: 1, alumnos: 2 })

    // Nunca resuelve nombres: cada sección sólo trae ids de alumno crudos.
    expect(completa.secciones[0].alumnos.every((id) => typeof id === 'number')).toBe(true)
  })

  it('ultimaActualizacion refleja actualizadaEn del parte', async () => {
    const ficha = await armarFichaParte(CUE, 1)
    expect(ficha?.ultimaActualizacion).not.toBeNull()
    expect(ficha?.ultimaActualizacion).toBe(ficha?.parte?.actualizadaEn)
  })
})

describe('listarMovimientosDescritos', () => {
  const CUE_MOVIMIENTOS = '1801605-40'

  it('sin parte para el CUE, devuelve un arreglo vacío', async () => {
    const movimientos = await listarMovimientosDescritos('9999999-98', 1)
    expect(movimientos).toEqual([])
  })

  it('devuelve los movimientos en orden más nuevo primero, con cambios no vacíos', async () => {
    const db = getDb()
    const parteId = crypto.randomUUID()
    const antiguo = new Date(Date.now() - 60_000).toISOString()
    const reciente = new Date().toISOString()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: CUE_MOVIMIENTOS,
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: antiguo,
      corteId: 1,
      creadaEn: antiguo,
      actualizadaEn: reciente,
    })
    await db.insert(infraMovimiento).values([
      {
        id: crypto.randomUUID(),
        parteId,
        tipo: 'reporte_inicial',
        rol: 'director',
        resumen: {
          serviciosCambiados: [],
          afectacionesAgregadas: [
            { afectacionId: crypto.randomUUID(), motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', secciones: 0, alumnos: 0 },
          ],
          afectacionesRetiradas: [],
          severidadesCambiadas: [],
          alcancesCambiados: [],
          establecimientoCambiado: null,
        },
        rigeDesde: antiguo,
        creadaEn: antiguo,
      },
      {
        id: crypto.randomUUID(),
        parteId,
        tipo: 'actualizacion',
        rol: 'director',
        resumen: {
          serviciosCambiados: [],
          afectacionesAgregadas: [],
          afectacionesRetiradas: [{ afectacionId: crypto.randomUUID(), motivo: 'Inundación' }],
          severidadesCambiadas: [],
          alcancesCambiados: [],
          establecimientoCambiado: null,
        },
        rigeDesde: reciente,
        creadaEn: reciente,
      },
    ])

    const movimientos = await listarMovimientosDescritos(CUE_MOVIMIENTOS, 1)
    expect(movimientos).toHaveLength(2)
    expect(movimientos[0].tipo).toBe('actualizacion')
    expect(movimientos[1].tipo).toBe('reporte_inicial')
    for (const movimiento of movimientos) {
      expect(movimiento.cambios.length).toBeGreaterThan(0)
    }
  })
  it('incluye la evidencia fotográfica con su propio título sin romper el historial', async () => {
    const db = getDb()
    const cue = '1801605-41'
    const parteId = crypto.randomUUID()
    const baseId = crypto.randomUUID()
    const ahora = new Date().toISOString()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: cue,
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: ahora,
      corteId: 1,
      creadaEn: ahora,
      actualizadaEn: ahora,
    })
    await db.insert(infraMovimiento).values({
      id: crypto.randomUUID(),
      parteId,
      tipo: 'evidencia_fotografica',
      rol: 'director',
      resumen: { documentaMovimientoId: baseId, attachmentIds: [crypto.randomUUID()] },
      rigeDesde: ahora,
      creadaEn: ahora,
    })

    const movimientos = await listarMovimientosDescritos(cue, 1)
    expect(movimientos).toHaveLength(1)
    expect(movimientos[0].titulo).toBe('Se agregó evidencia fotográfica')
    expect(movimientos[0].cambios).toEqual([])
    expect(movimientos[0].severidad).toBeNull()
  })
})
