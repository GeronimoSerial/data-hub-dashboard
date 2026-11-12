// Piezas compartidas por el job operativo (calcular-riesgo.ts) y el candidato
// v0.4 (calcular-riesgo-v04.ts): puertos reales con caché por corrida, cálculo
// por escuela × horizonte con sus filas de persistencia e inserción troceada.
// Motor único (T8, odd/tasks/motor-v0-4.md): ambos jobs corren el MISMO
// calcularRiesgoEscuela; el candidato sólo agrega la evidencia probabilística.
import { randomUUID } from 'node:crypto'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import type { infraRiskFactor, infraRiskSnapshot } from '@/lib/db/schema'
import { crearAdapterAislamiento } from '../motor/adaptadores/aislamiento'
import { crearAdapterExposicion } from '../motor/adaptadores/exposicion'
import { regionActiva } from '@/lib/infraestructura/region'
import { crearAdapterRioPrefectura, type DependenciasAdapterRioPrefectura } from '../motor/adaptadores/rio-prefectura'
import { crearRegistroProveedoresRio } from '../motor/proveedores-rio'
import { crearAdapterHistorial } from '../motor/adaptadores/historial'
import { cargarClimatologiaPorPeriodoDesdeDb, crearAdapterLluvia } from '../motor/adaptadores/lluvia'
import { crearAdapterPeligro } from '../motor/adaptadores/peligro'
import { crearAdapterSusceptibilidad } from '../motor/adaptadores/susceptibilidad'
import { crearAdapterTerritorio } from '../motor/adaptadores/territorio'
import { calcularRiesgoEscuela } from '../motor/calculo'
import type { ReglasMotor } from '../motor/config'
import type { EscenarioSubidaEstacion } from '../motor/escenarios-subida'
import type { EvidenciaRioProbabilistica, ResultadoRiesgoEscuela } from '../motor/tipos'
import type {
  HorizontePeligro,
  IndicadoresSusceptibilidad,
  LluviaObservadaCelda,
  IndiceAislamiento,
  NivelCaudalPunto,
  NivelPeligroCelda,
  PerfilTerritorio,
  PuertosMotor,
  EvidenciaRioNoDisponible,
  EvidenciaRioPrefectura,
  ResumenExposicion,
  ResumenHistorial,
} from '../motor/puertos'

// SQLite limita la cantidad de variables ("binds") por sentencia
// (SQLITE_MAX_VARIABLE_NUMBER; 32766 en builds recientes, 999 en viejos). Un
// único INSERT de un lote completo (TAMANO_LOTE=200 escuelas x 3 horizontes x
// hasta ~8 factores/snapshot con más fuentes reales conectadas) puede superarlo
// y reventar el job. Por eso cada lote se sub-trocea en INSERTs más chicos:
// infraRiskFactor tiene 11 columnas, así que 500 filas = 5500 binds, holgado.
export const TAMANO_CHUNK_INSERCION = 500

type DbMotor = ReturnType<typeof getDb>

// Inserta `filas` en `tabla` partiéndolas en chunks de a lo sumo
// `tamanoChunk`, para no exceder el límite de binds de SQLite.
export async function insertarEnChunks<TSchema extends SQLiteTable>(
  db: DbMotor,
  tabla: TSchema,
  filas: TSchema['$inferInsert'][],
  tamanoChunk: number,
): Promise<void> {
  for (let inicio = 0; inicio < filas.length; inicio += tamanoChunk) {
    const chunk = filas.slice(inicio, inicio + tamanoChunk)
    // Cada chunk es un INSERT único de filas con ids ya generados (nunca se
    // regeneran entre intentos): si SQLITE_BUSY interrumpe el statement no
    // queda nada escrito, así que reintentar el mismo INSERT es seguro. El
    // run sigue 'preparando' durante todo este loop, invisible para
    // lectores, así que un reintento acá no afecta la publicación atómica.
    if (chunk.length > 0) await conReintentoPorBloqueo(() => db.insert(tabla).values(chunk))
  }
}

export const HORIZONTES: readonly HorizontePeligro[] = [24, 72, 240] as const

export type OpcionesPuertosReales = {
  // 'v0.3' (por defecto) arma exactamente los adapters del operativo; 'v0.4'
  // les pide además los insumos que necesitan las reglas v0.4 (T10).
  reglas?: ReglasMotor
  // Reglas v0.4 (F3): escenarios de subida por estación para la exposición.
  escenariosSubida?: ReadonlyMap<string, EscenarioSubidaEstacion>
}

// Proveedores de nivel de río implementados. Acá (y no en motor/) porque el
// motor no puede nombrar Prefectura (CA1). Otros proveedores se suman aquí en B12.
export const PROVEEDORES_RIO = crearRegistroProveedoresRio<DependenciasAdapterRioPrefectura>([
  { id: 'prefectura', crearPuerto: (deps) => crearAdapterRioPrefectura(deps) },
])

// Puerto de río de la región activa (fuentesRio). Único punto que lo arma.
export function construirPuertoRioRegion(deps: DependenciasAdapterRioPrefectura) {
  return PROVEEDORES_RIO.construirPuerto(regionActiva().fuentesRio, deps)
}

export function construirPuertosReales(opciones: OpcionesPuertosReales = {}): PuertosMotor {
  const v04 = opciones.reglas === 'v0.4'
  return {
    peligro: crearAdapterPeligro(v04 ? { reglas: 'v0.4' } : {}),
    lluviaObservada: crearAdapterLluvia(v04 ? { cargarClimatologia: cargarClimatologiaPorPeriodoDesdeDb } : {}),
    territorio: crearAdapterTerritorio(),
    aislamiento: crearAdapterAislamiento(),
    susceptibilidad: crearAdapterSusceptibilidad(v04 ? { conProfundidadFluvial: true } : {}),
    historial: crearAdapterHistorial(v04 ? { informarFuente: true } : {}),
    exposicion: crearAdapterExposicion(),
    rioPrefectura: construirPuertoRioRegion(v04 ? { reglas: 'v0.4', escenarios: opciones.escenariosSubida } : {}),
  }
}

// Cacheo por corrida de las consultas que NO dependen del horizonte. El núcleo
// calcularRiesgoEscuela se invoca una vez por (escuela, horizonte) y, para cada
// horizonte, vuelve a pedir exactamente los mismos datos: el perfil territorial
// (dato estático por escuela), el peligro de celda, el caudal del punto, la
// lluvia observada, el historial, el aislamiento, la susceptibilidad y la
// exposición. Ninguno de esos puertos recibe el horizonte como parámetro y
// `asOf` es constante en toda la corrida, así que memoizar por su clave natural
// (cueAnexo / geometryRef / puntoId) no cambia el resultado observable, sólo
// evita repetir la misma consulta 3 veces (una por horizonte) y una vez por
// cada escuela que comparte celda.
//
// obtenerNivelesCelda se trata aparte: el núcleo pide un horizonte por vez
// (`horizontes: [h]`). Acá se pide la lista completa de horizontes UNA vez por
// geometryRef y se filtra en memoria el horizonte solicitado, en vez de golpear
// el puerto por cada horizonte y por cada escuela que comparte la misma celda.
export function crearPuertosConCache(puertos: PuertosMotor): PuertosMotor {
  const perfiles = new Map<string, Promise<PerfilTerritorio | null>>()
  const nivelesCelda = new Map<string, Promise<NivelPeligroCelda[]>>()
  const nivelesCaudal = new Map<string, Promise<NivelCaudalPunto | null>>()
  const lluvia = new Map<string, Promise<LluviaObservadaCelda>>()
  const historiales = new Map<string, Promise<ResumenHistorial>>()
  const aislamientos = new Map<string, Promise<IndiceAislamiento | null>>()
  const susceptibilidades = new Map<string, Promise<IndicadoresSusceptibilidad | null>>()
  const exposiciones = new Map<string, Promise<ResumenExposicion | null>>()
  const evidenciasRio = new Map<string, Promise<EvidenciaRioPrefectura | EvidenciaRioNoDisponible | null>>()

  function memoizar<K, V>(
    cache: Map<K, Promise<V>>,
    clave: K,
    producir: () => Promise<V>,
  ): Promise<V> {
    const cacheado = cache.get(clave)
    if (cacheado !== undefined) return cacheado
    const promesa = producir()
    cache.set(clave, promesa)
    return promesa
  }

  return {
    peligro: {
      obtenerNivelesCelda(params) {
        const promesa = memoizar(nivelesCelda, params.geometryRef, () =>
          puertos.peligro.obtenerNivelesCelda({
            geometryRef: params.geometryRef,
            horizontes: HORIZONTES,
            asOf: params.asOf,
          }),
        )
        // El array cacheado es el conjunto completo de horizontes; cada
        // llamador recibe una vista filtrada a los horizontes que pidió, igual
        // que devolvería el puerto subyacente.
        return promesa.then((todos) =>
          todos.filter((nivel) => params.horizontes.includes(nivel.horizonteHoras)),
        )
      },
      obtenerNivelCaudal(params) {
        // Con horizonte (reglas v0.4) el caudal depende de él: clave compuesta.
        const clave = params.horizonteHoras === undefined ? params.puntoId : `${params.puntoId}|${params.horizonteHoras}`
        return memoizar(nivelesCaudal, clave, () =>
          puertos.peligro.obtenerNivelCaudal(params),
        )
      },
    },
    lluviaObservada: {
      obtenerAcumulado(params) {
        return memoizar(lluvia, params.geometryRef, () =>
          puertos.lluviaObservada.obtenerAcumulado(params),
        )
      },
    },
    territorio: {
      obtenerPerfil(cueAnexo) {
        return memoizar(perfiles, cueAnexo, () => puertos.territorio.obtenerPerfil(cueAnexo))
      },
      listarCuesConPerfil() {
        return puertos.territorio.listarCuesConPerfil()
      },
    },
    aislamiento: {
      obtenerIndice(cueAnexo) {
        return memoizar(aislamientos, cueAnexo, () => puertos.aislamiento.obtenerIndice(cueAnexo))
      },
    },
    susceptibilidad: {
      obtenerIndicadores(cueAnexo) {
        return memoizar(susceptibilidades, cueAnexo, () =>
          puertos.susceptibilidad.obtenerIndicadores(cueAnexo),
        )
      },
    },
    historial: {
      obtenerResumen(params) {
        return memoizar(historiales, params.cueAnexo, () =>
          puertos.historial.obtenerResumen(params),
        )
      },
    },
    exposicion: {
      obtenerResumen(params) {
        return memoizar(exposiciones, params.cueAnexo, () =>
          puertos.exposicion.obtenerResumen(params),
        )
      },
    },
    ...(puertos.rioPrefectura
      ? {
          rioPrefectura: {
            obtenerEvidencia(params: { cueAnexo: string; asOf: string }) {
              const puerto = puertos.rioPrefectura!
              return memoizar(evidenciasRio, params.cueAnexo, () => puerto.obtenerEvidencia(params))
            },
          },
        }
      : {}),
  }
}

type FilaSnapshot = typeof infraRiskSnapshot.$inferInsert
type FilaFactor = typeof infraRiskFactor.$inferInsert

// Una escuela × horizonte: corre el núcleo y arma las filas de snapshot y
// factores con ids nuevos. `extraSnapshot` permite al candidato agregar
// `resultadoV04` sin duplicar el mapeo de columnas heredadas.
export async function calcularFilasEscuela(params: {
  runId: string
  cueAnexo: string
  horizonte: HorizontePeligro
  asOf: string
  puertos: PuertosMotor
  rioProbabilistico?: EvidenciaRioProbabilistica | null
  reglas?: ReglasMotor
  extraSnapshot?: Partial<FilaSnapshot>
}): Promise<{ resultado: ResultadoRiesgoEscuela; snapshot: FilaSnapshot; factores: FilaFactor[] }> {
  const { runId, cueAnexo, horizonte, asOf, puertos } = params
  const resultado = await calcularRiesgoEscuela({
    cueAnexo,
    horizonte,
    asOf,
    puertos,
    rioProbabilistico: params.rioProbabilistico,
    reglas: params.reglas,
  })
  const snapshotId = randomUUID()
  const snapshot: FilaSnapshot = {
    id: snapshotId,
    runId,
    cueAnexo,
    horizonteHoras: horizonte,
    evidenciaValida: resultado.evidenciaValida,
    scoreRiesgo: resultado.scoreRiesgo,
    nivelRiesgo: resultado.nivelRiesgo,
    scoreAmenaza: resultado.scoreAmenaza,
    nivelAmenaza: resultado.nivelAmenaza,
    scoreVulnerabilidad: resultado.scoreVulnerabilidad,
    confianza: resultado.confianza,
    scoreRiesgoAcceso: resultado.riesgoAcceso.score,
    nivelRiesgoAcceso: resultado.riesgoAcceso.nivel,
    confianzaAcceso: resultado.riesgoAcceso.confianza,
    exposicionMatricula: resultado.exposicion.matricula,
    exposicionSecciones: resultado.exposicion.secciones,
    calculadoEn: resultado.calculadoEn,
    validoHasta: resultado.validoHasta,
    ...params.extraSnapshot,
  }
  const factores: FilaFactor[] = resultado.factores.map((factor) => ({
    id: randomUUID(),
    snapshotId,
    tipo: factor.tipo,
    fuente: factor.fuente,
    variable: factor.variable,
    valor: factor.valor,
    unidad: factor.unidad,
    contribucion: factor.contribucion,
    peso: factor.peso,
    explicacion: factor.explicacion,
    observadoEn: factor.observadoEn,
  }))
  return { resultado, snapshot, factores }
}
