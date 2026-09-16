import { createClient, type Client } from '@libsql/client'
import path from 'node:path'
import { getDataDir } from '../data-dir'
import type { GeCorte } from './types'

// Subconjunto de Client que también satisface una Transaction de libsql:
// permite que attachGe y las consultas de impacto.ts / identidad.ts corran
// tanto sobre una conexión suelta como dentro de una transacción explícita
// (ver app/api/infraestructura/nominal/route.ts, que loguea el acceso en la
// misma transacción que sirve la respuesta).
export type EjecutorSql = Pick<Client, 'execute'>

export function getGeSqlitePath(): string {
  return path.join(getDataDir(), 'ge.sqlite')
}

const GE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS ge_corte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ciclo_lectivo INTEGER NOT NULL,
    fetched_at TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('importando','vigente','historico'))
  )`,
  `CREATE TABLE IF NOT EXISTS ge_seccion (
    corte_id INTEGER NOT NULL,
    ge_section_id INTEGER NOT NULL,
    cue_anexo TEXT NOT NULL,
    curso TEXT NOT NULL,
    division TEXT NOT NULL,
    nivel TEXT NOT NULL,
    turno TEXT NOT NULL,
    PRIMARY KEY (corte_id, ge_section_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ge_alumno_seccion (
    corte_id INTEGER NOT NULL,
    ge_section_id INTEGER NOT NULL,
    ge_person_id INTEGER NOT NULL,
    PRIMARY KEY (corte_id, ge_section_id, ge_person_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ge_localizacion (
    cue_anexo TEXT PRIMARY KEY,
    cui TEXT,
    nombre TEXT NOT NULL,
    departamento TEXT NOT NULL,
    localidad TEXT NOT NULL,
    lat REAL,
    lon REAL,
    geo_calidad TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ge_alumno_identidad (
    ge_person_id INTEGER PRIMARY KEY,
    payload_cifrado TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ge_seccion_corte_cue ON ge_seccion (corte_id, cue_anexo)`,
  `CREATE INDEX IF NOT EXISTS idx_ge_alumno_seccion_corte_section ON ge_alumno_seccion (corte_id, ge_section_id)`,
]

export function openGeDb(): Client {
  return createClient({ url: `file:${getGeSqlitePath()}` })
}

export async function ensureGeSchema(client: Client): Promise<void> {
  for (const stmt of GE_DDL) {
    await client.execute(stmt)
  }
}

// Monta ge.sqlite como base adjunta 'ge' de solo-lectura sobre una conexión existente (p.ej. la del Hub).
// NUNCA hardcodees la ruta: siempre getGeSqlitePath(). Escapá comillas simples en la ruta duplicándolas.
export async function attachGe(hostClient: EjecutorSql): Promise<void> {
  const gePath = getGeSqlitePath().replace(/'/g, "''")
  await hostClient.execute(`ATTACH DATABASE 'file:${gePath}?mode=ro' AS ge`)
}

export async function getCorteVigente(client: Client): Promise<GeCorte | null> {
  const res = await client.execute(
    "SELECT id, ciclo_lectivo as cicloLectivo, fetched_at as fetchedAt, estado FROM ge_corte WHERE estado = 'vigente' ORDER BY id DESC LIMIT 1",
  )
  if (res.rows.length === 0) return null
  const row = res.rows[0] as unknown as GeCorte
  return row
}

export async function activarCorte(client: Client, corteId: number): Promise<void> {
  const corte = await client.execute('SELECT id, estado FROM ge_corte WHERE id = ?', [corteId])
  if (corte.rows.length === 0) {
    throw new Error(`Corte ${corteId} no existe`)
  }
  const estado = corte.rows[0].estado as string
  if (estado !== 'importando') {
    throw new Error(`Corte ${corteId} no está en estado 'importando'`)
  }

  const seccionesSinLocalizacion = await client.execute(
    `SELECT COUNT(*) AS n FROM ge_seccion s
     WHERE s.corte_id = ? AND NOT EXISTS (
       SELECT 1 FROM ge_localizacion l WHERE l.cue_anexo = s.cue_anexo
     )`,
    [corteId],
  )
  const seccionesFallan = Number(seccionesSinLocalizacion.rows[0].n)
  if (seccionesFallan > 0) {
    throw new Error(`${seccionesFallan} secciones referencian cue_anexo inexistente en ge_localizacion`)
  }

  const membresiasHuerfanas = await client.execute(
    `SELECT COUNT(*) AS n FROM ge_alumno_seccion m
     WHERE m.corte_id = ? AND NOT EXISTS (
       SELECT 1 FROM ge_seccion s WHERE s.corte_id = m.corte_id AND s.ge_section_id = m.ge_section_id
     )`,
    [corteId],
  )
  const membresiasFallan = Number(membresiasHuerfanas.rows[0].n)
  if (membresiasFallan > 0) {
    throw new Error(`${membresiasFallan} membresías apuntan a ge_seccion inexistente`)
  }

  const tx = await client.transaction('write')
  try {
    await tx.execute({
      sql: "UPDATE ge_corte SET estado = 'historico' WHERE estado = 'vigente' AND id != ?",
      args: [corteId],
    })
    await tx.execute({ sql: "UPDATE ge_corte SET estado = 'vigente' WHERE id = ?", args: [corteId] })
    await tx.commit()
  } catch (err) {
    try {
      await tx.rollback()
    } catch {
      // noop: si el commit ya cerró la transacción, el error original manda
    }
    throw err
  }
}
