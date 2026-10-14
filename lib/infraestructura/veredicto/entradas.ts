// Composición de los insumos del veredicto diario por día y ámbito: lee la base,
// agrega la lluvia observada, evalúa las reglas y arma un ítem por ámbito con
// señal (más la provincia siempre) listo para persistir o enviar a la IA.

import { calcularInputsHash } from './hash'
import { departamentoDeCelda, listarDepartamentos } from './celda-departamento'
import { fechaArt, rangoUtcDeDiaArt, sumarDias } from './dia'
import {
  agregarLluviaObservada,
  leerGranulosImerg,
  leerUmbralesLluviaDiaria,
  percentilClimatologico,
  type GranuloLluvia,
  type LluviaObservadaAmbito,
  type PercentilLluvia,
} from './lluvia-observada'
import { VERSION_PROMPT_VEREDICTO } from './prompt'
import {
  leerAvisosSmnDia,
  leerCaudalDia,
  leerEnsambleDia,
  type AvisoSmnDia,
  type CaudalDia,
  type EnsambleDia,
} from './pronostico'
import { construirMetricasAmbito, type MetricaVeredicto } from './metricas'
import type { Db } from './repositorio'
import { leerRiosDia, type RioDia } from './rios'
import {
  evaluarDia,
  VERSION_REGLAS,
  type EntradaEvaluacion,
  type FuenteVeredicto,
  type NivelVeredicto,
  type TipoDia,
  type AguaArribaVeredicto,
  type TrazaRegla,
} from './reglas'

export type VentanaDia = { fecha: string; tipoDia: TipoDia }

export type ItemDia = {
  fecha: string
  tipoDia: TipoDia
  ambito: LluviaObservadaAmbitoId
  nivel: NivelVeredicto
  traza: TrazaRegla[]
  /** Sólo provincia; contexto informativo, no entra en `inputsHash` (ver nota allí). */
  aguasArriba: AguaArribaVeredicto[]
  fuentesAusentes: FuenteVeredicto[]
  conSenal: boolean
  metricas: MetricaVeredicto[]
  cobertura: { imerg24: number | null; fuentesAusentes: FuenteVeredicto[] }
  inputsHash: string
}

type LluviaObservadaAmbitoId = LluviaObservadaAmbito['ambito']

/** Días de la ventana: `diasObservados` previos, hoy y `diasPronostico` siguientes (día civil ART). */
export function fechasVentana(
  ahora: Date,
  diasObservados = 7,
  diasPronostico = 3,
): VentanaDia[] {
  const hoy = fechaArt(ahora)
  const observados: VentanaDia[] = Array.from({ length: diasObservados }, (_, i) => ({
    fecha: sumarDias(hoy, i - diasObservados),
    tipoDia: 'observado',
  }))
  const pronosticos: VentanaDia[] = Array.from({ length: diasPronostico }, (_, i) => ({
    fecha: sumarDias(hoy, i + 1),
    tipoDia: 'pronostico',
  }))
  return [...observados, { fecha: hoy, tipoDia: 'hoy' }, ...pronosticos]
}

async function enriquecerConPercentil(
  db: Db,
  lluvia: LluviaObservadaAmbito[],
  cachePercentil: Map<string, Awaited<ReturnType<typeof leerUmbralesLluviaDiaria>>>,
): Promise<EntradaEvaluacion['lluvia24']> {
  const resultado: EntradaEvaluacion['lluvia24'] = []
  for (const entrada of lluvia) {
    let umbrales = cachePercentil.get(entrada.celdaMax)
    if (umbrales === undefined) {
      umbrales = await leerUmbralesLluviaDiaria(db, entrada.celdaMax)
      cachePercentil.set(entrada.celdaMax, umbrales)
    }
    const percentilMax: PercentilLluvia | null = percentilClimatologico(entrada.maxMm, umbrales)
    resultado.push({ ...entrada, percentilMax })
  }
  return resultado
}

/** Ítems del día `fecha` para la provincia y los departamentos con señal. */
export async function calcularDia(
  db: Db,
  { fecha, tipoDia }: VentanaDia,
): Promise<ItemDia[]> {
  let lluvia24: EntradaEvaluacion['lluvia24'] = []
  let lluvia72: LluviaObservadaAmbito[] = []
  let rios: RioDia[] = []
  let caudal: CaudalDia[] = []
  let ensamble: EnsambleDia[] = []
  let smn: AvisoSmnDia[] = []

  if (tipoDia !== 'pronostico') {
    const ventana24 = rangoUtcDeDiaArt(fecha)
    const ventana72Desde = rangoUtcDeDiaArt(sumarDias(fecha, -2)).desde
    const granulos24 = await leerGranulosImerg(db, ventana24.desde, ventana24.hasta)
    const granulos72 = await leerGranulosImerg(db, ventana72Desde, ventana24.hasta)

    const celdas = new Map<string, string>()
    const geometrias = new Set<string>(
      [...granulos24, ...granulos72].map((granulo: GranuloLluvia) => granulo.geometryRef),
    )
    for (const geometryRef of geometrias) {
      const departamento = departamentoDeCelda(geometryRef)
      if (departamento !== null) celdas.set(geometryRef, departamento)
    }

    const cachePercentil = new Map<string, Awaited<ReturnType<typeof leerUmbralesLluviaDiaria>>>()
    lluvia24 = await enriquecerConPercentil(
      db,
      agregarLluviaObservada({ granulos: granulos24, celdas, dias: 1 }),
      cachePercentil,
    )
    lluvia72 = agregarLluviaObservada({ granulos: granulos72, celdas, dias: 3 })
    rios = await leerRiosDia(db, fecha)
  }

  if (tipoDia !== 'observado') {
    caudal = await leerCaudalDia(db, fecha)
    ensamble = await leerEnsambleDia(db, fecha)
    smn = await leerAvisosSmnDia(db, fecha)
  }

  const resultados = evaluarDia({
    tipoDia,
    lluvia24,
    lluvia72,
    rios,
    caudal,
    ensamble,
    smn,
    departamentos: listarDepartamentos(),
  })

  return resultados
    .filter((resultado) => resultado.ambito === 'provincia' || resultado.conSenal)
    .map((resultado) => {
      const l24 = lluvia24.find((entrada) => entrada.ambito === resultado.ambito)
      const l72 = lluvia72.find((entrada) => entrada.ambito === resultado.ambito)
      const metricas = construirMetricasAmbito({
        ambito: resultado.ambito,
        lluvia24: l24,
        lluvia72: l72,
        rios,
        caudal,
        ensamble,
        smn,
      })
      return {
        fecha,
        tipoDia,
        ambito: resultado.ambito,
        nivel: resultado.nivel,
        traza: resultado.traza,
        aguasArriba: resultado.aguasArriba,
        fuentesAusentes: resultado.fuentesAusentes,
        conSenal: resultado.conSenal,
        metricas,
        cobertura: {
          imerg24: l24?.cobertura ?? null,
          fuentesAusentes: resultado.fuentesAusentes,
        },
        inputsHash: calcularInputsHash({
          metricas,
          nivel: resultado.nivel,
          versionReglas: VERSION_REGLAS,
          versionPrompt: VERSION_PROMPT_VEREDICTO,
          aguasArriba: resultado.aguasArriba,
        }),
      }
    })
}
