// Adapter de la tendencia ENOS a 30–90 días vía el endpoint Seasonal de
// Open-Meteo (ECMWF SEAS5 + EC46, 51 miembros, ~36 km, blend
// `ecmwf_seasonal_seamless`). Capa REGIONAL opcional (plan-implementacion
// §9.3 / plan-ejecucion §E5): se consulta por CENTROIDE de departamento,
// nunca por escuela, y su resultado siempre se etiqueta explícitamente como
// pronóstico probabilístico regional.
//
// Fuentes verificadas (2026-09-27):
// - Endpoint y modelos: https://open-meteo.com/en/docs/seasonal-forecast-api
//   → base `https://seasonal-api.open-meteo.com/v1/seasonal`; `models=`
//   acepta `ecmwf_seasonal_seamless` (EC46+SEAS5 combinados, 51 miembros),
//   `ecmwf_seas5` y `ecmwf_ec46` (cada uno también 51 miembros), más sus
//   variantes `_ensemble_mean`. Resolución ~36 km (grilla O320), cobertura
//   global. EC46 actualiza a diario (20:30Z); SEAS5 el día 5 de cada mes; el
//   blend `ecmwf_seasonal_seamless` (el que usa este adapter) hereda la
//   cadencia más frecuente de EC46, así que correr el job una vez al día es
//   razonable.
// - Verificado con UNA request real (una sola vez, presupuesto de cupo
//   agotado el día de esta implementación — ver
//   docs/ejecucion-enos/SEASONAL/registro.md): `daily=precipitation_sum` con
//   `models=ecmwf_seasonal_seamless` devuelve 52 columnas diarias
//   (`precipitation_sum` = miembro de control + `precipitation_sum_memberNN`
//   para NN=01..50) y un horizonte de 183 días corridos desde la fecha de la
//   request. Fixture real fechado en
//   lib/infraestructura/riesgo/__fixtures__/hazard/seasonal-2026-09-27.json
//   (recortado a 100 días para no versionar el payload completo).
// - Pricing/cupo: https://open-meteo.com/en/pricing confirma los límites que
//   exige el usuario (600/min, 5.000/hora, 10.000/día, 300.000/mes) y que una
//   request "de intervalos largos" ya cuenta como más de 1 llamada
//   ponderada (ejemplo citado: "this API call is equivalent to 1.3 calls").
//   No hay una fórmula exacta publicada para el peso de Seasonal en
//   particular; el costo estimado de este job se documenta como aproximación
//   en el registro (no se verificó con una segunda request real).
//
// Simplificación v0 deliberada de "por encima de lo normal": esta API no
// trae una climatología independiente de 30-90 días (la tabla
// `hazard_climatology` existente es diaria, p95/p99, otra escala temporal —
// cruzarla exigiría una climatología estacional propia que no existe hoy).
// En vez de inventar una referencia sin respaldo, `probabilidadSobreNormal`
// se define como la fracción de los 50 miembros PERTURBADOS cuyo acumulado
// de la ventana [horizonteDesdeDias, horizonteHastaDias] supera al del
// MIEMBRO DE CONTROL (la corrida no perturbada, que Open-Meteo/ECMWF tratan
// como el escenario más probable). Es una simplificación explícita, no un
// percentil climatológico; el nombre de la columna y la UI lo dejan claro
// ("regional, probabilístico, nunca valor por escuela").
import { z } from 'zod'
import { agruparEnLotes, construirUrlLoteOpenMeteo, crearParserLote } from './lotes'
import { ejecutarConReintentos } from './cliente-http'
import { apiKeyDesdeEntorno, MOTIVOS_CUPO_SIN_RED, pesoLlamada } from './cupo-om'
import type { ControladorCupoOM } from './cupo-om'
import { CONFIG_FUENTES } from './config-fuentes'

const RUTA = CONFIG_FUENTES.seasonal.ruta

// Blend EC46+SEAS5: mejor cobertura de los 30-90 días pedidos sin tener que
// elegir entre el horizonte corto de EC46 (46 días) y el mensual de SEAS5.
export const MODELO_SEASONAL = CONFIG_FUENTES.seasonal.modelo

export const VARIABLE_DIARIA_SEASONAL = CONFIG_FUENTES.seasonal.variableDiaria

// 5 departamentos por request (no los 25 juntos): igual criterio que
// ensemble.ts (TAMANO_LOTE_COORDENADAS_ENSEMBLE) — acota el payload por
// llamada y aísla el radio de un fallo de red a 1/5 de los departamentos en
// vez de todos. Con 25 departamentos esto da 5 llamadas por corrida (1 vez
// al día).
export const TAMANO_LOTE_DEPARTAMENTOS_SEASONAL = CONFIG_FUENTES.seasonal.tamanoLote

// Truncar el horizonte pedido: sin este parámetro, la API devuelve el
// horizonte completo del blend (~183-210 días observado), mucho más de lo
// que hace falta para una ventana de 30-90 días. NO se reverificó con una
// segunda request real (presupuesto de cupo agotado): si Open-Meteo ignora
// el parámetro, el parseo sigue siendo correcto (se filtra por fecha, no por
// índice), sólo se pierde el ahorro de payload/costo — ver registro.md.
export const FORECAST_DAYS_SOLICITADOS = CONFIG_FUENTES.seasonal.diasPronostico

const MIEMBRO_CONTROL = VARIABLE_DIARIA_SEASONAL
const NOMBRES_MIEMBROS_PERTURBADOS: string[] = Array.from(
  { length: 50 },
  (_, indice) => `${VARIABLE_DIARIA_SEASONAL}_member${String(indice + 1).padStart(2, '0')}`,
)
const TODOS_LOS_MIEMBROS = [MIEMBRO_CONTROL, ...NOMBRES_MIEMBROS_PERTURBADOS]
export const MIEMBROS_TOTAL_SEASONAL = TODOS_LOS_MIEMBROS.length

/** Parte un array en lotes contiguos de `tamano` sin reordenar. */
export type CentroideDepartamentoConsulta = { departamento: string; lat: number; lon: number }

export type EstadisticaEstacionalDepartamento = {
  departamento: string
  variable: 'precipitacion_acumulada'
  emisionEn: string
  validoDesde: string
  validoHasta: string
  horizonteDesdeDias: number
  horizonteHastaDias: number
  miembrosTotal: number
  miembrosValidos: number
  mediaMm: number | null
  medianaMm: number | null
  dispersionMm: number | null
  probabilidadSobreNormal: number | null
}

// Igual criterio que hourlyEnsembleSchema (ensemble.ts): nullable en vez de
// imputar 0, y se valida que cada serie de miembro tenga el mismo largo que
// `time`.
const dailySeasonalSchema = z
  .object({ time: z.array(z.string()) })
  .catchall(z.array(z.number().nullable()))
  .superRefine((daily, ctx) => {
    const esperado = daily.time.length
    for (const nombre of TODOS_LOS_MIEMBROS) {
      const serie = daily[nombre] as Array<number | null> | undefined
      if (serie === undefined) {
        ctx.addIssue({ code: 'custom', message: `falta la serie daily.${nombre}` })
        continue
      }
      if (serie.length !== esperado) {
        ctx.addIssue({
          code: 'custom',
          message: `daily.${nombre} tiene ${serie.length} elementos; se esperaban ${esperado} (igual que daily.time)`,
        })
      }
    }
  })

const payloadSeasonalElementoSchema = z.object({ daily: dailySeasonalSchema })

type PayloadSeasonalElemento = z.infer<typeof payloadSeasonalElementoSchema>

function serieDeMiembro(
  daily: PayloadSeasonalElemento['daily'],
  nombre: string,
): Array<number | null> {
  return (daily as unknown as Record<string, Array<number | null>>)[nombre]
}

function construirUrlLote(
  centroides: CentroideDepartamentoConsulta[],
  apiKey: string | undefined,
): string {
  return construirUrlLoteOpenMeteo({
    subdominio: 'seasonal-api',
    ruta: RUTA,
    puntos: centroides,
    queryExtra: `&daily=${VARIABLE_DIARIA_SEASONAL}&models=${MODELO_SEASONAL}&forecast_days=${FORECAST_DAYS_SOLICITADOS}&timezone=UTC`,
    apiKey,
  })
}

/**
 * Igual criterio que ensemble.ts: acepta el objeto suelto (una coordenada) o
 * el array (varias) y exige que la cantidad coincida; si no, el lote entero
 * cae como `payload_invalido`.
 */
function fechaIsoUtc(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000)
}

/** Media aritmética; null si no hay valores. */
function media(valores: number[]): number | null {
  if (valores.length === 0) return null
  return valores.reduce((acumulado, v) => acumulado + v, 0) / valores.length
}

/** Mediana; null si no hay valores. */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenado = [...valores].sort((a, b) => a - b)
  const mitad = Math.floor(ordenado.length / 2)
  return ordenado.length % 2 === 0
    ? (ordenado[mitad - 1] + ordenado[mitad]) / 2
    : ordenado[mitad]
}

/** Desvío estándar poblacional; null si hay 0 o 1 valores (igual criterio que ensemble.ts). */
function dispersionPoblacional(valores: number[]): number | null {
  if (valores.length <= 1) return null
  const m = media(valores) as number
  const varianza = valores.reduce((acumulado, v) => acumulado + (v - m) ** 2, 0) / valores.length
  return Math.sqrt(varianza)
}

/**
 * Calcula las estadísticas de un departamento para la ventana
 * [horizonteDesdeDias, horizonteHastaDias] desde `emisionEn`: acumula cada
 * miembro sobre los días de la ventana (null si CUALQUIER día de esa serie
 * es null, igual criterio que el acumulado de 24 h de ensemble.ts — no se
 * imputa 0) y deriva media/mediana/dispersión sobre los miembros válidos más
 * `probabilidadSobreNormal` = fracción de los miembros perturbados válidos
 * que superan al miembro de control (ver nota v0 de cabecera).
 */
function estadisticaDeDepartamento(params: {
  departamento: string
  daily: PayloadSeasonalElemento['daily']
  emisionEn: Date
  horizonteDesdeDias: number
  horizonteHastaDias: number
}): EstadisticaEstacionalDepartamento {
  const { departamento, daily, emisionEn, horizonteDesdeDias, horizonteHastaDias } = params
  const validoDesde = sumarDias(emisionEn, horizonteDesdeDias)
  const validoHasta = sumarDias(emisionEn, horizonteHastaDias)

  const indices: number[] = []
  daily.time.forEach((fechaStr, indice) => {
    const fecha = new Date(`${fechaStr}T00:00:00Z`)
    if (fecha.getTime() >= validoDesde.getTime() && fecha.getTime() <= validoHasta.getTime()) {
      indices.push(indice)
    }
  })

  function acumuladoMiembro(nombre: string): number | null {
    const serie = serieDeMiembro(daily, nombre)
    let suma = 0
    for (const indice of indices) {
      const valor = serie[indice]
      if (valor === null || valor === undefined) return null
      suma += valor
    }
    return suma
  }

  const acumuladoControl = acumuladoMiembro(MIEMBRO_CONTROL)
  const acumuladosPerturbados = NOMBRES_MIEMBROS_PERTURBADOS.map((nombre) => acumuladoMiembro(nombre))
  const perturbadosValidos = acumuladosPerturbados.filter(
    (v): v is number => v !== null,
  )

  const todosValidos = [
    ...(acumuladoControl !== null ? [acumuladoControl] : []),
    ...perturbadosValidos,
  ]

  let probabilidadSobreNormal: number | null = null
  if (acumuladoControl !== null && perturbadosValidos.length > 0) {
    const superan = perturbadosValidos.filter((v) => v > acumuladoControl).length
    probabilidadSobreNormal = superan / perturbadosValidos.length
  }

  return {
    departamento,
    variable: 'precipitacion_acumulada',
    emisionEn: fechaIsoUtc(emisionEn),
    validoDesde: fechaIsoUtc(validoDesde),
    validoHasta: fechaIsoUtc(validoHasta),
    horizonteDesdeDias,
    horizonteHastaDias,
    miembrosTotal: MIEMBROS_TOTAL_SEASONAL,
    miembrosValidos: todosValidos.length,
    mediaMm: media(todosValidos),
    medianaMm: mediana(todosValidos),
    dispersionMm: dispersionPoblacional(todosValidos),
    probabilidadSobreNormal,
  }
}

/**
 * Obtiene la tendencia estacional (30-90 días por defecto) por LOTES de
 * `TAMANO_LOTE_DEPARTAMENTOS_SEASONAL` departamentos. Un lote que falla
 * (red, timeout, payload inválido) no tumba a los demás: sus departamentos
 * quedan en `erroresPorDepartamento` y el resto sigue procesándose — salvo
 * que el motivo sea de cupo (ver `MOTIVOS_CUPO_SIN_RED`), en cuyo caso se
 * corta todo el resto de una vez (no tiene sentido seguir intentando contra
 * el mismo bucket agotado).
 *
 * `variables=1` en `pesoLlamada` porque acá `daily=` sólo pide
 * `precipitation_sum` (ver VARIABLE_DIARIA_SEASONAL): los 51 miembros vienen
 * como columnas del mismo payload, Open-Meteo no los cuenta como variables
 * adicionales (ver cita de la fórmula en cupo-om.ts).
 */
export async function obtenerTendenciaEstacional(params: {
  centroides: CentroideDepartamentoConsulta[]
  emisionEn: Date
  horizonteDesdeDias?: number
  horizonteHastaDias?: number
  fetchImpl?: typeof fetch
  apiKey?: string
  /** OM-cupo (opt-in): ver el mismo parámetro en providers/ecmwf.ts. */
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
}): Promise<{
  estadisticas: EstadisticaEstacionalDepartamento[]
  erroresPorDepartamento: Record<string, string>
  llamadasRealizadas: number
}> {
  const {
    centroides,
    emisionEn,
    horizonteDesdeDias = 30,
    horizonteHastaDias = 90,
    fetchImpl,
    controladorCupoFactory,
  } = params
  const apiKey = params.apiKey ?? apiKeyDesdeEntorno()

  const estadisticas: EstadisticaEstacionalDepartamento[] = []
  const erroresPorDepartamento: Record<string, string> = {}
  let llamadasRealizadas = 0

  const lotes = agruparEnLotes(centroides, TAMANO_LOTE_DEPARTAMENTOS_SEASONAL)

  for (let indiceLote = 0; indiceLote < lotes.length; indiceLote++) {
    const lote = lotes[indiceLote]
    const peso = pesoLlamada({
      ubicaciones: lote.length,
      variables: 1,
      dias: FORECAST_DAYS_SOLICITADOS,
    })
    const cupo = controladorCupoFactory?.(peso)
    const resultado = await ejecutarConReintentos<PayloadSeasonalElemento[]>({
      url: construirUrlLote(lote, apiKey),
      fetchImpl,
      cupo,
      parsearPayload: crearParserLote(payloadSeasonalElementoSchema, lote.length, 'departamento'),
    })

    if (!resultado.ok) {
      const detalle = `${resultado.motivo}: ${resultado.detalle}`
      if (!MOTIVOS_CUPO_SIN_RED.has(resultado.motivo)) llamadasRealizadas += 1
      if (MOTIVOS_CUPO_SIN_RED.has(resultado.motivo)) {
        for (const loteRestante of lotes.slice(indiceLote + 1)) {
          for (const centroide of loteRestante) erroresPorDepartamento[centroide.departamento] = detalle
        }
        for (const centroide of lote) erroresPorDepartamento[centroide.departamento] = detalle
        break
      }
      for (const centroide of lote) {
        erroresPorDepartamento[centroide.departamento] = detalle
      }
      continue
    }

    llamadasRealizadas += 1

    // El array de respuesta viene en el mismo orden que las coordenadas
    // enviadas: se empareja por índice, no por el lat/lon de la respuesta
    // (mismo criterio que ensemble.ts).
    lote.forEach((centroide, indice) => {
      estadisticas.push(
        estadisticaDeDepartamento({
          departamento: centroide.departamento,
          daily: resultado.datos[indice].daily,
          emisionEn,
          horizonteDesdeDias,
          horizonteHastaDias,
        }),
      )
    })
  }

  return { estadisticas, erroresPorDepartamento, llamadasRealizadas }
}
