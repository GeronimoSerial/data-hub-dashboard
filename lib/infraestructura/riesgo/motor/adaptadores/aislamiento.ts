// Adapter real de PuertoAislamiento sobre la tabla G1
// infra_aislamiento_osm (ver lib/db/schema.ts). Reemplaza al stub
// "no disponible".
//
// Estrategia de carga: UNA sola query batch a toda la tabla, agrupada en
// memoria por cueAnexo y quedándose con la ÚLTIMA versión de cada escuela
// (mayor `importadoEn`; empate => mayor `versionJob`). El resultado se
// memoiza en un Map dentro del closure y se sirve desde ahí en todas las
// llamadas siguientes. El motor se invoca una vez por (escuela, horizonte);
// con esto nunca hay un SELECT por cueAnexo — la carga es por lote, tal como
// exige el job calcular-riesgo.
//
// Contrato: null ≠ 'sin_datos_red' y ninguno de los dos es 0.
//  - `null`: no hay NINGUNA fila para ese cueAnexo (dataset sin cobertura)
//    => falta de evidencia, no "aislamiento bajo".
//  - `nivel: 'sin_datos_red'`: SÍ hay fila, pero el job no pudo calcular un
//    índice (por ejemplo `motivoSinDatos === 'sin_conexion_red'`) => ausencia
//    de cálculo, tampoco 0.
// Nunca lanza.
import { getDb } from '@/lib/db'
import { infraAislamientoOsm } from '@/lib/db/schema'
import type { IndiceAislamiento, NivelAislamiento, PuertoAislamiento } from '../puertos'

export type FilaAislamientoOsm = typeof infraAislamientoOsm.$inferSelect

export interface OpcionesAdapterAislamiento {
  // Punto de inyección sólo para tests: por defecto consulta la DB real. Sirve
  // para probar que la carga batch se dispara UNA sola vez para N cueAnexos
  // (tarea 3d) sin acoplarse al query builder de drizzle.
  cargarFilas?: () => Promise<FilaAislamientoOsm[]>
}

// Compara `versionJob` como número cuando AMBOS son numéricos (el job de G1
// emite versiones como '1', '2', ... y '10' debe ser mayor que '9', no menor
// como daría la comparación lexicográfica); si alguno no es numérico (p. ej.
// 'v1'), cae a comparación lexicográfica.
function compararVersionJob(a: string, b: string): number {
  const na = a.trim() === '' ? Number.NaN : Number(a)
  const nb = b.trim() === '' ? Number.NaN : Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    if (na !== nb) return na - nb
    return 0
  }
  return a > b ? 1 : a < b ? -1 : 0
}

// Devuelve true si `candidata` es una versión más nueva que `actual`:
// primero por `importadoEn` (comparación NUMÉRICA de timestamps, nunca
// lexicográfica) y, ante empate, por `versionJob`.
function esMasNueva(candidata: FilaAislamientoOsm, actual: FilaAislamientoOsm): boolean {
  const msCandidata = Date.parse(candidata.importadoEn)
  const msActual = Date.parse(actual.importadoEn)
  if (msCandidata !== msActual) return msCandidata > msActual
  return compararVersionJob(candidata.versionJob, actual.versionJob) > 0
}

// Última versión por cueAnexo (exportado para test unitario del criterio).
export function ultimaVersionPorCue(
  filas: readonly FilaAislamientoOsm[],
): Map<string, FilaAislamientoOsm> {
  const porCue = new Map<string, FilaAislamientoOsm>()
  for (const fila of filas) {
    const actual = porCue.get(fila.cueAnexo)
    if (actual === undefined || esMasNueva(fila, actual)) porCue.set(fila.cueAnexo, fila)
  }
  return porCue
}

function nivelDeFila(fila: FilaAislamientoOsm): NivelAislamiento {
  if (fila.indiceAislamiento !== null) return fila.indiceAislamiento as NivelAislamiento
  // Fila presente con índice nulo: el job corrió pero no pudo calcular la
  // ruta (`motivoSinDatos`, p. ej. 'sin_conexion_red', documenta por qué).
  // Aunque el motivo viniera vacío, es una AUSENCIA de cálculo: nunca 0.
  return 'sin_datos_red'
}

export function crearAdapterAislamiento(
  opciones: OpcionesAdapterAislamiento = {},
): PuertoAislamiento {
  const cargarFilas =
    opciones.cargarFilas ?? (() => getDb().select().from(infraAislamientoOsm))
  // Lazy: el Map se arma en la primera llamada a obtenerIndice y sirve a
  // todas las siguientes. La promesa cacheada evita disparar la query más de
  // una vez aun con llamadas concurrentes.
  let cache: Promise<Map<string, FilaAislamientoOsm>> | null = null

  function cargar(): Promise<Map<string, FilaAislamientoOsm>> {
    if (cache === null) {
      cache = Promise.resolve(cargarFilas()).then((filas) => ultimaVersionPorCue(filas))
    }
    return cache
  }

  return {
    async obtenerIndice(cueAnexo: string): Promise<IndiceAislamiento | null> {
      const porCue = await cargar()
      const fila = porCue.get(cueAnexo)
      if (fila === undefined) return null
      return {
        cueAnexo,
        nivel: nivelDeFila(fila),
        crucesAguaCount: fila.crucesAguaCount,
        crucesAguaConPuenteCount: fila.crucesAguaConPuenteCount,
        crucesAguaConVadoCount: fila.crucesAguaConVadoCount,
        tieneAlternativaSinCruce: fila.tieneAlternativaSinCruce,
        versionJob: fila.versionJob,
        fechaExtractoOsm: fila.fechaExtractoOsm,
        licencia: fila.licencia,
      }
    },
  }
}
