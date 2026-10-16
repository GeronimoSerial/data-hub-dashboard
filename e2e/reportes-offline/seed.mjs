import { registerTsResolver } from '../../scripts/lib/register-ts-resolver.mjs'

const root = process.cwd()
registerTsResolver(root)

const { ensureSeeded } = await import('../../lib/db/seed.ts')
const { getRawClient } = await import('../../lib/db/index.ts')
const { crearEjecutorSql, ensureGeSchema } = await import('../../lib/infraestructura/ge-db.ts')

await ensureSeeded()
const db = crearEjecutorSql(getRawClient())
await ensureGeSchema(db)
await db.execute(
  "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente') ON CONFLICT DO NOTHING",
)
for (const [cue, nombre, sectionId] of [
  ['1801605-98', 'E2E Escuela Alta', 980001],
  ['1801605-97', 'E2E Escuela Envío', 980002],
  ['1801605-99', 'E2E Escuela Actualización', 980003],
  ['1801605-96', 'E2E Escuela Fotos', 980004],
  ['1801605-95', 'E2E Escuela Procesamiento', 980005],
  ['1801605-94', 'E2E Escuela WebKit Offline', 980006],
  ['1801605-93', 'E2E Escuela WebKit Envío', 980007],
  ['1801605-92', 'E2E Escuela WebKit Actualización', 980008],
  ['1801605-91', 'E2E Escuela WebKit Fotos', 980009],
]) {
  await db.execute({
    sql: `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad)
          VALUES (?, NULL, ?, 'Goya', 'Goya')
          ON CONFLICT(cue_anexo) DO UPDATE SET nombre = excluded.nombre`,
    args: [cue, nombre],
  })
  await db.execute({
    sql: `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno)
          VALUES (1, ?, ?, '1', 'A', 'Primario', 'Mañana') ON CONFLICT DO NOTHING`,
    args: [sectionId, cue],
  })
  await db.execute({
    sql: `INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id)
          VALUES (1, ?, ?) ON CONFLICT DO NOTHING`,
    args: [sectionId, sectionId + 10_000_000],
  })
}

const client = getRawClient()
if (typeof client.close === 'function') await client.close()
else await client.end()
