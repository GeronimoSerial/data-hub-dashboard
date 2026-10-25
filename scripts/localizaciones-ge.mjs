export function completarLocalizaciones(actuales, filas) {
  const conocidas = new Set(actuales.map((r) => r.cueAnexo))
  const nuevas = new Map()
  const excluidas = []
  for (const fila of filas) {
    const cueAnexo = String(fila.cue_anexo ?? '').trim()
    const nombre = String(fila.establecimiento_nombre ?? '').trim()
    if (!/^18\d{5}-\d{2}$/.test(cueAnexo) || /^1800000-/.test(cueAnexo) || /^PRUEBAS?\b/i.test(nombre)) {
      excluidas.push(cueAnexo)
      continue
    }
    if (conocidas.has(cueAnexo)) continue
    const departamento = String(fila.departamento ?? '').trim()
    const localidad = String(fila.localidad ?? '').trim()
    if (!nombre || !departamento || !localidad) throw new Error(`Identidad institucional incompleta: ${cueAnexo}`)
    const registro = { cueAnexo, nombre, departamento, localidad, lat: null, lon: null, geoCalidad: null }
    const anterior = nuevas.get(cueAnexo)
    if (anterior && JSON.stringify(anterior) !== JSON.stringify(registro)) throw new Error(`Identidad institucional contradictoria: ${cueAnexo}`)
    nuevas.set(cueAnexo, registro)
  }
  return { registros: [...actuales, ...nuevas.values()], nuevas: [...nuevas.values()], excluidas: [...new Set(excluidas)] }
}

export function planificarRecuperacion(actuales, filas, cuesConSecciones) {
  const plan = completarLocalizaciones(actuales, filas)
  const excluidas = new Set(plan.excluidas)
  const cubiertas = new Set(cuesConSecciones)
  const nuevas = new Set(plan.nuevas.map((r) => r.cueAnexo))
  const recuperar = [...new Set(filas.map((r) => String(r.cue_anexo ?? '').trim()))]
    .filter((cue) => !excluidas.has(cue) && (nuevas.has(cue) || !cubiertas.has(cue)))
  return { ...plan, recuperar }
}

export async function leerLocalizacionesDesdeGe({ conexion, cicloLectivo = String(new Date().getFullYear()) } = {}) {
  const { default: pg } = await import('pg')
  const { conexionDesdeEntorno } = await import('./padron-ge.mjs')
  const client = new pg.Client(conexion ?? conexionDesdeEntorno())
  await client.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const { rows } = await client.query(`SELECT DISTINCT s.cue_anexo, s.establecimiento_nombre, s.departamento, s.localidad
      FROM secciones s JOIN alumnos a ON a.seccion_id = s.id
      WHERE a.ciclo_lectivo = $1 AND a.status::text = 'activo' ORDER BY s.cue_anexo`, [cicloLectivo])
    return rows
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
}

export async function publicarLocalizacionesGe(db, filas) {
  const { guardarVersion, leerVersion } = await import('../lib/infraestructura/datasets/repositorio.ts')
  const { sql } = await import('drizzle-orm')
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('infra-datasets-publicacion'))`)
    const actual = await leerVersion('localizaciones', undefined, tx)
    if (!actual || !Array.isArray(actual.documento)) throw new Error('Falta el catálogo publicado de localizaciones')
    const resultado = completarLocalizaciones(actual.documento, filas)
    if (!resultado.nuevas.length) return { ...resultado, versionId: actual.version.id }
    const versionId = await guardarVersion({
      datasetId: 'localizaciones', nombre: 'Localizaciones escolares', revision: `ge-cobertura-${new Date().toISOString()}`,
      fuente: 'Gestión Educativa: establecimientos con matrícula activa; coordenadas previas conservadas',
      formato: 'array', clave: 'cueAnexo', datos: resultado.registros,
      entradas: [actual.version.id], metadatos: { cuesIncorporados: resultado.nuevas.map((r) => r.cueAnexo) },
    }, tx)
    return { ...resultado, versionId }
  })
}
