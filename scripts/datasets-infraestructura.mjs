#!/usr/bin/env node
// Gestión de versiones y réplica entre DBs. No contiene fuentes estáticas.
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
registerTsResolver(process.cwd())

const [comando, id, versionId] = process.argv.slice(2)
if (comando === 'replicar' && process.env.TARGET_DATABASE_URL) process.env.DATABASE_URL = process.env.TARGET_DATABASE_URL
if (!process.env.DATABASE_URL) { console.error('Falta DATABASE_URL'); process.exit(1) }
if (comando === 'replicar' && new URL(process.env.TARGET_DATABASE_URL).pathname === '/hub_prod' && !process.argv.includes('--permitir-prod')) {
  console.error('Producción requiere --permitir-prod después de validar staging'); process.exit(1)
}
const { getDb, getRawClient, migrarDb } = await import('../lib/db/index.ts')
const { guardarVersion, leerVersion, listarVersiones, publicarVersion } = await import('../lib/infraestructura/datasets/repositorio.ts')
const { esTipoGeo, publicarGeo } = await import('../lib/infraestructura/datasets/geo-static.ts')

async function replicar() {
  if (!process.env.SOURCE_DATABASE_URL || !process.env.TARGET_DATABASE_URL) throw new Error('Faltan SOURCE_DATABASE_URL/TARGET_DATABASE_URL')
  if (new URL(process.env.TARGET_DATABASE_URL).pathname === '/hub_prod' && !process.argv.includes('--permitir-prod')) {
    throw new Error('Producción requiere --permitir-prod después de validar staging')
  }
  if (process.env.SOURCE_DATABASE_URL === process.env.TARGET_DATABASE_URL) throw new Error('Origen y destino deben ser distintos')
  const origen = new Client({ connectionString: process.env.SOURCE_DATABASE_URL,
    ssl: process.env.DATABASE_SSL_CA_PATH ? { ca: readFileSync(process.env.DATABASE_SSL_CA_PATH, 'utf8'), rejectUnauthorized: true } : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000, statement_timeout: 120000 })
  try {
    await origen.connect()
    await origen.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const { rows: versiones } = await origen.query(`SELECT v.*, d.nombre,
      (SELECT jsonb_agg(r.datos ORDER BY r.orden) FROM infra_dataset_registro r WHERE r.version_id=v.id) AS registros,
      (SELECT coalesce(jsonb_agg(entrada_id), '[]') FROM infra_dataset_dependencia dep WHERE dep.version_id=v.id) AS entradas
      FROM infra_dataset_version v JOIN infra_dataset d ON d.id=v.dataset_id ORDER BY v.creada_en, v.id`)
    const { rows: publicaciones } = await origen.query('SELECT dataset_id,version_id FROM infra_dataset_publicacion')
    if (!versiones.length) throw new Error('El origen no tiene datasets versionados')
    await getDb().transaction(async (tx) => {
      const pendientes = new Map(versiones.map((v) => [v.id, v]))
      while (pendientes.size) {
        const disponibles = [...pendientes.values()].filter((v) => v.entradas.every((dep) => !pendientes.has(dep)))
        if (!disponibles.length) throw new Error('Dependencias circulares')
        for (const v of disponibles) {
          const datos = v.formato === 'array' ? v.registros : { ...v.estructura, [v.formato]: v.registros }
          // Se conserva la clave natural almacenada; el registro ordinal no
          // participa en la elección de la publicación.
          const { rows: claves } = await origen.query('SELECT clave FROM infra_dataset_registro WHERE version_id=$1 ORDER BY orden', [v.id])
          const entrada = { datasetId: v.dataset_id, nombre: v.nombre, revision: v.revision, fuente: v.fuente,
            licencia: v.licencia, fechaFuente: v.fecha_fuente?.toISOString() ?? null, formato: v.formato,
            datos, metadatos: v.metadatos, entradas: v.entradas, claves: claves.map((r) => r.clave) }
          const nuevoId = await guardarVersion(entrada, tx, false)
          if (nuevoId !== v.id) throw new Error(`Checksum distinto al replicar ${v.dataset_id}`)
          pendientes.delete(v.id)
        }
      }
      const prioridad = (id) => ['geo-inundacion-v2', 'geo-exposicion-ruta-v2'].includes(id) ? 2 : id.startsWith('geo-') ? 1 : 0
      // Publicar referencias y bases antes de sus enriquecimientos v2.
      for (const p of publicaciones.sort((a, b) => prioridad(a.dataset_id) - prioridad(b.dataset_id))) {
        const tipo = p.dataset_id.replace(/^geo-/, '')
        if (p.dataset_id.startsWith('geo-') && esTipoGeo(tipo)) await publicarGeo(tipo, p.version_id, tx)
        else await publicarVersion(p.dataset_id, p.version_id, tx)
      }
    })
    return { versiones: versiones.length, publicaciones: publicaciones.length }
  } finally { await origen.query('ROLLBACK').catch(() => {}); await origen.end() }
}

try {
  if (!['importar', 'leer', 'historial', 'publicar', 'replicar'].includes(comando)) throw new Error('Uso: datasets-infraestructura.mjs importar|leer|historial|publicar|replicar [dataset] [version]')
  await migrarDb()
  const { ensureGeSchema, crearEjecutorSql } = await import('../lib/infraestructura/ge-db.ts')
  await ensureGeSchema(crearEjecutorSql(getRawClient()))
  let resultado
  if (comando === 'importar') {
    let texto = ''
    if (id) texto = readFileSync(id, 'utf8')
    else for await (const bloque of process.stdin) texto += bloque
    const entradas = JSON.parse(texto)
    const lista = Array.isArray(entradas) ? entradas : [entradas]
    resultado = await getDb().transaction(async (tx) => {
      const versiones = []
      for (const entrada of lista) versiones.push({ datasetId: entrada.datasetId, versionId: await guardarVersion(entrada, tx) })
      return versiones
    })
  } else if (comando === 'leer') {
    resultado = await leerVersion(id, versionId)
    if (!resultado) throw new Error('Dataset no publicado')
  } else if (comando === 'historial') resultado = await listarVersiones(id)
  else if (comando === 'publicar') {
    const tipo = id?.replace(/^geo-/, '')
    if (id?.startsWith('geo-') && esTipoGeo(tipo)) await publicarGeo(tipo, versionId)
    else await publicarVersion(id, versionId)
    resultado = { datasetId: id, versionId }
  } else resultado = await replicar()
  console.log(JSON.stringify(resultado))
} catch (error) {
  console.error(`${error.cause?.code ?? error.code ?? 'validacion'}: ${String(error.cause?.message ?? error.message ?? 'Error de datasets').slice(0, 1000)}`)
  process.exitCode = 1
} finally {
  const raw = getRawClient()
  if (typeof raw.end === 'function') await raw.end()
  else await raw.close()
}
