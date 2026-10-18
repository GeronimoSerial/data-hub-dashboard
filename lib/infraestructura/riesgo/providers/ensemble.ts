// Adapter del pronóstico por ENSEMBLE de ECMWF vía el endpoint Ensemble de
// Open-Meteo. Traduce la respuesta horaria de los 51 miembros (1 de control +
// 50 numerados) a probabilidades de superar umbrales de climatología.
//
// Decisiones clave:
// - Las celdas se consultan por LOTES de `TAMANO_LOTE_COORDENADAS_ENSEMBLE` en
//   UNA sola request (latitude/longitude separadas por coma): Open-Meteo
//   devuelve un array de objetos, uno por coordenada y EN EL MISMO ORDEN en que
//   se enviaron, así que el parseo empareja por índice (mismo patrón que
//   `ecmwf.ts`).
// - Cada serie horaria trae 51 columnas por hora (`precipitation` + los 50
//   `precipitation_memberNN`), mucho más pesado que el determinístico: por eso
//   el lote baja de 50 a 20 coordenadas y con ~387 celdas reales esto da ~20
//   llamadas por ciclo.
// - El acumulado de 24 h por miembro suma las 24 horas de ESE miembro. Si
//   alguna hora es null, el acumulado de ese miembro para esa ventana es null
//   (NO se imputa 0). La probabilidad se calcula sólo sobre miembros válidos.
// - Un fallo de lote no tumba al resto: sus celdas van a `erroresPorCelda` y se
//   siguen procesando los demás lotes.
import { z } from 'zod'
import { agruparEnLotes, construirUrlLoteOpenMeteo, crearParserLote } from './lotes'
import { isoUtc, parsearTimestampUtc } from './timestamps'
import { ejecutarConReintentos } from './cliente-http'
import { apiKeyDesdeEntorno, limiteVentana, MOTIVOS_CORTAN_LOTES, MOTIVOS_CUPO_SIN_RED, pesoLlamada } from './cupo-om'
import type { ControladorCupoOM } from './cupo-om'
import { CONFIG_FUENTES } from './config-fuentes'

const RUTA = CONFIG_FUENTES.ensemble.ruta
const MS_POR_HORA = 3_600_000

// Único modelo ECMWF disponible en la API Ensemble de Open-Meteo hoy.
export const MODELO_ENSEMBLE = CONFIG_FUENTES.ensemble.modelo

// 20 coordenadas por request (no 50 como el determinístico): cada coordenada
// trae 51 series horarias, así que el payload por celda es ~50x más grande.
// Con ~387 celdas reales esto da ~20 llamadas por ciclo sin generar respuestas
// gigantes.
export const TAMANO_LOTE_COORDENADAS_ENSEMBLE = CONFIG_FUENTES.ensemble.tamanoLote

// Horizonte pedido a la API. 3 días dan 3 ventanas completas de 24 h por serie
// y mantienen acotado el peso de 51 series por coordenada (mismo horizonte que
// el fixture real ensemble-2026-09-26.json).
const DIAS_PRONOSTICO_ENSEMBLE = CONFIG_FUENTES.ensemble.diasPronostico

const MIEMBRO_CONTROL = 'precipitation'
const NOMBRES_MIEMBROS: string[] = [
  MIEMBRO_CONTROL,
  ...Array.from(
    { length: 50 },
    (_, indice) => `precipitation_member${String(indice + 1).padStart(2, '0')}`,
  ),
]
const MIEMBROS_TOTAL_ENSEMBLE = NOMBRES_MIEMBROS.length

// OM-cupo: cuántas "weather variables" cuenta este request para la fórmula
// de peso (ver providers/cupo-om.ts `pesoLlamada`). Open-Meteo cuenta cada
// miembro del ensemble como una variable: el 2026-10-18 una request de 120
// ubicaciones (`hourly=precipitation`, 1 día) respondió 200 y otra de 110
// ubicaciones en el mismo minuto respondió 429 "Minutely API request limit
// exceeded". Con 1 variable por ubicación serían 230 de 600; con 51 son
// 612 + 561. Antes se contaba 1 y la guarda interna subestimaba 5,1 veces el
// consumo real (mismo criterio que radar-meteo/ensemble.ts `PESO_ENSEMBLE`).
const VARIABLES_CONTADAS_ENSEMBLE = MIEMBROS_TOTAL_ENSEMBLE

/** Peso Open-Meteo de un lote de `ubicaciones` puntos del ensemble. */
export function pesoLoteEnsemble(ubicaciones: number): number {
  return pesoLlamada({
    ubicaciones,
    variables: VARIABLES_CONTADAS_ENSEMBLE,
    dias: DIAS_PRONOSTICO_ENSEMBLE,
  })
}

/**
 * Espera tras un lote de `ubicaciones` puntos para que el ritmo sostenido no
 * supere el límite operativo por minuto (`limiteVentana('minuto')`, 480 en el
 * plan gratuito). La ventana de minuto de la guarda es de reloj; Open-Meteo
 * puede medirla deslizante, así que espaciar evita ráfagas que crucen el
 * borde del minuto. Un lote de 20 puntos (102) espera 12,75 s.
 */
export function esperaEntreLotesEnsembleMs(ubicaciones: number, apiKeyPresente: boolean): number {
  return Math.ceil((pesoLoteEnsemble(ubicaciones) / limiteVentana('minuto', apiKeyPresente)) * 60_000)
}

function esperarReal(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Parte un array en lotes contiguos de `tamano` sin reordenar. */
/**
 * Cuántos miembros superan un umbral y qué probabilidad representa sobre los
 * miembros VÁLIDOS (no-null).
 *
 * `probabilidad = superan / miembrosValidos`. Si `miembrosValidos === 0` se
 * devuelve `probabilidad: 0` porque sin miembros válidos no hay base para
 * afirmar probabilidad positiva. OJO: el llamador debe tratar
 * `miembrosValidos === 0` como "sin dato", NO como "0% de probabilidad
 * garantizado"; por eso se expone también `miembrosValidos`, que es lo que
 * distingue ambos casos.
 */
export function contarProbabilidadSuperarUmbral(
  valoresPorMiembro: Array<number | null>,
  umbral: number,
): { probabilidad: number; miembrosValidos: number } {
  const validos = valoresPorMiembro.filter((valor): valor is number => valor !== null)
  const miembrosValidos = validos.length
  if (miembrosValidos === 0) {
    return { probabilidad: 0, miembrosValidos: 0 }
  }
  const superan = validos.filter((valor) => valor > umbral).length
  return { probabilidad: superan / miembrosValidos, miembrosValidos }
}

/**
 * Desvío estándar poblacional de los valores no-null; 0 si hay 0 o 1 valores
 * no-null. Es la base del nivel de confianza que consumirá `nivel.ts`.
 */
export function calcularDispersion(valoresPorMiembro: Array<number | null>): number {
  const validos = valoresPorMiembro.filter((valor): valor is number => valor !== null)
  if (validos.length <= 1) return 0
  const media = validos.reduce((acumulado, valor) => acumulado + valor, 0) / validos.length
  const varianza =
    validos.reduce((acumulado, valor) => acumulado + (valor - media) ** 2, 0) / validos.length
  return Math.sqrt(varianza)
}

export type HazardEnsembleProbPunto = {
  geometryRef: string
  variable: 'precipitacion_24h'
  corridaEn: string
  validoEn: string
  horizonteHoras: number
  miembrosTotal: number
  miembrosValidos: number
  probabilidadP95: number
  probabilidadP99: number
  dispersion: number
}

// Una serie horaria puede traer null en el borde del horizonte: se modela como
// nullable (NO se convierte a 0).
const hourlyEnsembleSchema = z
  .object({ time: z.array(z.string()) })
  .catchall(z.array(z.number().nullable()))
  .superRefine((hourly, ctx) => {
    const esperado = hourly.time.length
    for (const nombre of NOMBRES_MIEMBROS) {
      const serie = hourly[nombre] as Array<number | null> | undefined
      if (serie === undefined) {
        ctx.addIssue({ code: 'custom', message: `falta la serie hourly.${nombre}` })
        continue
      }
      if (serie.length !== esperado) {
        ctx.addIssue({
          code: 'custom',
          message: `hourly.${nombre} tiene ${serie.length} elementos; se esperaban ${esperado} (igual que hourly.time)`,
        })
      }
    }
  })

// Un objeto por ubicación. Con una sola coordenada Open-Meteo responde un
// objeto suelto; con varias, un array de estos objetos en el orden pedido.
const payloadEnsembleElementoSchema = z.object({ hourly: hourlyEnsembleSchema })

type PayloadEnsembleElemento = z.infer<typeof payloadEnsembleElementoSchema>

function serieDeMiembro(
  hourly: PayloadEnsembleElemento['hourly'],
  nombre: string,
): Array<number | null> {
  return (hourly as unknown as Record<string, Array<number | null>>)[nombre]
}

/** Celda resuelta de un geometryRef, lista para entrar en un lote. */
type CeldaEnsemble = { geometryRef: string; lat: number; lon: number }

function construirUrlLote(celdas: CeldaEnsemble[], apiKey: string | undefined): string {
  return construirUrlLoteOpenMeteo({
    subdominio: 'ensemble-api',
    ruta: RUTA,
    puntos: celdas,
    queryExtra: `&hourly=precipitation&models=${MODELO_ENSEMBLE}&forecast_days=${DIAS_PRONOSTICO_ENSEMBLE}&timezone=UTC`,
    apiKey,
  })
}

/**
 * Valida el payload de un lote. Acepta el objeto suelto (una coordenada) o el
 * array (varias) y exige que la cantidad coincida con las coordenadas enviadas:
 * si no, el lote entero cae como `payload_invalido` en vez de quedar
 * desalineado. El `.superRefine` del schema garantiza que las 51 series tengan
 * el mismo largo que `time`.
 */
/**
 * Acumula por miembro y calcula las probabilidades de CADA ventana de 24 h
 * consecutivas y completas de la serie. Una ventana es `[inicio, inicio+23]`;
 * el último tramo parcial se descarta porque no es un acumulado de 24 h.
 */
function puntosDeCeldaEnsemble(params: {
  geometryRef: string
  hourly: PayloadEnsembleElemento['hourly']
  corridaEn: string
  acumuladoHoras: number
  umbralP95: number
  umbralP99: number
}): HazardEnsembleProbPunto[] {
  const { geometryRef, hourly, corridaEn, acumuladoHoras, umbralP95, umbralP99 } = params
  const { time } = hourly
  const baseMs = parsearTimestampUtc(corridaEn)
  const puntos: HazardEnsembleProbPunto[] = []

  for (let inicio = 0; inicio + acumuladoHoras <= time.length; inicio += acumuladoHoras) {
    const fin = inicio + acumuladoHoras - 1
    const horizonteHoras = Math.round((parsearTimestampUtc(time[fin]) - baseMs) / MS_POR_HORA)
    if (horizonteHoras < 0) continue

    const acumulados: Array<number | null> = NOMBRES_MIEMBROS.map((nombre) => {
      const serie = serieDeMiembro(hourly, nombre)
      let suma = 0
      for (let i = inicio; i <= fin; i++) {
        const valor = serie[i]
        if (valor === null || valor === undefined) return null
        suma += valor
      }
      return suma
    })

    const { probabilidad: probabilidadP95 } = contarProbabilidadSuperarUmbral(acumulados, umbralP95)
    const { probabilidad: probabilidadP99, miembrosValidos } = contarProbabilidadSuperarUmbral(
      acumulados,
      umbralP99,
    )

    puntos.push({
      geometryRef,
      variable: 'precipitacion_24h',
      corridaEn,
      validoEn: isoUtc(time[fin]),
      horizonteHoras,
      miembrosTotal: MIEMBROS_TOTAL_ENSEMBLE,
      miembrosValidos,
      probabilidadP95,
      probabilidadP99,
      dispersion: calcularDispersion(acumulados),
    })
  }

  return puntos
}

/**
 * Obtiene las probabilidades de precipitación acumulada a 24 h por celda,
 * consultando el ensemble ECMWF por LOTES. Los umbrales p95/p99 llegan ya
 * calculados (climatología) como Map por `geometryRef`; si falta cualquiera de
 * los dos para una celda, esa celda queda en `erroresPorCelda` como
 * `'sin_climatologia'` y no afecta a las demás.
 */
export async function obtenerProbabilidadesEnsemble(params: {
  geometryRefsConCoordenada: Array<{ geometryRef: string; lat: number; lon: number }>
  corridaEn: string
  acumuladoHoras: 24
  umbralP95PorCelda: Map<string, number>
  umbralP99PorCelda: Map<string, number>
  fetchImpl?: typeof fetch
  apiKey?: string
  /** OM-cupo (opt-in): ver el mismo parámetro en providers/ecmwf.ts. */
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
  /**
   * Seam de test para el espaciado entre lotes. El espaciado sólo se aplica
   * con guarda de cupo (producción); sin ella el provider no espera.
   */
  esperar?: (ms: number) => Promise<void>
}): Promise<{
  puntos: HazardEnsembleProbPunto[]
  erroresPorCelda: Record<string, string>
  // Opcional por compatibilidad con fakes de test más viejos que no lo
  // declaren (mismo patrón que `ProveedorConDiagnostico` en
  // sync-pronostico-caudal.ts): si falta, el job asume 1 llamada por tanda
  // (comportamiento previo).
  llamadasRealizadas?: number
}> {
  const {
    geometryRefsConCoordenada,
    corridaEn,
    acumuladoHoras,
    umbralP95PorCelda,
    umbralP99PorCelda,
    fetchImpl,
    controladorCupoFactory,
  } = params
  const apiKey = params.apiKey ?? apiKeyDesdeEntorno()
  const esperar = params.esperar ?? esperarReal

  const puntos: HazardEnsembleProbPunto[] = []
  const erroresPorCelda: Record<string, string> = {}
  let llamadasRealizadas = 0

  const lotes = agruparEnLotes(geometryRefsConCoordenada, TAMANO_LOTE_COORDENADAS_ENSEMBLE)

  let ubicacionesLoteAnterior = 0

  for (let indiceLote = 0; indiceLote < lotes.length; indiceLote++) {
    const lote = lotes[indiceLote]
    if (controladorCupoFactory && ubicacionesLoteAnterior > 0) {
      await esperar(esperaEntreLotesEnsembleMs(ubicacionesLoteAnterior, Boolean(apiKey)))
    }
    const peso = pesoLoteEnsemble(lote.length)
    const cupo = controladorCupoFactory?.(peso)
    const resultado = await ejecutarConReintentos<PayloadEnsembleElemento[]>({
      url: construirUrlLote(lote, apiKey),
      fetchImpl,
      cupo,
      parsearPayload: crearParserLote(payloadEnsembleElementoSchema, lote.length),
    })

    if (!resultado.ok) {
      const detalle = `${resultado.motivo}: ${resultado.detalle}`
      if (!MOTIVOS_CUPO_SIN_RED.has(resultado.motivo)) {
        llamadasRealizadas += 1
        ubicacionesLoteAnterior = lote.length
      }
      if (MOTIVOS_CORTAN_LOTES.has(resultado.motivo)) {
        // Ver mismo razonamiento que ecmwf.ts: cupo agotado en ventana
        // larga, host en cooldown o 429 afecta a todos los lotes restantes
        // por igual.
        for (const loteRestante of lotes.slice(indiceLote + 1)) {
          for (const celda of loteRestante) erroresPorCelda[celda.geometryRef] = detalle
        }
        for (const celda of lote) erroresPorCelda[celda.geometryRef] = detalle
        break
      }
      for (const celda of lote) {
        erroresPorCelda[celda.geometryRef] = detalle
      }
      continue
    }

    llamadasRealizadas += 1
    ubicacionesLoteAnterior = lote.length

    // El array de respuesta viene en el mismo orden que las coordenadas
    // enviadas: se empareja por índice, no por el lat/lon de la respuesta.
    lote.forEach((celda, indice) => {
      const umbralP95 = umbralP95PorCelda.get(celda.geometryRef)
      const umbralP99 = umbralP99PorCelda.get(celda.geometryRef)
      if (umbralP95 === undefined || umbralP99 === undefined) {
        erroresPorCelda[celda.geometryRef] = 'sin_climatologia'
        return
      }

      puntos.push(
        ...puntosDeCeldaEnsemble({
          geometryRef: celda.geometryRef,
          hourly: resultado.datos[indice].hourly,
          corridaEn,
          acumuladoHoras,
          umbralP95,
          umbralP99,
        }),
      )
    })
  }

  return { puntos, erroresPorCelda, llamadasRealizadas }
}
