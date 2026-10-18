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
  leerLluviaPronosticadaDia,
  type AvisoSmnDia,
  type CaudalDia,
  type EnsambleDia,
  type LluviaPronosticadaDia,
} from './pronostico'
import { construirMetricasAmbito, type MetricaVeredicto } from './metricas'
import { impactoVacio, metricasImpacto, sumarImpacto } from './impacto'
import { impactoEsNovedad, type Impacto } from './orden'
import type { Db } from './repositorio'
import { leerRiosDia, type RioDia } from './rios'
import type { MotivoSaludFuente, SaludFuentes } from './salud-fuentes'
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
  cobertura: {
    imerg24: number | null
    fuentesAusentes: FuenteVeredicto[]
    /** Motivo de salud por fuente, sólo cuando la corrida conoce la salud de las fuentes. */
    saludFuentes?: Record<FuenteVeredicto, MotivoSaludFuente>
    /** Fin (ISO) del último gránulo IMERG recibido para hoy; sólo en tipoDia 'hoy'. */
    imergHasta?: string | null
  }
  inputsHash: string
}

type LluviaObservadaAmbitoId = LluviaObservadaAmbito['ambito']

// Gránulos IMERG de 30 min y gránulos de un día civil completo.
const MS_GRANULO = 30 * 60_000
const GRANULOS_DIA_COMPLETO = 48

/** Fin (ISO) del último gránulo recibido: su inicio más 30 min; null sin gránulos. */
export function finUltimoGranulo(granulos: GranuloLluvia[]): string | null {
  if (granulos.length === 0) return null
  // Bucle y no Math.max(...): un día real trae ~100k gránulos y el spread desborda la pila.
  let ultimoInicio = -Infinity
  for (const granulo of granulos) {
    const inicio = Date.parse(granulo.validoDesde)
    if (inicio > ultimoInicio) ultimoInicio = inicio
  }
  return new Date(ultimoInicio + MS_GRANULO).toISOString()
}

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

/**
 * Ítems del día `fecha` para la provincia y los departamentos con señal.
 * Con `salud`, una fuente no disponible se trata como ausente (nunca como "sin señal"):
 * GloFAS y ensamble no se leen en observado/hoy/pronóstico según corresponda, IMERG y
 * prefectura sólo se descartan para hoy, y el SMN se pasa como `smnDisponible`.
 */
export async function calcularDia(
  db: Db,
  { fecha, tipoDia }: VentanaDia,
  salud?: SaludFuentes,
  /** Current educational impact per normalized department; only used for today. */
  impactoActual?: Map<string, Impacto>,
): Promise<ItemDia[]> {
  const noDisponible = (fuente: keyof SaludFuentes): boolean =>
    salud !== undefined && !salud[fuente].disponible
  const esHoy = tipoDia === 'hoy'
  let imergHasta: string | null = null
  let lluvia24: EntradaEvaluacion['lluvia24'] = []
  let lluvia72: LluviaObservadaAmbito[] = []
  let rios: RioDia[] = []
  let caudal: CaudalDia[] = []
  let ensamble: EnsambleDia[] = []
  let lluviaPronosticada: LluviaPronosticadaDia[] = []
  let smn: AvisoSmnDia[] = []

  if (tipoDia !== 'pronostico' && !(esHoy && noDisponible('imerg'))) {
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

    // Hoy el día no está completo: la cobertura se mide hasta el último gránulo recibido.
    imergHasta = esHoy ? finUltimoGranulo(granulos24) : null
    const granulosHoy =
      imergHasta === null
        ? undefined
        : Math.round((Date.parse(imergHasta) - Date.parse(ventana24.desde)) / MS_GRANULO)

    const cachePercentil = new Map<string, Awaited<ReturnType<typeof leerUmbralesLluviaDiaria>>>()
    lluvia24 = await enriquecerConPercentil(
      db,
      agregarLluviaObservada({
        granulos: granulos24,
        celdas,
        dias: 1,
        granulosPorCeldaEsperados: granulosHoy,
      }),
      cachePercentil,
    )
    lluvia72 = agregarLluviaObservada({
      granulos: granulos72,
      celdas,
      dias: 3,
      // Dos días completos previos más el tramo transcurrido de hoy.
      granulosPorCeldaEsperados:
        granulosHoy === undefined ? undefined : GRANULOS_DIA_COMPLETO * 2 + granulosHoy,
    })
  }

  if (tipoDia !== 'pronostico' && !(esHoy && noDisponible('prefectura'))) {
    rios = await leerRiosDia(db, fecha)
  }

  if (tipoDia !== 'observado') {
    caudal = noDisponible('glofas') ? [] : await leerCaudalDia(db, fecha)
    ensamble = noDisponible('ensamble') ? [] : await leerEnsambleDia(db, fecha)
    lluviaPronosticada = noDisponible('ecmwf') ? [] : await leerLluviaPronosticadaDia(db, fecha)
    smn = await leerAvisosSmnDia(db, fecha)
  }

  const resultados = evaluarDia({
    tipoDia,
    lluvia24,
    lluvia72,
    rios,
    caudal,
    ensamble,
    lluviaPronosticada,
    smn,
    departamentos: listarDepartamentos(),
    smnDisponible: salud?.smn.disponible,
  })

  const motivosSalud =
    salud === undefined
      ? undefined
      : (Object.fromEntries(
          Object.entries(salud).map(([fuente, estado]) => [fuente, estado.motivo]),
        ) as Record<FuenteVeredicto, MotivoSaludFuente>)

  // The impact is a snapshot of now: it only describes today, never past or forecast days.
  const impacto = esHoy ? (impactoActual ?? new Map<string, Impacto>()) : new Map<string, Impacto>()
  const impactoDe = (ambito: string): Impacto | undefined =>
    ambito === 'provincia'
      ? impacto.size > 0
        ? sumarImpacto(impacto.values())
        : undefined
      : impacto.get(ambito.slice('departamento:'.length))

  return resultados
    .filter(
      (resultado) =>
        resultado.ambito === 'provincia' ||
        resultado.conSenal ||
        impactoEsNovedad(impactoDe(resultado.ambito) ?? impactoVacio()),
    )
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
        lluviaPronosticada,
        smn,
      })
      const impactoAmbito = impactoDe(resultado.ambito)
      if (impactoAmbito) metricas.push(...metricasImpacto(impactoAmbito))
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
          saludFuentes: motivosSalud,
          ...(esHoy ? { imergHasta } : {}),
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
