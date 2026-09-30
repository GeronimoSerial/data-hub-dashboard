// Acumulados de lluvia OBSERVADA (NASA GPM IMERG, ver providers/imerg.ts y
// jobs/sync-imerg.ts) por celda, para los horizontes 24h/72h de la Capa 1
// (MAJOR de la revisión de gate N1, docs/ejecucion-enos/E3a/registro.md
// §"Correcciones del gate N1").
//
// `hazard_observation` guarda un valor cada media hora (el acumulado de ESE
// gránulo, ya en mm/30min tras la corrección de unidades de
// providers/imerg.ts). Sumar 24h/72h es sumar los últimos 48/144 gránulos de
// media hora que terminan en el gránulo más reciente disponible (as-of aware:
// nunca se usa un gránulo cuyo fin sea posterior a `asOf`).
//
// Contrato pensado para que E3b lo consuma como adaptador delgado de
// `PuertoLluviaObservada` (lib/infraestructura/riesgo/motor/puertos.ts, aún no
// existe en este worktree): la función a llamar es
// `obtenerAcumuladoObservado({ geometryRef, horizonteHoras, asOf })`. No se
// modifican archivos de `motor/` desde acá — sólo se deja esta nota.
import { and, eq, gte, lte } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardObservation } from '@/lib/db/schema'

export type HorizonteObservado = 24 | 72

export const PROVIDER_OBSERVADO = 'nasa-imerg'
export const VARIABLE_OBSERVADA = 'precipitacion_observada_satelital'

// Cadencia nativa del producto IMERG Early Run: un gránulo cada 30 min.
const GRANULOS_POR_HORA = 2

// Bajo este umbral de cobertura (gránulos encontrados / esperados en la
// ventana) el acumulado se reporta `null` ("sin dato") en vez de un número
// que subestima la lluvia real: mejor "no sabemos" que un acumulado que
// parece confiable y no lo es. Documentado explícitamente por el punto MAJOR
// de la revisión.
export const UMBRAL_COBERTURA_MINIMA = 0.8

export interface AcumuladoObservado {
  geometryRef: string
  horizonteHoras: HorizonteObservado
  // `null` = cobertura insuficiente (< UMBRAL_COBERTURA_MINIMA) o sin ningún
  // gránulo disponible para la celda. Nunca se rellena con 0 ni se
  // subestima: la ausencia de dato queda explícita.
  acumuladoMm: number | null
  granulosEncontrados: number
  granulosEsperados: number
  // granulosEncontrados / granulosEsperados, en [0, 1].
  cobertura: number
  // `observadoEn` del gránulo más reciente considerado (el ancla de la
  // ventana), o null si no había ningún gránulo <= asOf para la celda.
  masRecienteEn: string | null
}

type GranuloBruto = { valor: number; validoHasta: string }

function ventanaVacia(geometryRef: string, horizonteHoras: HorizonteObservado): AcumuladoObservado {
  const granulosEsperados = horizonteHoras * GRANULOS_POR_HORA
  return {
    geometryRef,
    horizonteHoras,
    acumuladoMm: null,
    granulosEncontrados: 0,
    granulosEsperados,
    cobertura: 0,
    masRecienteEn: null,
  }
}

/**
 * Función pura: dado el universo de gránulos de una celda (sin filtrar ni
 * ordenar de antemano — se filtran y ordenan acá), calcula el acumulado de
 * `horizonteHoras` terminando en el gránulo más reciente con
 * `validoHasta <= asOf` (as-of aware: un gránulo que "vive en el futuro"
 * respecto de `asOf` nunca entra en la ventana).
 *
 * La ventana es de TIEMPO, no de cantidad de filas: se define como
 * `(ancla - horizonteHoras, ancla]`, donde `ancla` es el `validoHasta` del
 * gránulo más reciente <= asOf. Esto es deliberado: si hubiera un gap grande
 * en la ingesta, tomar sólo "las últimas N filas disponibles" inflaría la
 * cobertura reportada (encontraría N filas igual, pero repartidas en mucho
 * más tiempo del que dice la ventana). Acotando por tiempo, un gap real baja
 * `granulosEncontrados` y por lo tanto la cobertura, que es el
 * comportamiento correcto.
 */
export function calcularAcumuladoObservado(params: {
  geometryRef: string
  horizonteHoras: HorizonteObservado
  granulos: GranuloBruto[]
  asOf: Date
}): AcumuladoObservado {
  const { geometryRef, horizonteHoras, asOf } = params
  const asOfMs = asOf.getTime()

  const candidatos = params.granulos.filter((g) => Date.parse(g.validoHasta) <= asOfMs)
  if (candidatos.length === 0) return ventanaVacia(geometryRef, horizonteHoras)

  const anclaMs = candidatos.reduce(
    (maximo, g) => Math.max(maximo, Date.parse(g.validoHasta)),
    -Infinity,
  )
  const inicioVentanaMs = anclaMs - horizonteHoras * 60 * 60 * 1000

  const ventana = candidatos.filter((g) => {
    const t = Date.parse(g.validoHasta)
    return t > inicioVentanaMs && t <= anclaMs
  })

  const granulosEsperados = horizonteHoras * GRANULOS_POR_HORA
  const granulosEncontrados = ventana.length
  const cobertura = granulosEncontrados / granulosEsperados
  const masRecienteEn = new Date(anclaMs).toISOString()

  if (cobertura < UMBRAL_COBERTURA_MINIMA) {
    return {
      geometryRef,
      horizonteHoras,
      acumuladoMm: null,
      granulosEncontrados,
      granulosEsperados,
      cobertura,
      masRecienteEn,
    }
  }

  const acumuladoMm = ventana.reduce((total, g) => total + g.valor, 0)
  return {
    geometryRef,
    horizonteHoras,
    acumuladoMm,
    granulosEncontrados,
    granulosEsperados,
    cobertura,
    masRecienteEn,
  }
}

type Db = ReturnType<typeof getDb>

/**
 * Lee de `hazard_observation` los gránulos candidatos de la celda (acotado
 * por un margen de tiempo, no por cantidad de filas: 2x el horizonte pedido,
 * suficiente para nunca cortar la ventana real aunque haya gránulos con
 * `validoHasta` fuera de orden) y delega el cálculo de ventana/cobertura a
 * `calcularAcumuladoObservado`.
 *
 * Puerto de consumo para E3b: `PuertoLluviaObservada` (motor/puertos.ts,
 * pendiente de N1 en este worktree) debería llamar exactamente a esta
 * función — no reimplementar la suma en el motor.
 */
export async function obtenerAcumuladoObservado(params: {
  geometryRef: string
  horizonteHoras: HorizonteObservado
  asOf?: Date
}): Promise<AcumuladoObservado> {
  const db = getDb()
  const asOf = params.asOf ?? new Date()
  const margenMs = params.horizonteHoras * 2 * 60 * 60 * 1000
  const cotaInferior = new Date(asOf.getTime() - margenMs).toISOString()
  const asOfIso = asOf.toISOString()

  const filas = await consultarGranulos(db, params.geometryRef, cotaInferior, asOfIso)

  return calcularAcumuladoObservado({
    geometryRef: params.geometryRef,
    horizonteHoras: params.horizonteHoras,
    granulos: filas,
    asOf,
  })
}

async function consultarGranulos(
  db: Db,
  geometryRef: string,
  cotaInferior: string,
  cotaSuperior: string,
): Promise<GranuloBruto[]> {
  return db
    .select({ valor: hazardObservation.valor, validoHasta: hazardObservation.validoHasta })
    .from(hazardObservation)
    .where(
      and(
        eq(hazardObservation.geometryRef, geometryRef),
        eq(hazardObservation.provider, PROVIDER_OBSERVADO),
        eq(hazardObservation.variable, VARIABLE_OBSERVADA),
        gte(hazardObservation.validoHasta, cotaInferior),
        lte(hazardObservation.validoHasta, cotaSuperior),
      ),
    )
}

/** Conveniencia para pedir ambos horizontes (24h y 72h) de una sola celda. */
export async function obtenerAcumuladosObservados(params: {
  geometryRef: string
  asOf?: Date
}): Promise<AcumuladoObservado[]> {
  const asOf = params.asOf ?? new Date()
  return Promise.all(
    ([24, 72] as HorizonteObservado[]).map((horizonteHoras) =>
      obtenerAcumuladoObservado({ geometryRef: params.geometryRef, horizonteHoras, asOf }),
    ),
  )
}
