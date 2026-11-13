#!/usr/bin/env node
/** Reconstrucción atómica de DATOS de staging; no modifica el esquema de prod.
 * Sin --apply sólo prepara el plan. Credenciales exclusivamente por entorno.
 */
import { Client } from 'pg'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  crearPlan, TABLAS_VACIAS, citarTabla, citarIdentificador,
  sqlExtraccion, sanearFila, ordenarPorDependencias, validarDestino,
  TABLAS_IGNORADAS, tablasReconstruidas,
} from './lib/reconstruir-staging-plan.mjs'

const TABLAS_SQL = `SELECT table_schema || '.' || table_name AS tabla
  FROM information_schema.tables
  WHERE table_schema IN ('public','ge') AND table_type = 'BASE TABLE'
  ORDER BY 1`
const COLUMNAS_SQL = `SELECT table_schema || '.' || table_name AS tabla,
  column_name, udt_name, is_nullable, is_identity, ordinal_position
  FROM information_schema.columns WHERE table_schema IN ('public','ge')
  ORDER BY table_schema, table_name, ordinal_position`
const FK_SQL = `SELECT child_ns.nspname || '.' || child.relname AS hija,
  parent_ns.nspname || '.' || parent.relname AS padre
  FROM pg_constraint c
  JOIN pg_class child ON child.oid = c.conrelid
  JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
  JOIN pg_class parent ON parent.oid = c.confrelid
  JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
  WHERE c.contype = 'f' AND child_ns.nspname IN ('public','ge')`

function configuracion(url) {
  if (!url) throw new Error('Faltan SOURCE_DATABASE_URL o TARGET_DATABASE_URL')
  // TLS se exige. Una CA configurada habilita validación estricta.
  const ssl = process.env.DATABASE_SSL_CA_PATH
    ? { ca: readFileSync(process.env.DATABASE_SSL_CA_PATH, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: false }
  return { connectionString: url, ssl, connectionTimeoutMillis: 15000,
    statement_timeout: 120000, application_name: 'infra-staging-rebuild' }
}

export function validarClasificacion(tablas, plan) {
  const clasificadas = new Set([...plan.map((p) => p.tabla), ...TABLAS_VACIAS])
  const desconocidas = tablas.filter((t) => !clasificadas.has(t) && !TABLAS_IGNORADAS.includes(t))
  const faltantes = [...clasificadas].filter((t) => !tablas.includes(t))
  if (desconocidas.length || faltantes.length) {
    throw new Error(`Esquema sin clasificar: nuevas=${desconocidas.join(',')}; faltantes=${faltantes.join(',')}`)
  }
}

async function verificarBackup(ruta) {
  if (!ruta) throw new Error('--apply requiere --backup=<dump verificado>')
  const manifest = JSON.parse(readFileSync(`${ruta}.verified.json`, 'utf8'))
  if (manifest.database !== 'hub_staging' || manifest.restoreVerified !== true) {
    throw new Error('El respaldo debe tener una restauración comprobada de hub_staging')
  }
  if (Date.now() - Date.parse(manifest.createdAt) > 24 * 3600_000 || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error('El respaldo verificado debe tener menos de 24 horas')
  }
  const hash = createHash('sha256')
  for await (const bloque of createReadStream(ruta)) hash.update(bloque)
  if (hash.digest('hex') !== manifest.sha256) throw new Error('El checksum del respaldo no coincide')
}

async function copiarTabla(origen, destino, entrada) {
  const consulta = sqlExtraccion(entrada)
  await origen.query(`DECLARE carga_cursor NO SCROLL CURSOR FOR SELECT to_jsonb(fila) AS payload FROM (${consulta}) fila`, entrada.params)
  let filas = 0
  try {
    while (true) {
      const lote = await origen.query('FETCH FORWARD 2000 FROM carga_cursor')
      if (!lote.rows.length) break
      const datos = lote.rows.map(({ payload }) => sanearFila(entrada.tabla, payload))
      const tabla = citarTabla(entrada.tabla)
      await destino.query(`INSERT INTO ${tabla} OVERRIDING SYSTEM VALUE
        SELECT * FROM jsonb_populate_recordset(NULL::${tabla}, $1::jsonb)`, [JSON.stringify(datos)])
      filas += datos.length
    }
  } catch (error) {
    await origen.query('CLOSE carga_cursor').catch(() => {})
    throw error
  }
  await origen.query('CLOSE carga_cursor')
  return filas
}

async function ajustarSecuencias(destino, columnas) {
  for (const col of columnas.filter((c) => c.is_identity === 'YES')) {
    const tabla = citarTabla(col.tabla)
    const campo = citarIdentificador(col.column_name)
    await destino.query(`SELECT setval(pg_get_serial_sequence($1, $2),
      COALESCE((SELECT max(${campo}) FROM ${tabla}), 1),
      EXISTS (SELECT 1 FROM ${tabla}))`, [col.tabla, col.column_name])
  }
}

const INTEGRIDAD = [
  ['más de un corte vigente', "SELECT greatest(count(*) - 1, 0) AS n FROM ge.ge_corte WHERE estado='vigente'"],
  ['afiliaciones fuera del mapa', 'SELECT count(*) AS n FROM ge.ge_escuela_nivel_jur n LEFT JOIN ge.ge_localizacion l USING(cue_anexo) WHERE l.cue_anexo IS NULL'],
  ['secciones fuera del mapa', 'SELECT count(*) AS n FROM ge.ge_seccion s LEFT JOIN ge.ge_localizacion l USING(cue_anexo) WHERE l.cue_anexo IS NULL'],
  ['afectaciones sin sección en su corte', 'SELECT count(*) AS n FROM infra_afectacion_seccion a JOIN infra_afectacion f ON f.id=a.afectacion_id JOIN infra_parte p ON p.id=f.parte_id LEFT JOIN ge.ge_seccion s ON s.corte_id=p.corte_id AND s.ge_section_id=a.ge_section_id WHERE s.ge_section_id IS NULL'],
  ['partes sin escuela', 'SELECT count(*) AS n FROM infra_parte p LEFT JOIN ge.ge_localizacion l ON l.cue_anexo=p.cue_anexo WHERE l.cue_anexo IS NULL'],
  ['partes sin corte', 'SELECT count(*) AS n FROM infra_parte p LEFT JOIN ge.ge_corte c ON c.id=p.corte_id WHERE c.id IS NULL'],
  ['secciones sin corte', 'SELECT count(*) AS n FROM ge.ge_seccion s LEFT JOIN ge.ge_corte c ON c.id=s.corte_id WHERE c.id IS NULL'],
  ['membresías sin sección', 'SELECT count(*) AS n FROM ge.ge_alumno_seccion a LEFT JOIN ge.ge_seccion s ON (s.corte_id,s.ge_section_id)=(a.corte_id,a.ge_section_id) WHERE s.ge_section_id IS NULL'],
  ['afectaciones de alumno sin identidad', 'SELECT count(*) AS n FROM infra_afectacion_alumno a LEFT JOIN ge.ge_alumno_identidad i ON i.ge_person_id=a.ge_person_id WHERE i.ge_person_id IS NULL'],
  ['riesgos sin escuela', 'SELECT count(*) AS n FROM infra_risk_snapshot s LEFT JOIN ge.ge_localizacion l ON l.cue_anexo=s.cue_anexo WHERE l.cue_anexo IS NULL'],
  ['usuarios con permiso a recurso ausente', 'SELECT count(*) AS n FROM user_recursos u LEFT JOIN recursos r ON r.id=u.recurso_id WHERE r.id IS NULL'],
]

export async function reconstruirStaging({ sourceUrl, targetUrl, apply = false, backupPath, log = console.log }) {
  // Se comprueba antes de conectar y otra vez con la identidad real del servidor.
  validarDestino({ database: new URL(sourceUrl).pathname.slice(1) }, { database: new URL(targetUrl).pathname.slice(1) })
  if (apply) await verificarBackup(backupPath)
  const origen = new Client(configuracion(sourceUrl))
  const destino = new Client(configuracion(targetUrl))
  let escribiendo = false
  try {
    await origen.connect()
    await destino.connect()
    await origen.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const fuente = (await origen.query('SELECT current_database() AS database, transaction_timestamp() AS ahora')).rows[0]
    const objetivo = (await destino.query('SELECT current_database() AS database')).rows[0]
    validarDestino(fuente, objetivo)
    const plan = crearPlan(new Date(fuente.ahora))
    const tablasOrigen = (await origen.query(TABLAS_SQL)).rows.map((r) => r.tabla)
    const tablasDestino = (await destino.query(TABLAS_SQL)).rows.map((r) => r.tabla)
    validarClasificacion(tablasOrigen, plan)
    validarClasificacion(tablasDestino, plan)
    const columnasOrigen = (await origen.query(COLUMNAS_SQL)).rows
    const columnasDestino = (await destino.query(COLUMNAS_SQL)).rows
    if (JSON.stringify(columnasOrigen) !== JSON.stringify(columnasDestino)) throw new Error('Los esquemas de origen y destino difieren')
    const migraciones = 'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at'
    if (JSON.stringify((await origen.query(migraciones)).rows) !== JSON.stringify((await destino.query(migraciones)).rows)) {
      throw new Error('Las migraciones de origen y destino difieren')
    }
    const relaciones = (await origen.query(FK_SQL)).rows
    const orden = ordenarPorDependencias(plan, relaciones)
    const resumen = { fuente: fuente.database, destino: objetivo.database, extraidoEn: fuente.ahora.toISOString(),
      aplicado: false, tablas: {}, vacias: TABLAS_VACIAS }
    for (const entrada of orden) {
      const { rows } = await origen.query(`SELECT count(*)::int AS n FROM (${sqlExtraccion(entrada)}) seleccion`, entrada.params)
      resumen.tablas[entrada.tabla] = rows[0].n
    }
    // Detectar selecciones accidentalmente vacías antes de tocar el destino.
    for (const tabla of ['public.user', 'public.recursos', 'ge.ge_localizacion', 'ge.ge_corte', 'public.infra_aislamiento_osm', 'public.infra_risk_run']) {
      if (!resumen.tablas[tabla]) throw new Error(`La selección obligatoria ${tabla} está vacía`)
    }
    const vigentes = (await origen.query("SELECT count(*)::int AS n FROM ge.ge_corte WHERE estado='vigente'")).rows[0].n
    if (vigentes !== 1) throw new Error('Se requiere exactamente un corte GE vigente')
    if (!apply) return resumen
    await destino.query('BEGIN')
    escribiendo = true
    await destino.query("SET LOCAL lock_timeout = '10s'")
    await destino.query('SELECT pg_advisory_xact_lock(73261, 20261016)')
    // Sin CASCADE: si una tabla fuera del alcance depende de éstas, se aborta.
    await destino.query(`TRUNCATE ${tablasReconstruidas(tablasDestino).map(citarTabla).join(', ')} RESTART IDENTITY`)
    for (const entrada of orden) {
      const total = await copiarTabla(origen, destino, entrada)
      if (total !== resumen.tablas[entrada.tabla]) throw new Error(`Conteo inconsistente en ${entrada.tabla}`)
      log(`${entrada.tabla}: ${total}`)
    }
    await ajustarSecuencias(destino, columnasDestino)
    for (const [etiqueta, sql] of INTEGRIDAD) {
      const resultado = await destino.query(sql)
      if (Number(resultado.rows[0].n)) throw new Error(`Integridad: ${etiqueta}`)
    }
    for (const tabla of tablasReconstruidas(tablasDestino)) {
      const { rows } = await destino.query(`SELECT count(*)::int AS n FROM ${citarTabla(tabla)}`)
      if (rows[0].n !== (resumen.tablas[tabla] ?? 0)) throw new Error(`Conteo final inconsistente en ${tabla}`)
    }
    await destino.query('COMMIT')
    escribiendo = false
    resumen.aplicado = true
    return resumen
  } finally {
    if (escribiendo) await destino.query('ROLLBACK').catch(() => {})
    await origen.query('ROLLBACK').catch(() => {})
    await Promise.allSettled([origen.end(), destino.end()])
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backupPath = process.argv.find((arg) => arg.startsWith('--backup='))?.slice('--backup='.length)
  reconstruirStaging({ sourceUrl: process.env.SOURCE_DATABASE_URL, targetUrl: process.env.TARGET_DATABASE_URL,
    apply: process.argv.includes('--apply'), backupPath })
    .then((resumen) => console.log(JSON.stringify(resumen, null, 2)))
    .catch((error) => { console.error(`Reconstrucción fallida (${error.code ?? 'validacion'}): ${error.message}`); process.exitCode = 1 })
}
