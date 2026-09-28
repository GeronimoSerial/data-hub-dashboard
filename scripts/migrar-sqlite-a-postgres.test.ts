import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import snapshot from '../drizzle/meta/0000_snapshot.json'
import { migrar } from './migrar-sqlite-a-postgres.mjs'

// La carpeta de migraciones de drizzle-kit se resuelve relativa a este archivo
// (no al cwd) para que el test funcione sin importar desde dónde se invoque.
const CARPETA_MIGRACIONES = fileURLToPath(new URL('../drizzle', import.meta.url))

// ---------------------------------------------------------------------------
// Fixtures: origen SQLite temporal (siempre bajo os.tmpdir(), nunca en el repo)
// y destino PGlite en memoria, aislado por test.
// ---------------------------------------------------------------------------

interface Origen {
  dir: string
  hub: Client
  ge: Client
  abrirOrigen: (nombre: string) => Client
  limpiar: () => void
}

const limpiezas: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const limpiar of limpiezas.splice(0)) await limpiar()
})

function crearOrigen(): Origen {
  const dir = mkdtempSync(join(tmpdir(), 'migrar-sqlite-test-'))
  const hub = createClient({ url: `file:${join(dir, 'hub.sqlite')}` })
  const ge = createClient({ url: `file:${join(dir, 'ge.sqlite')}` })
  limpiezas.push(() => {
    hub.close()
    ge.close()
    rmSync(dir, { recursive: true, force: true })
  })
  return {
    dir,
    hub,
    ge,
    abrirOrigen: (nombre) => (nombre.startsWith('ge_') ? ge : hub),
    limpiar: () => {
      hub.close()
      ge.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

async function crearDestino() {
  const pglite = new PGlite()
  const db = drizzle(pglite, { schema })
  const clienteDestino = crearEjecutorSql(pglite)
  limpiezas.push(() => pglite.close())
  const asegurarDestino = async () => {
    await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES })
    await ensureGeSchema(clienteDestino)
  }
  return { pglite, db, clienteDestino, asegurarDestino }
}

// Subconjunto real del schema, suficiente para cada caso. `user` cubre boolean
// y timestamp de better-auth; niveles/tipos/categorias/recursos cubren PK text,
// jsonb y una FK real; las 5 ge.* cubren el SQL directo y el setval final.
const DDL_HUB = [
  `CREATE TABLE niveles (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, orden INTEGER NOT NULL)`,
  `CREATE TABLE tipos (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, aplica_a TEXT NOT NULL)`,
  `CREATE TABLE categorias (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, color TEXT NOT NULL)`,
  `CREATE TABLE recursos (
    id TEXT PRIMARY KEY, titulo TEXT NOT NULL, descripcion TEXT NOT NULL, formato TEXT NOT NULL,
    nivel_id TEXT NOT NULL, tipo_id TEXT NOT NULL, categoria_id TEXT NOT NULL, area TEXT NOT NULL,
    actualizado TEXT NOT NULL, estado TEXT NOT NULL, ruta TEXT, storage_key TEXT, mime TEXT,
    nombre_original TEXT, size INTEGER
  )`,
  `CREATE TABLE user (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, role TEXT,
    banned INTEGER DEFAULT 0, ban_reason TEXT, ban_expires INTEGER
  )`,
]

const DDL_GE = [
  `CREATE TABLE ge_corte (id INTEGER PRIMARY KEY, ciclo_lectivo INTEGER NOT NULL, fetched_at TEXT NOT NULL, estado TEXT NOT NULL)`,
  `CREATE TABLE ge_localizacion (cue_anexo TEXT PRIMARY KEY, cui TEXT, nombre TEXT NOT NULL, departamento TEXT NOT NULL, localidad TEXT NOT NULL, lat REAL, lon REAL, geo_calidad TEXT)`,
  `CREATE TABLE ge_alumno_identidad (ge_person_id INTEGER PRIMARY KEY, payload_cifrado TEXT NOT NULL)`,
  `CREATE TABLE ge_seccion (corte_id INTEGER NOT NULL, ge_section_id INTEGER NOT NULL, cue_anexo TEXT NOT NULL, curso TEXT NOT NULL, division TEXT NOT NULL, nivel TEXT NOT NULL, turno TEXT NOT NULL, PRIMARY KEY (corte_id, ge_section_id))`,
  `CREATE TABLE ge_alumno_seccion (corte_id INTEGER NOT NULL, ge_section_id INTEGER NOT NULL, ge_person_id INTEGER NOT NULL, PRIMARY KEY (corte_id, ge_section_id, ge_person_id))`,
]

async function prepararOrigen(origen: Origen) {
  await origen.hub.batch(DDL_HUB, 'write')
  await origen.ge.batch(DDL_GE, 'write')
}

describe('migrar (SQLite -> Postgres/PGlite)', () => {
  it('convierte una columna jsonb a un valor parseado y usable', async () => {
    const destino = await crearDestino()
    const origen = crearOrigen()
    await prepararOrigen(origen)

    await origen.hub.execute({
      sql: `INSERT INTO tipos (id, nombre, aplica_a) VALUES (?, ?, ?)`,
      args: ['t1', 'Guia', JSON.stringify(['docentes', 'familias'])],
    })

    await migrar({
      ...destino,
      schemaPg: schema,
      snapshot,
      abrirOrigen: origen.abrirOrigen,
      log: () => {},
    })

    const filas = await destino.db.select({ aplicaA: schema.tipos.aplicaA }).from(schema.tipos)
    expect(filas).toHaveLength(1)
    expect(filas[0].aplicaA).toEqual(['docentes', 'familias'])
  })

  it('convierte una columna boolean de 0/1 a true/false', async () => {
    const destino = await crearDestino()
    const origen = crearOrigen()
    await prepararOrigen(origen)

    await origen.hub.batch(
      [
        {
          sql: `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, banned) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: ['u0', 'Sin ban', 'u0@example.com', 1, 1700000000000, 1700000000000, 0],
        },
        {
          sql: `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, banned) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: ['u1', 'Con ban', 'u1@example.com', 0, 1700000000000, 1700000000000, 1],
        },
      ],
      'write',
    )

    await migrar({
      ...destino,
      schemaPg: schema,
      snapshot,
      abrirOrigen: origen.abrirOrigen,
      log: () => {},
    })

    const filas = await destino.db
      .select({ id: schema.user.id, banned: schema.user.banned })
      .from(schema.user)
    const porId = new Map(filas.map((f) => [f.id, f.banned]))
    expect(porId.get('u0')).toBe(false)
    expect(porId.get('u1')).toBe(true)
  })

  it('convierte el epoch-ms de una columna timestamp de better-auth a Date', async () => {
    const destino = await crearDestino()
    const origen = crearOrigen()
    await prepararOrigen(origen)

    await origen.hub.execute({
      sql: `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, ban_expires) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ['u1', 'Ana', 'ana@example.com', 1, 1700000000000, 1700000001000, 1700000002000],
    })

    await migrar({
      ...destino,
      schemaPg: schema,
      snapshot,
      abrirOrigen: origen.abrirOrigen,
      log: () => {},
    })

    const filas = await destino.db
      .select({
        createdAt: schema.user.createdAt,
        updatedAt: schema.user.updatedAt,
        banExpires: schema.user.banExpires,
      })
      .from(schema.user)
    expect(filas).toHaveLength(1)
    expect(filas[0].createdAt).toBeInstanceOf(Date)
    expect(filas[0].createdAt?.getTime()).toBe(1700000000000)
    expect(filas[0].updatedAt.getTime()).toBe(1700000001000)
    expect(filas[0].banExpires?.getTime()).toBe(1700000002000)
  })

  it('inserta el hijo después del padre sin violar la FK real', async () => {
    const destino = await crearDestino()
    const origen = crearOrigen()
    await prepararOrigen(origen)

    await origen.hub.batch(
      [
        { sql: `INSERT INTO niveles (id, nombre, orden) VALUES (?, ?, ?)`, args: ['n1', 'Primaria', 1] },
        { sql: `INSERT INTO tipos (id, nombre, aplica_a) VALUES (?, ?, ?)`, args: ['t1', 'Guia', '[]'] },
        { sql: `INSERT INTO categorias (id, nombre, color) VALUES (?, ?, ?)`, args: ['c1', 'Lectura', '#fff'] },
        {
          sql: `INSERT INTO recursos (id, titulo, descripcion, formato, nivel_id, tipo_id, categoria_id, area, actualizado, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: ['r1', 'Recurso 1', 'desc', 'pdf', 'n1', 't1', 'c1', 'lengua', '2026-01-01T00:00:00.000Z', 'publicado'],
        },
      ],
      'write',
    )

    await migrar({
      ...destino,
      schemaPg: schema,
      snapshot,
      abrirOrigen: origen.abrirOrigen,
      log: () => {},
    })

    const niveles = await destino.db.select({ id: schema.niveles.id }).from(schema.niveles)
    const recursos = await destino.db.select({ id: schema.recursos.id }).from(schema.recursos)
    expect(niveles.map((n) => n.id)).toEqual(['n1'])
    expect(recursos.map((r) => r.id)).toEqual(['r1'])
  })

  it('es idempotente: re-ejecutar no duplica filas ni tira error', async () => {
    const destino = await crearDestino()
    const origen = crearOrigen()
    await prepararOrigen(origen)

    await origen.hub.execute({
      sql: `INSERT INTO niveles (id, nombre, orden) VALUES (?, ?, ?)`,
      args: ['n1', 'Primaria', 1],
    })
    await origen.ge.batch(
      [
        { sql: `INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (?, ?, ?, ?)`, args: [1, 2026, '2026-01-01T00:00:00.000Z', 'vigente'] },
        { sql: `INSERT INTO ge_localizacion (cue_anexo, nombre, departamento, localidad) VALUES (?, ?, ?, ?)`, args: ['cue1', 'Escuela 1', 'Capital', 'Centro'] },
        { sql: `INSERT INTO ge_alumno_identidad (ge_person_id, payload_cifrado) VALUES (?, ?)`, args: [101, 'cifrado-101'] },
        { sql: `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [1, 7, 'cue1', '1', 'A', 'primaria', 'manana'] },
        { sql: `INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (?, ?, ?)`, args: [1, 7, 101] },
      ],
      'write',
    )

    const opciones = {
      ...destino,
      schemaPg: schema,
      snapshot,
      abrirOrigen: origen.abrirOrigen,
      log: () => {},
    }
    await migrar(opciones)
    await migrar(opciones)

    const niveles = await destino.db.select({ id: schema.niveles.id }).from(schema.niveles)
    expect(niveles).toHaveLength(1)

    const geo = await destino.clienteDestino.execute('SELECT COUNT(*) AS n FROM ge.ge_corte')
    expect(Number(geo.rows[0].n)).toBe(1)

    // El setval de ge.ge_corte quedó consistente: el próximo id autogenerado no
    // colisiona con el 1 importado.
    await destino.clienteDestino.execute({
      sql: `INSERT INTO ge.ge_corte (ciclo_lectivo, fetched_at, estado) VALUES (?, ?, ?)`,
      args: [2027, '2027-01-01T00:00:00.000Z', 'vigente'],
    })
    const ids = await destino.clienteDestino.execute('SELECT id FROM ge.ge_corte ORDER BY id')
    expect(ids.rows.map((r) => Number(r.id))).toEqual([1, 2])
  })
})
