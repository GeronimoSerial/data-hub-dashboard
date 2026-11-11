import { validarDestinosRadar } from './replicacion-radar.mjs'

// Datos que producen en hub_prod los jobs Open-Meteo de riesgo
// (lib/infraestructura/riesgo/providers/rol-entorno.ts, JOBS_OPEN_METEO).
// `marca`: columna de corrida/cálculo; sólo se copian filas con marca igual o
// posterior a la última del destino en su `particion` (igual: completa una
// corrida que producción todavía estaba escribiendo). Sin marca en el destino,
// `ventanaDias` acota la primera copia (null = todo).
// `filtro` excluye lo que producen jobs sin cupo por IP (IMERG/NASA), que los
// consumidores pueden seguir calculando.
const TABLAS = [
  {
    nombre: 'hazard_forecast',
    clave: ['provider', 'variable', 'geometry_ref', 'corrida_en', 'valido_en'],
    marca: 'corrida_en', particion: 'provider', ventanaDias: 14,
    filtro: "provider IN ('open-meteo-ecmwf', 'open-meteo-flood')",
  },
  {
    nombre: 'hazard_ensemble_prob',
    clave: ['geometry_ref', 'variable', 'corrida_en', 'valido_en'],
    marca: 'corrida_en', particion: 'variable', ventanaDias: 14, filtro: 'TRUE',
  },
  {
    nombre: 'hazard_seasonal_trend',
    clave: ['departamento', 'variable', 'emision_en', 'horizonte_desde_dias', 'horizonte_hasta_dias'],
    marca: 'emision_en', particion: 'variable', ventanaDias: 60, filtro: 'TRUE',
  },
  {
    nombre: 'hazard_climatology',
    clave: ['geometry_ref', 'variable', 'percentil', 'muestra', 'periodo_desde', 'periodo_hasta', 'version'],
    marca: 'calculado_en', particion: 'version', ventanaDias: null,
    filtro: "version NOT LIKE 'climatologia-imerg%'",
  },
  {
    nombre: 'hazard_precipitacion_serie',
    clave: ['celda_era5', 'anio'],
    marca: 'descargado_en', particion: null, ventanaDias: null, loteMaximo: 100,
    filtro: "celda_era5 NOT LIKE 'imerg:%'",
  },
  // Salud de las fuentes replicadas: sin ella el consumidor vería Open-Meteo vencido.
  {
    nombre: 'hazard_source_health',
    clave: ['provider'],
    marca: 'actualizada_en', particion: 'provider', ventanaDias: null,
    filtro: "provider LIKE 'open-meteo-%'",
  },
]

// Con HAZARD_SOURCE_DATABASE_URL, staging/dev leen `hazard_forecast` directo de
// producción (lib/db/hazard-source.ts): no se copia esa tabla de 24 GB.
export function tablasReplicadas(entorno = process.env) {
  return TABLAS.filter(t => !(t.nombre === 'hazard_forecast' && entorno.HAZARD_SOURCE_DATABASE_URL))
}

export function validarDestinosRiesgoOm(origen, destino) {
  validarDestinosRadar(origen, destino)
}

function expresionParticion(particion) {
  return particion ?? "'_'"
}

/**
 * Recibe conexiones dedicadas (como la réplica del radar). Lectura en snapshot
 * read-only; escritura en una transacción que bloquea réplicas concurrentes sin
 * bloquear lecturas de la app. Upsert por clave natural; el `id` del destino se
 * conserva. No purga: filas ausentes del origen quedan intactas.
 */
export async function replicarRiesgoOm(origen, destino, { ahora = new Date(), lote = 1000 } = {}) {
  await origen.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  let transaccionDestino = false
  try {
    await destino.query('BEGIN')
    transaccionDestino = true
    const tablas = tablasReplicadas()
    await destino.query(`LOCK TABLE ${tablas.map(t => `public.${t.nombre}`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`)
    /** @type {Record<string, {copiadas: number}>} */
    const resultado = {}
    for (const { nombre, clave, marca, particion, ventanaDias, filtro, loteMaximo } of tablas) {
      const expresion = expresionParticion(particion)
      const { rows: marcas } = await destino.query(
        `SELECT ${expresion} AS particion, max(${marca}) AS marca FROM public.${nombre} WHERE ${filtro} GROUP BY 1`)
      const marcasPorParticion = Object.fromEntries(marcas.map(m => [m.particion, m.marca]))
      const desde = ventanaDias === null ? '' : new Date(ahora.getTime() - ventanaDias * 86_400_000).toISOString()
      const tamano = Math.min(lote, loteMaximo ?? lote)
      let copiadas = 0
      for (;;) {
        const { rows } = await origen.query(`SELECT * FROM public.${nombre}
          WHERE ${filtro} AND ${marca} >= COALESCE($1::jsonb ->> ${expresion}, $2)
          ORDER BY ${clave.join(', ')} LIMIT ${tamano} OFFSET $3`,
        [JSON.stringify(marcasPorParticion), desde, copiadas])
        if (!rows.length) break
        const columnas = Object.keys(rows[0])
        if (columnas.some(c => !/^[a-z0-9_]+$/.test(c))) throw new Error('Esquema riesgo inesperado')
        const cambios = columnas.filter(c => !clave.includes(c) && c !== 'id').map(c => `${c} = EXCLUDED.${c}`)
        await destino.query(`INSERT INTO public.${nombre} SELECT * FROM jsonb_populate_recordset(NULL::public.${nombre}, $1::jsonb)
          ON CONFLICT (${clave.join(', ')}) DO ${cambios.length ? `UPDATE SET ${cambios.join(', ')}` : 'NOTHING'}`,
        [JSON.stringify(rows)])
        copiadas += rows.length
      }
      resultado[nombre] = { copiadas }
    }
    await origen.query('COMMIT')
    await destino.query('COMMIT')
    return resultado
  } catch (error) {
    await origen.query('ROLLBACK')
    if (transaccionDestino) await destino.query('ROLLBACK')
    throw error
  }
}
