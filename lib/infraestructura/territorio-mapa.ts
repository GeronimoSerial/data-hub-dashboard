// Capas territoriales estáticas del mapa de infraestructura (G1).
//
// Dos datasets de LARGO PLAZO, derivados offline, que se sirven como capas del
// mapa sin ninguna lógica de pronóstico:
//  - Aislamiento OSM: índice estático 0..3 derivado de OpenStreetMap (red vial +
//    cruces de agua). NO es un pronóstico ni el estado confirmado del edificio.
//    Fila ausente (null) ≠ índice 0: "sin cobertura" no es "aislamiento bajo".
//  - Susceptibilidad physrisk: peligro histórico por período de retorno (WRI
//    Aqueduct, baseline histórico 1980) con el valor = profundidad de
//    inundación en metros para el `periodoRetornoAnios` guardado. NO es un río ni
//    un pronóstico.
//
// La lógica de "última versión" y de "fila conservadora" se reutiliza de los
// adaptadores del motor de riesgo (no se copia). Este módulo sólo proyecta esas
// filas al payload del mapa y agrega los metadatos de encabezado.
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  infraAccesoOsmGeometria,
  infraAislamientoOsm,
  infraSusceptibilidadEstatica,
  type CruceAccesoOsm,
  type EdificioOsm,
  type RutaGeoJson,
  type SuperficiesAcceso,
  type ViaPrincipalAcceso,
} from '@/lib/db/schema'
import {
  ultimaVersionPorCue,
  type FilaAislamientoOsm,
} from '@/lib/infraestructura/riesgo/motor/adaptadores/aislamiento'
import {
  ultimaFilaConservadoraPorCue,
  type FilaSusceptibilidadEstatica,
} from '@/lib/infraestructura/riesgo/motor/adaptadores/susceptibilidad'

export const ATRIBUCION_OSM = '© OpenStreetMap contributors' as const

// Índice de aislamiento tal como lo expone el mapa: 0..3 o 'sin_datos_red'.
// NUNCA null: una escuela sin fila directamente NO aparece en `escuelas` (falta
// de cobertura), mientras que 'sin_datos_red' sí hay fila pero no hubo cálculo.
export type NivelAislamientoMapa = 0 | 1 | 2 | 3 | 'sin_datos_red'

export interface AislamientoEscuelaMapa {
  nivel: NivelAislamientoMapa
  cruces: number | null
  conPuente: number | null
  // = crucesAguaConVadoCount: la métrica de origen YA agrupa "vado" y "sin
  // evidencia" (no hay un conteo separado de cruces sin evidencia).
  sinPuente: number | null
  alternativaSinCruce: boolean | null
}

export interface SusceptibilidadEscuelaMapa {
  // v1 (physrisk, profundidad en m). Sigue disponible para quien lo necesite.
  inundacionFluvialM: number | null
  // v2: clase de riesgo por crecida de río. null = sin dato.
  claseRio: 'alto' | 'medio' | 'bajo' | 'sin_riesgo' | 'sin_dato' | null
  // v2: la escuela está junto a una laguna. null = sin dato (nunca se imputa false).
  juntoLaguna: boolean | null
}

const CLASES_RIO_MAPA: ReadonlySet<string> = new Set(['alto', 'medio', 'bajo', 'sin_riesgo', 'sin_dato'])

export interface TerritorioMapa {
  aislamiento: null | {
    fuente: 'OpenStreetMap'
    atribucion: typeof ATRIBUCION_OSM
    licencia: string
    fechaExtractoOsm: string
    versionJob: string
    escuelas: Record<string, AislamientoEscuelaMapa>
  }
  susceptibilidad: null | {
    fuente: 'physrisk'
    indicador: 'inundacion_fluvial'
    escenario: 'historico'
    unidad: 'm'
    periodoRetornoAnios: number
    fechaCorrida: string
    licencia: string
    escuelas: Record<string, SusceptibilidadEscuelaMapa>
  }
}

// `edificio` is optional so rows built before the footprint column keep type-checking.
export type FilaGeometriaAcceso = Omit<typeof infraAccesoOsmGeometria.$inferSelect, 'edificio'> & {
  edificio?: EdificioOsm | null
}

export interface GeometriaAccesoRespuesta {
  cueAnexo: string
  disponible: boolean
  motivo?: string
  versionJob?: string
  fechaExtractoOsm?: string
  licencia?: string
  ruta?: RutaGeoJson
  cruces?: CruceAccesoOsm[]
  resumen?: { puente: number; vado: number; sinEvidencia: number }
  viaPrincipal?: ViaPrincipalAcceso | null
  destino?: { nombre: string } | null
  distanciaKm?: number | null
  superficies?: SuperficiesAcceso | null
  /** Huella OSM del edificio; null en extractos previos o sin candidato. */
  edificio?: EdificioOsm | null
}

// Older rows have no `superficies` inside the via_principal JSON: null, never zeros.
function parsearSuperficies(valor: string | null): SuperficiesAcceso | null {
  if (valor === null) return null
  try {
    const sup = (JSON.parse(valor) as { superficies?: Record<string, unknown> } | null)?.superficies
    if (!sup) return null
    const { pavimentado, ripio, tierra } = sup
    if (![pavimentado, ripio, tierra].every((m) => typeof m === 'number' && Number.isFinite(m) && m >= 0)) return null
    return { pavimentado: pavimentado as number, ripio: ripio as number, tierra: tierra as number }
  } catch {
    return null
  }
}

function parsearViaPrincipal(valor: string | null): ViaPrincipalAcceso | null {
  if (valor === null) return null

  try {
    const parseado: unknown = JSON.parse(valor)
    if (typeof parseado !== 'object' || parseado === null) return null

    const via = parseado as Record<string, unknown>
    if (
      (typeof via.nombre !== 'string' && via.nombre !== null) ||
      typeof via.tipo !== 'string' ||
      typeof via.pavimentada !== 'boolean'
    ) {
      return null
    }

    return {
      nombre: via.nombre,
      tipo: via.tipo,
      pavimentada: via.pavimentada,
    }
  } catch {
    return null
  }
}

// Regla de nivel de aislamiento: entero 0..3 => ese nivel; cualquier otra cosa
// (null o entero corrupto fuera de rango) => 'sin_datos_red'. Es la MISMA regla
// que `nivelDeFila` en
// lib/infraestructura/riesgo/motor/adaptadores/aislamiento.ts (no se exporta y
// no se puede tocar desde acá, por eso se replica con un comentario que apunta
// a la fuente).
function nivelAislamientoDeIndice(indice: number | null): NivelAislamientoMapa {
  if (indice === 0 || indice === 1 || indice === 2 || indice === 3) return indice
  return 'sin_datos_red'
}

// Compara `versionJob` como número cuando AMBOS son numéricos (el job emite
// '1', '2', ... y '10' debe ser mayor que '9'); si alguno no es numérico, cae a
// comparación lexicográfica. Mismo criterio que los adaptadores de G1.
function compararVersionJob(a: string, b: string): number {
  const na = a.trim() === '' ? Number.NaN : Number(a)
  const nb = b.trim() === '' ? Number.NaN : Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    if (na !== nb) return na - nb
    return 0
  }
  return a > b ? 1 : a < b ? -1 : 0
}

// Valor más frecuente de una lista; ante empate, el "mayor" según el
// comparador recibido (el desempate lo define cada campo). Lista vacía => null.
function masFrecuente<T extends string | number>(
  valores: readonly T[],
  esMayor: (a: T, b: T) => boolean,
): T | null {
  if (valores.length === 0) return null
  const conteo = new Map<T, number>()
  for (const valor of valores) conteo.set(valor, (conteo.get(valor) ?? 0) + 1)

  let elegido: T | null = null
  let maxConteo = -1
  for (const [valor, cantidad] of conteo) {
    if (cantidad > maxConteo || (cantidad === maxConteo && esMayor(valor, elegido as T))) {
      elegido = valor
      maxConteo = cantidad
    }
  }
  return elegido
}

const mayorTexto = (a: string, b: string) => a > b
const mayorVersionJob = (a: string, b: string) => compararVersionJob(a, b) > 0
const mayorNumero = (a: number, b: number) => a > b

// Última versión de geometría por cueAnexo, con el MISMO criterio que
// `ultimaVersionPorCue` (mayor `importadoEn` numérico; empate => mayor
// `versionJob`). Se ordena localmente porque ese helper está tipado para
// `FilaAislamientoOsm` y no acepta filas de geometría.
function ultimaGeometriaDeCue(
  filas: readonly FilaGeometriaAcceso[],
): FilaGeometriaAcceso | null {
  let elegida: FilaGeometriaAcceso | null = null
  for (const fila of filas) {
    if (elegida === null) {
      elegida = fila
      continue
    }
    const msFila = Date.parse(fila.importadoEn)
    const msElegida = Date.parse(elegida.importadoEn)
    if (msFila !== msElegida) {
      if (msFila > msElegida) elegida = fila
    } else if (compararVersionJob(fila.versionJob, elegida.versionJob) > 0) {
      elegida = fila
    }
  }
  return elegida
}

export function construirTerritorioMapa(
  filasAislamiento: readonly FilaAislamientoOsm[],
  filasSusceptibilidad: readonly FilaSusceptibilidadEstatica[],
): TerritorioMapa {
  const seleccionAislamiento = ultimaVersionPorCue(filasAislamiento)
  const seleccionSusceptibilidad = ultimaFilaConservadoraPorCue(filasSusceptibilidad)

  let aislamiento: TerritorioMapa['aislamiento'] = null
  if (seleccionAislamiento.size > 0) {
    const escuelas: Record<string, AislamientoEscuelaMapa> = {}
    for (const [cueAnexo, fila] of seleccionAislamiento) {
      escuelas[cueAnexo] = {
        nivel: nivelAislamientoDeIndice(fila.indiceAislamiento),
        cruces: fila.crucesAguaCount,
        conPuente: fila.crucesAguaConPuenteCount,
        sinPuente: fila.crucesAguaConVadoCount,
        alternativaSinCruce: fila.tieneAlternativaSinCruce,
      }
    }
    aislamiento = {
      fuente: 'OpenStreetMap',
      atribucion: ATRIBUCION_OSM,
      licencia: masFrecuente(
        [...seleccionAislamiento.values()].map((f) => f.licencia),
        mayorTexto,
      ) as string,
      fechaExtractoOsm: masFrecuente(
        [...seleccionAislamiento.values()].map((f) => f.fechaExtractoOsm),
        mayorTexto,
      ) as string,
      versionJob: masFrecuente(
        [...seleccionAislamiento.values()].map((f) => f.versionJob),
        mayorVersionJob,
      ) as string,
      escuelas,
    }
  }

  let susceptibilidad: TerritorioMapa['susceptibilidad'] = null
  if (seleccionSusceptibilidad.size > 0) {
    const escuelas: Record<string, SusceptibilidadEscuelaMapa> = {}
    for (const [cueAnexo, fila] of seleccionSusceptibilidad) {
      // Sólo la fuente 'physrisk' aporta valor; cualquier otra fuente se
      // incluye igual, con `null`, como ausencia de dato (nunca se imputa 0).
      escuelas[cueAnexo] = {
        inundacionFluvialM:
          fila.fuente === 'physrisk' ? fila.peligroInundacionFluvial : null,
        claseRio: fila.claseRio !== null && CLASES_RIO_MAPA.has(fila.claseRio)
          ? (fila.claseRio as SusceptibilidadEscuelaMapa['claseRio'])
          : null,
        juntoLaguna: typeof fila.juntoLaguna === 'boolean' ? fila.juntoLaguna : null,
      }
    }
    susceptibilidad = {
      fuente: 'physrisk',
      indicador: 'inundacion_fluvial',
      escenario: 'historico',
      unidad: 'm',
      periodoRetornoAnios: masFrecuente(
        [...seleccionSusceptibilidad.values()].map((f) => f.periodoRetornoAnios),
        mayorNumero,
      ) as number,
      fechaCorrida: masFrecuente(
        [...seleccionSusceptibilidad.values()].map((f) => f.fechaCorrida),
        mayorTexto,
      ) as string,
      licencia: masFrecuente(
        [...seleccionSusceptibilidad.values()].map((f) => f.licencia),
        mayorTexto,
      ) as string,
      escuelas,
    }
  }

  return { aislamiento, susceptibilidad }
}

// Carga ambas capas con dos `select()` sobre la tabla completa. Nunca lanza:
// si una tabla no existe todavía o la query falla, esa capa se degrada a tabla
// vacía (=> bloque null) con un console.error, sin arrastrar a la otra.
export async function cargarTerritorioMapa(): Promise<TerritorioMapa> {
  const db = getDb()

  let filasAislamiento: FilaAislamientoOsm[] = []
  try {
    filasAislamiento = await db.select().from(infraAislamientoOsm)
  } catch (error) {
    console.error(
      'cargarTerritorioMapa: fallo al cargar infra_aislamiento_osm, se degrada a tabla vacía',
      error,
    )
  }

  let filasSusceptibilidad: FilaSusceptibilidadEstatica[] = []
  try {
    filasSusceptibilidad = await db.select().from(infraSusceptibilidadEstatica)
  } catch (error) {
    console.error(
      'cargarTerritorioMapa: fallo al cargar infra_susceptibilidad_estatica, se degrada a tabla vacía',
      error,
    )
  }

  return construirTerritorioMapa(filasAislamiento, filasSusceptibilidad)
}

export function construirRespuestaGeometria(
  cueAnexo: string,
  fila: FilaGeometriaAcceso | null,
): GeometriaAccesoRespuesta {
  if (fila === null) {
    return { cueAnexo, disponible: false, motivo: 'sin_geometria_importada' }
  }

  if (fila.ruta === null) {
    // Fila presente pero sin ruta: se explica con `motivoSinGeometria` (o el
    // genérico 'sin_geometria'). Sigue siendo falta de cobertura, nunca error.
    return {
      cueAnexo,
      disponible: false,
      motivo: fila.motivoSinGeometria ?? 'sin_geometria',
      fechaExtractoOsm: fila.fechaExtractoOsm,
      licencia: fila.licencia,
      // La huella no depende de la ruta: una escuela sin ruta puede tener edificio.
      edificio: fila.edificio ?? null,
    }
  }

  const resumen = { puente: 0, vado: 0, sinEvidencia: 0 }
  for (const cruce of fila.cruces) {
    if (cruce.clasificacion === 'puente') resumen.puente += 1
    else if (cruce.clasificacion === 'vado' || cruce.clasificacion === 'vado_probable') resumen.vado += 1
    else resumen.sinEvidencia += 1
  }

  return {
    cueAnexo,
    disponible: true,
    versionJob: fila.versionJob,
    fechaExtractoOsm: fila.fechaExtractoOsm,
    licencia: fila.licencia,
    ruta: fila.ruta,
    cruces: fila.cruces,
    resumen,
    viaPrincipal: parsearViaPrincipal(fila.viaPrincipal),
    destino: fila.destinoNombre ? { nombre: fila.destinoNombre } : null,
    distanciaKm: fila.distanciaDestinoM === null ? null : fila.distanciaDestinoM / 1000,
    superficies: parsearSuperficies(fila.viaPrincipal),
    edificio: fila.edificio ?? null,
  }
}

// Lectura de la última geometría de UN cueAnexo (no batch): el endpoint resuelve
// una sola escuela por request. Devuelve null cuando el dataset no tiene ninguna
// fila para ese CUE (falta de cobertura). El mapeo a payload queda a cargo de la
// función pura `construirRespuestaGeometria`.
export async function obtenerGeometriaAcceso(
  cueAnexo: string,
): Promise<FilaGeometriaAcceso | null> {
  const filas = await getDb()
    .select()
    .from(infraAccesoOsmGeometria)
    .where(eq(infraAccesoOsmGeometria.cueAnexo, cueAnexo))
  return ultimaGeometriaDeCue(filas)
}
