import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { infraAfectacion, infraAfectacionAlumno, infraAfectacionSeccion, infraMovimiento, infraParte, infraServicioAlcance } from '@/lib/db/schema'
import { ensureGeSchema, openGeDb } from './ge-db'
import {
  armarFichaParte,
  listarMovimientosDescritos,
  obtenerParteActual,
  obtenerPeriodoVigente,
  snapshotDesde,
} from './parte-consulta'

const CUE = '1801605-31'

let dir: string
let prevDataDir: string | undefined
let prevAdminEmail: string | undefined
let prevAdminPassword: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'parte-consulta-'))
  prevDataDir = process.env.DATA_DIR
  prevAdminEmail = process.env.ADMIN_EMAIL
  prevAdminPassword = process.env.ADMIN_PASSWORD
  process.env.DATA_DIR = dir
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    await ge.execute(
      `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 20, '${CUE}', '1', 'B', 'PRIMARIA', 'MAÑANA')`,
    )
    for (let i = 0; i < 5; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
        args: [i],
      })
    }
    for (let i = 100; i < 105; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 20, ?)',
        args: [i],
      })
    }
  } finally {
    ge.close()
  }

  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevAdminEmail === undefined) delete process.env.ADMIN_EMAIL
  else process.env.ADMIN_EMAIL = prevAdminEmail
  if (prevAdminPassword === undefined) delete process.env.ADMIN_PASSWORD
  else process.env.ADMIN_PASSWORD = prevAdminPassword
  rmSync(dir, { recursive: true, force: true })
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
})
