import { z } from 'zod'
import { leerVersion } from './datasets/repositorio'
import { ensureGeSchema, crearEjecutorSql } from './ge-db'
import { getRawClient } from '../db'

interface LocalizacionJson {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  geoCalidad: string | null
}

const UPSERT_SQL = `INSERT INTO ge.ge_localizacion
    (cue_anexo, cui, nombre, departamento, localidad, lat, lon, geo_calidad)
  VALUES (?,?,?,?,?,?,?,?)
  ON CONFLICT (cue_anexo) DO UPDATE SET
    nombre=excluded.nombre, departamento=excluded.departamento,
    localidad=excluded.localidad, lat=excluded.lat, lon=excluded.lon,
    geo_calidad=excluded.geo_calidad`

/**
 * Carga `ge_localizacion` desde el dataset publicado en la DB, cuando la tabla está vacía.
 *
 * Existe porque `ge.sqlite` vive en el volumen y no en la imagen: una
 * instalación nueva arrancaba sin una sola escuela y el formulario por CUE no
 * resolvía nada hasta que un operador entrara al contenedor. Las localizaciones
 * son dato público y están versionadas, así que se pueden sembrar solas.
 *
 * NO siembra secciones, membresías ni identidades: eso es el padrón nominal,
 * son datos personales de menores, no están en el repositorio y se cargan con
 * `scripts/import-padron.mjs` contra el volumen. `cui` queda NULL en todos los
 * registros: ninguna fuente del repo lo provee (llega con B8).
 */
export async function ensureLocalizacionesSeeded(): Promise<void> {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)

  const existentes = await client.execute('SELECT COUNT(*) AS n FROM ge.ge_localizacion')
  if (Number(existentes.rows[0]?.n ?? 0) > 0) return

  const seleccion = await leerVersion('localizaciones')
  if (!seleccion) return
  const registros: LocalizacionJson[] = z.array(z.object({
    cueAnexo: z.string(), nombre: z.string(), departamento: z.string(), localidad: z.string(),
    lat: z.number().nullable(), lon: z.number().nullable(), geoCalidad: z.string().nullable().optional().default(null),
  })).parse(seleccion.documento)
  if (!Array.isArray(registros) || registros.length === 0) return

  await client.execute('BEGIN')
  try {
    for (const r of registros) {
      await client.execute({
        sql: UPSERT_SQL,
        args: [
          r.cueAnexo,
          null,
          r.nombre,
          r.departamento,
          r.localidad,
          r.lat ?? null,
          r.lon ?? null,
          r.geoCalidad ?? null,
        ],
      })
    }
    await client.execute('COMMIT')
  } catch (err) {
    await client.execute('ROLLBACK')
    throw err
  }
  console.log(`[infraestructura] ge_localizacion sembrada: ${registros.length} registros`)
}
