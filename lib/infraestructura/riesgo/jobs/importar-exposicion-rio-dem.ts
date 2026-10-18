import { leerVersion } from '@/lib/infraestructura/datasets/repositorio'
import { validarFilasGeo } from '@/lib/infraestructura/datasets/geo-static-contratos.mjs'
// Importa a la base el CSV diario de exposición al río (DEM estático) generado por
// services/geo-static. Idempotente por versión y fecha de corrida.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { and, count, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraExposicionRioDem } from '@/lib/db/schema'
import { adquirirLease, publicarResultado } from '../job-run'
import { actualizarSaludFuente } from './salud-fuente'

const TIPO_JOB = 'importar-exposicion-rio-dem'
const DURACION_LEASE_MS = 30 * 60 * 1000
const TAMANO_LOTE = 500
const PROVIDER_SALUD = 'exposicion-rio-dem'
// Cadencia diaria: el dato se considera vigente 48 h.
const TTL_SALUD_MINUTOS = 48 * 60
const LICENCIA_SALUD =
  'Copernicus DEM GLO-30 (© DLR/Airbus, licencia Copernicus) + JRC Global Surface Water (CC BY 4.0)'
const ERROR_SIN_ARCHIVO = 'sin archivo de exposicion_rio_dem'
const ERROR_FORMATO = 'formato inválido en exposicion_rio_dem'
const ERROR_IMPORTACION = 'fallo al importar exposicion_rio_dem'
const LARGO_ERROR_MAX = 250
const PATRON_ARCHIVO = /^exposicion_rio_dem-v(\d+)-(\d{4}-\d{2}-\d{2})\.csv$/
const CABECERA = [
  'cue_anexo',
  'version_job',
  'suelo_m',
  'nivel_rio_dem_m',
  'distancia_rio_m',
  'fuente',
  'fecha_corrida',
] as const

export type ResultadoImportarExposicion =
  | { ejecutado: false; estado: 'omitido' }
  | { ejecutado: false; estado: 'fallido'; mensaje: string }
  | { ejecutado: true; estado: 'completo'; contadores: Record<string, number> }

export type OpcionesImportarExposicion = {
  ahora?: Date
  directorio?: string
  leerArchivo?: (ruta: string) => Promise<string>
  listarArchivos?: (directorio: string) => Promise<string[]>
}

type FilaExposicion = {
  cueAnexo: string
  versionJob: string
  sueloM: number | null
  nivelRioDemM: number | null
  distanciaRioM: number | null
  fuente: string
  fechaCorrida: string
}

type ArchivoExposicion = { nombre: string; version: string; fecha: string }

/** Clave idempotente por día UTC: las invocaciones del mismo día comparten una corrida. */
export function claveIdempotenteDeDia(ahora: Date): string {
  return ahora.toISOString().slice(0, 10)
}

const directorioPorDefecto = () =>
  process.env.GEO_STATIC_OUTPUT_DIR || path.join(process.cwd(), 'services', 'geo-static', 'output')

/** Último archivo válido por nombre (orden lexicográfico ascendente). */
function elegirUltimoArchivo(nombres: string[]): ArchivoExposicion | null {
  const validos = nombres
    .map((nombre) => ({ nombre, coincidencia: PATRON_ARCHIVO.exec(nombre) }))
    .filter((item): item is { nombre: string; coincidencia: RegExpExecArray } => item.coincidencia !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  const ultimo = validos.at(-1)
  if (!ultimo) return null
  return { nombre: ultimo.nombre, version: ultimo.coincidencia[1], fecha: ultimo.coincidencia[2] }
}

function numeroOpcional(valor: string): number | null {
  if (valor.trim() === '') return null
  const numero = Number(valor)
  if (!Number.isFinite(numero)) throw new Error(ERROR_FORMATO)
  return numero
}

/** Parseo simple: el archivo no contiene comillas, se separa por coma. */
export function parsearExposicionCsv(texto: string): FilaExposicion[] {
  const lineas = texto.split('\n').map((linea) => linea.replace(/\r$/, ''))
  const [cabecera, ...cuerpo] = lineas
  if (cabecera !== CABECERA.join(',')) throw new Error(ERROR_FORMATO)
  return cuerpo
    .filter((linea) => linea.trim() !== '')
    .map((linea) => {
      const campos = linea.split(',')
      if (campos.length !== CABECERA.length) throw new Error(ERROR_FORMATO)
      const [cueAnexo, versionJob, sueloM, nivelRioDemM, distanciaRioM, fuente, fechaCorrida] = campos
      return {
        cueAnexo,
        versionJob,
        sueloM: numeroOpcional(sueloM),
        nivelRioDemM: numeroOpcional(nivelRioDemM),
        distanciaRioM: numeroOpcional(distanciaRioM),
        fuente,
        fechaCorrida,
      }
    })
}

async function filasYaImportadas(
  db: ReturnType<typeof getDb>,
  version: string,
  fecha: string,
): Promise<number> {
  const [resultado] = await db
    .select({ total: count() })
    .from(infraExposicionRioDem)
    .where(
      and(
        eq(infraExposicionRioDem.versionJob, version),
        eq(infraExposicionRioDem.fechaCorrida, fecha),
      ),
    )
  return Number(resultado?.total ?? 0)
}

async function upsertPorLotes(db: ReturnType<typeof getDb>, filas: FilaExposicion[], ahora: Date) {
  const importadoEn = ahora.toISOString()
  for (let inicio = 0; inicio < filas.length; inicio += TAMANO_LOTE) {
    const lote = filas.slice(inicio, inicio + TAMANO_LOTE).map((fila) => ({ ...fila, importadoEn }))
    await db
      .insert(infraExposicionRioDem)
      .values(lote)
      .onConflictDoUpdate({
        target: [infraExposicionRioDem.cueAnexo, infraExposicionRioDem.versionJob],
        set: {
          sueloM: sql`excluded.suelo_m`,
          nivelRioDemM: sql`excluded.nivel_rio_dem_m`,
          distanciaRioM: sql`excluded.distancia_rio_m`,
          fuente: sql`excluded.fuente`,
          fechaCorrida: sql`excluded.fecha_corrida`,
          importadoEn: sql`excluded.importado_en`,
        },
      })
  }
}

export async function importarExposicionRioDem(
  opts: OpcionesImportarExposicion = {},
): Promise<ResultadoImportarExposicion> {
  const ahora = opts.ahora ?? new Date()
  const directorio = opts.directorio ?? directorioPorDefecto()
  const leerArchivo = opts.leerArchivo ?? ((ruta: string) => fs.readFile(ruta, 'utf8'))
  const listarArchivos = opts.listarArchivos ?? ((dir: string) => fs.readdir(dir))

  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: claveIdempotenteDeDia(ahora),
    version: 'v1',
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' }

  try {
    let archivo: { version: string; fecha: string }
    let filas: FilaExposicion[]
    if (opts.directorio || opts.leerArchivo || opts.listarArchivos) {
      // Importación histórica explícita; el scheduler normal consulta la DB.
      const encontrado = elegirUltimoArchivo(await listarArchivos(directorio))
      if (!encontrado) throw new Error(ERROR_SIN_ARCHIVO)
      archivo = encontrado
      filas = parsearExposicionCsv(await leerArchivo(path.join(directorio, encontrado.nombre)))
    } else {
      const publicada = await leerVersion('geo-exposicion-rio-dem')
      if (!publicada) throw new Error('dataset de exposición al río sin publicar')
      filas = validarFilasGeo('exposicion-rio-dem', publicada.documento)
      archivo = { version: filas[0].versionJob, fecha: filas[0].fechaCorrida }
    }

    const db = getDb()
    const yaImportadas = await filasYaImportadas(db, archivo.version, archivo.fecha)
    const omitir = yaImportadas >= filas.length

    if (!omitir) await upsertPorLotes(db, filas, ahora)

    const contadores = {
      filas: filas.length,
      guardadas: omitir ? 0 : filas.length,
      omitidas: omitir ? filas.length : 0,
    }
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores,
      ahora,
    })
    await registrarSalud('ok', null, ahora)
    return { ejecutado: true, estado: 'completo', contadores }
  } catch (error) {
    const mensaje =
      error instanceof Error && (error.message === ERROR_SIN_ARCHIVO || error.message === ERROR_FORMATO)
        ? error.message
        : ERROR_IMPORTACION
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: mensaje.slice(0, LARGO_ERROR_MAX),
      ahora,
    })
    await registrarSalud('no_disponible', mensaje, ahora)
    return { ejecutado: false, estado: 'fallido', mensaje }
  }
}

// Best-effort: un fallo al registrar la salud nunca cambia el resultado del job.
async function registrarSalud(
  estado: 'ok' | 'no_disponible',
  ultimoErrorSaneado: string | null,
  ahora: Date,
) {
  try {
    await actualizarSaludFuente(getDb(), {
      provider: PROVIDER_SALUD,
      ttlMinutos: TTL_SALUD_MINUTOS,
      licencia: LICENCIA_SALUD,
      estado,
      ultimoErrorSaneado,
      ahoraIso: ahora.toISOString(),
    })
  } catch {
    console.warn('[importar-exposicion-rio-dem] no se pudo registrar la salud de la fuente')
  }
}
