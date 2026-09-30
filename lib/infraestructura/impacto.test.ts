import { describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, getRawClient } from '../db'
import { infraAfectacion, infraAfectacionSeccion, infraParte } from '../db/schema'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { calcularImpactoSecciones, obtenerCorteYSeccionesDeAfectacion } from './impacto'

usarDbTemporal('impacto', { seed: false })

// DB1/F2: GE vive en el schema `ge` de la base PGlite compartida, así que cada
// test limpia sus tablas y vuelve a sembrar (antes cada test abría su ge.sqlite).
async function seedGe() {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute('DELETE FROM ge.ge_alumno_seccion')
  await client.execute('DELETE FROM ge.ge_seccion')
  await client.execute('DELETE FROM ge.ge_localizacion')
  await client.execute('DELETE FROM ge.ge_corte')
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    "INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', NULL, 'Escuela 4', 'ER', 'Parana')",
  )
  await client.execute(
    "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
  )
  await client.execute(
    "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 20, '1801605-04', '1', 'B', 'PRIMARIA', 'MAÑANA')",
  )
  for (let i = 0; i < 25; i++) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
      args: [i],
    })
  }
  for (let i = 100; i < 125; i++) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 20, ?)',
      args: [i],
    })
  }
  // Una tercera sección del mismo CUE, deliberadamente fuera de la alerta:
  // si el cálculo tomara la matrícula del establecimiento en vez de las
  // secciones elegidas, este alumnado se filtraría al total.
  await client.execute(
    "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 30, '1801605-04', '2', 'A', 'PRIMARIA', 'TARDE')",
  )
  for (let i = 200; i < 250; i++) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 30, ?)',
      args: [i],
    })
  }
}

describe('calcularImpactoSecciones', () => {
  it('dos secciones de 25 alumnos distintos producen 50, no la matrícula total del CUE', async () => {
    await seedGe()
    const client = crearEjecutorSql(getRawClient())
    const impacto = await calcularImpactoSecciones(client, { corteId: 1, geSectionIds: [10, 20] })
    expect(impacto.alumnos).toBe(50)
    expect(impacto.secciones).toBe(2)
    expect(impacto.calculoIncompleto).toBe(false)
  })

  it('no duplica un alumno matriculado en dos secciones seleccionadas', async () => {
    await seedGe()
    const client = crearEjecutorSql(getRawClient())
    await client.execute(
      'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 20, 5)',
    )
    const impacto = await calcularImpactoSecciones(client, { corteId: 1, geSectionIds: [10, 20] })
    expect(impacto.alumnos).toBe(50)
  })

  it('marca cálculo incompleto cuando una sección no se resuelve en el corte, sin descartar las demás', async () => {
    await seedGe()
    const client = crearEjecutorSql(getRawClient())
    const impacto = await calcularImpactoSecciones(client, { corteId: 1, geSectionIds: [10, 9999] })
    expect(impacto.alumnos).toBe(25)
    expect(impacto.calculoIncompleto).toBe(true)
    expect(impacto.seccionesIrresolubles).toBe(1)
  })

  it('informa la matrícula por CUI como no disponible, nunca como cero', async () => {
    await seedGe()
    const client = crearEjecutorSql(getRawClient())
    const impacto = await calcularImpactoSecciones(client, { corteId: 1, geSectionIds: [10] })
    expect(impacto.cuiDisponible).toBe(false)
    expect(impacto.cuis).toBeNull()
  })

  it('devuelve un resultado vacío y no incompleto cuando no hay secciones', async () => {
    await seedGe()
    const client = crearEjecutorSql(getRawClient())
    const impacto = await calcularImpactoSecciones(client, { corteId: 1, geSectionIds: [] })
    expect(impacto.alumnos).toBe(0)
    expect(impacto.calculoIncompleto).toBe(false)
  })
})

// F3.3: obtenerCorteYSeccionesDeAfectacion resuelve corte/secciones sobre el
// modelo de parte (infra_afectacion + infra_parte). Usa getDb()/ensureSeeded()
// (schema tipado + HUB_DDL): hace falta el modelo de parte completo, que sólo
// ensureSeeded() da de alta.
//
// Los dos casos (afectación existente / inexistente) viven en un único `it`:
// getDb() memoiza la conexión a nivel de módulo, y el resto de este archivo
// usa beforeEach para dar a cada test su propio directorio — un segundo test
// que llame a getDb() reusaría la conexión ya memoizada del primero, apuntando
// a un directorio que el afterEach ya borró.
describe('obtenerCorteYSeccionesDeAfectacion', () => {
  it('devuelve el corteId del parte (no de la afectación) y sus geSectionIds; una afectacionId inexistente devuelve null', async () => {
    const { ensureSeeded, PERIODO_ENOS_2026_2027_ID } = await import('../db/seed')
    await ensureSeeded()

    const db = getDb()
    const ahora = new Date().toISOString()

    const parteId = crypto.randomUUID()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: '1801605-88',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: ahora,
      // corteId vive en infra_parte: la función bajo prueba debe leerlo de
      // acá, nunca de infra_afectacion (que no tiene esa columna).
      corteId: 42,
      creadaEn: ahora,
      actualizadaEn: ahora,
    })

    const afectacionId = crypto.randomUUID()
    await db.insert(infraAfectacion).values({
      id: afectacionId,
      parteId,
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: null,
      rigeDesde: ahora,
      creadaEn: ahora,
      retiradaEn: null,
    })
    await db.insert(infraAfectacionSeccion).values([
      { afectacionId, geSectionId: 10 },
      { afectacionId, geSectionId: 20 },
    ])

    const referencia = await obtenerCorteYSeccionesDeAfectacion(afectacionId)
    expect(referencia).not.toBeNull()
    expect(referencia?.corteId).toBe(42)
    expect(referencia?.geSectionIds.sort()).toEqual([10, 20])

    const referenciaInexistente = await obtenerCorteYSeccionesDeAfectacion('afectacion-que-no-existe')
    expect(referenciaInexistente).toBeNull()
  })
})
