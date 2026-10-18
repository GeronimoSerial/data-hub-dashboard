import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Generación del veredicto diario: compone los insumos de la ventana, detecta
// qué (fecha, ámbito) cambiaron, pide UNA sola respuesta a la IA para todos
// ellos y cae a la plantilla determinística por ítem cuando algo no sirve.
import { ajustarPresupuestoMes, reservarPresupuestoMes } from '../briefing-ia/presupuesto'
import { generarConOpenRouter, type ResultadoProveedorIA } from '../briefing-ia/proveedor-openrouter'
import { CONFIG_FUENTES } from '../riesgo/providers/config-fuentes'
import { calcularDia, fechasVentana, type ItemDia } from './entradas'
import { esquemaSalidaVeredicto, type FraseVeredicto, type SalidaVeredictoIA } from './esquema'
import { leerImpactoActual } from './impacto'
import { fechaArt, sumarDias } from './dia'
import { marcarCerrado, guardarVeredicto, listarVigentes, type Db, type EntradaVeredicto } from './repositorio'
import { PROMPT_SISTEMA_VEREDICTO, VERSION_PROMPT_VEREDICTO, construirMensajeUsuario } from './prompt'
import { textoPlantilla } from './plantilla'
import { VERSION_REGLAS, type FuenteVeredicto } from './reglas'
import { leerSaludFuentes } from './salud-fuentes'
import { validarVeredictoAmbito } from './terminos'

type OpcionesGenerar = {
  ahora?: Date
  jobRunId?: string
  generarConIA?: typeof generarConOpenRouter
  reservarPresupuesto?: typeof reservarPresupuestoMes
  ajustarPresupuesto?: typeof ajustarPresupuestoMes
  presupuestoUsdMes?: number
  montoReservaUsd?: number
  modelo?: string
  apiKey?: string
  /** Current educational impact per department; defaults to the live sources. */
  leerImpacto?: typeof leerImpactoActual
}

export type ResultadoGenerar = {
  evaluados: number
  sinCambios: number
  insertados: number
  fuenteIa: number
  fuentePlantilla: number
  motivoFallback: string | null
  /** Fuentes sin datos confiables en esta corrida (no disponibles o vencidas). */
  fuentesNoDisponibles: FuenteVeredicto[]
}

type Clave = string
const claveDe = (fecha: string, ambito: string): Clave => `${fecha}|${ambito}`

function presupuestoDesdeEntorno(): { presupuestoUsdMes: number; montoReservaUsd: number } {
  return {
    presupuestoUsdMes:
      Number(process.env.VEREDICTO_PRESUPUESTO_USD_MES ?? process.env.E8_PRESUPUESTO_USD_MES) || 5,
    montoReservaUsd:
      Number(process.env.VEREDICTO_COSTO_MAXIMO_USD_LLAMADA ?? process.env.E8_COSTO_MAXIMO_USD_LLAMADA) ||
      0.02,
  }
}

// AI result per (date, scope): a validated sentence or a template reason.
// Stored as `{ formato, frases: [sentence] }` so the DTO keeps exposing `frases`.
type SalidaIaFila = { formato: 'titular' | 'linea'; frases: FraseVeredicto[] }
type DecisionItem =
  | { fuente: 'ia'; textoFinal: string; salidaIa: SalidaIaFila }
  | { fuente: 'plantilla'; motivo: string }

/** The model's sentence for an item: the day headline for the province, its line otherwise. */
function fraseDe(
  dia: SalidaVeredictoIA['dias'][number] | undefined,
  ambito: string,
): { formato: SalidaIaFila['formato']; frase: FraseVeredicto } | null {
  if (!dia) return null
  if (ambito === 'provincia') return { formato: 'titular', frase: dia.titular }
  const linea = dia.departamentos.find((d) => d.ambito === ambito)
  return linea ? { formato: 'linea', frase: { texto: linea.texto, refs: linea.refs } } : null
}

function interpretarRespuesta(
  resultado: ResultadoProveedorIA,
): { ok: true; salida: SalidaVeredictoIA } | { ok: false; motivo: string } {
  if (!resultado.ok) return { ok: false, motivo: resultado.motivoFallo ?? 'error_ia' }
  if (resultado.contenido === null) return { ok: false, motivo: 'json_invalido' }
  let crudo: unknown
  try {
    crudo = JSON.parse(resultado.contenido)
  } catch {
    return { ok: false, motivo: 'json_invalido' }
  }
  const parseado = esquemaSalidaVeredicto.safeParse(crudo)
  if (!parseado.success) return { ok: false, motivo: 'json_invalido' }
  return { ok: true, salida: parseado.data }
}

export async function generarVeredictos(
  db: Db,
  opciones: OpcionesGenerar = {},
): Promise<ResultadoGenerar> {
  await cargarReferencias()
  const ahora = opciones.ahora ?? new Date()
  const generarIa = opciones.generarConIA ?? generarConOpenRouter
  const reservar = opciones.reservarPresupuesto ?? reservarPresupuestoMes
  const ajustar = opciones.ajustarPresupuesto ?? ajustarPresupuestoMes
  const entorno = presupuestoDesdeEntorno()
  const presupuestoUsdMes = opciones.presupuestoUsdMes ?? entorno.presupuestoUsdMes
  const montoReservaUsd = opciones.montoReservaUsd ?? entorno.montoReservaUsd

  const ventana = fechasVentana(ahora)
  const salud = await leerSaludFuentes(db, ahora)
  const fuentesNoDisponibles = (Object.keys(salud) as FuenteVeredicto[]).filter(
    (fuente) => !salud[fuente].disponible,
  )
  let impacto: Awaited<ReturnType<typeof leerImpactoActual>>
  try {
    impacto = await (opciones.leerImpacto ?? leerImpactoActual)(db)
  } catch {
    impacto = new Map()
  }
  const items: ItemDia[] = []
  for (const dia of ventana) items.push(...(await calcularDia(db, dia, salud, impacto)))

  const desde = ventana[0]?.fecha ?? ''
  const hasta = ventana[ventana.length - 1]?.fecha ?? ''
  const vigentes = await listarVigentes(db, { desde, hasta })
  const vigentePorClave = new Map(vigentes.map((f) => [claveDe(f.fecha, f.ambito), f]))

  const cambiados = items.filter(
    (item) => vigentePorClave.get(claveDe(item.fecha, item.ambito))?.inputsHash !== item.inputsHash,
  )
  const evaluados = items.length
  if (cambiados.length === 0) {
    return {
      evaluados,
      sinCambios: evaluados,
      insertados: 0,
      fuenteIa: 0,
      fuentePlantilla: 0,
      motivoFallback: null,
      fuentesNoDisponibles,
    }
  }

  const fechasCambiadas = new Set(cambiados.map((i) => i.fecha))
  const decisiones = new Map<Clave, DecisionItem>()
  let motivoLlamada: string | null = null
  let resultadoIa: ResultadoProveedorIA | null = null
  let modeloUsado: string | null = null

  const reserva = await reservar({ montoReservaUsd, presupuestoUsdMes, ahora })
  if (!reserva.reservado) {
    motivoLlamada = 'presupuesto_agotado'
  } else {
    modeloUsado =
      opciones.modelo ?? process.env.AI_MODEL ?? process.env.OPENROUTER_MODEL ?? CONFIG_FUENTES.openrouter.modeloPorDefecto
    try {
      resultadoIa = await generarIa(
        [
          { role: 'system', content: PROMPT_SISTEMA_VEREDICTO },
          // Whole days go to the model so the headline sees every department;
          // only the changed rows are persisted below.
          { role: 'user', content: construirMensajeUsuario(items.filter((i) => fechasCambiadas.has(i.fecha))) },
        ],
        { apiKey: opciones.apiKey, modelo: modeloUsado },
      )
    } finally {
      // Corrige el acumulado con costo real menos reserva; sin llamada, libera la reserva.
      await ajustar({
        mes: reserva.mes,
        deltaUsd: (resultadoIa?.costoUsd ?? 0) - montoReservaUsd,
        ahora,
      })
    }
  }

  if (resultadoIa) {
    const interpretada = interpretarRespuesta(resultadoIa)
    if (!interpretada.ok) {
      motivoLlamada = interpretada.motivo
    } else {
      const porFecha = new Map(interpretada.salida.dias.map((d) => [d.fecha, d]))
      for (const item of cambiados) {
        const clave = claveDe(item.fecha, item.ambito)
        const propuesta = fraseDe(porFecha.get(item.fecha), item.ambito)
        if (!propuesta) {
          decisiones.set(clave, { fuente: 'plantilla', motivo: 'sin_salida' })
          continue
        }
        const validacion = validarVeredictoAmbito([propuesta.frase], item.metricas)
        if (!validacion.valida) {
          decisiones.set(clave, { fuente: 'plantilla', motivo: validacion.motivo ?? 'validacion_fallida' })
          continue
        }
        decisiones.set(clave, {
          fuente: 'ia',
          textoFinal: propuesta.frase.texto,
          salidaIa: { formato: propuesta.formato, frases: [propuesta.frase] },
        })
      }
    }
  }

  let primeraFilaDeLlamada = true
  let insertados = 0
  let fuenteIa = 0
  let fuentePlantilla = 0
  let motivoFallback: string | null = motivoLlamada

  for (const item of cambiados) {
    const decision = decisiones.get(claveDe(item.fecha, item.ambito))
    const usaIa = decision?.fuente === 'ia'
    const motivo = usaIa ? null : (decision?.motivo ?? motivoLlamada ?? 'sin_salida')
    if (!usaIa && motivoFallback === null) motivoFallback = motivo

    // Costo, tokens y latencia se registran sólo en la primera fila de la
    // llamada: una respuesta cubre varias filas y sumarla en todas duplicaría el costo.
    const costoDeLaLlamada =
      resultadoIa && primeraFilaDeLlamada
        ? {
            tokensEntrada: resultadoIa.tokensEntrada,
            tokensSalida: resultadoIa.tokensSalida,
            costoUsd: resultadoIa.costoUsd,
            latenciaMs: resultadoIa.latenciaMs,
          }
        : { tokensEntrada: null, tokensSalida: null, costoUsd: null, latenciaMs: null }
    if (resultadoIa) primeraFilaDeLlamada = false

    const entrada: EntradaVeredicto = {
      fecha: item.fecha,
      ambito: item.ambito,
      tipoDia: item.tipoDia,
      nivel: item.nivel,
      trazaReglas: { reglas: item.traza, aguasArriba: item.aguasArriba },
      versionReglas: VERSION_REGLAS,
      metricas: { metricas: item.metricas },
      inputsHash: item.inputsHash,
      cobertura: item.cobertura,
      textoFinal: usaIa ? decision.textoFinal : textoPlantilla(item),
      salidaIa: usaIa ? decision.salidaIa : null,
      fuente: usaIa ? 'ia' : 'plantilla',
      motivoFallback: motivo,
      modelo: resultadoIa ? modeloUsado : null,
      versionPrompt: VERSION_PROMPT_VEREDICTO,
      ...costoDeLaLlamada,
      enCalibracion: true,
      generadoEn: ahora.toISOString(),
      jobRunId: opciones.jobRunId ?? null,
    }
    const guardado = await guardarVeredicto(db, entrada)
    if (guardado.estado === 'insertado') insertados++
    if (usaIa) fuenteIa++
    else fuentePlantilla++
  }

  return {
    evaluados,
    sinCambios: evaluados - insertados,
    insertados,
    fuenteIa,
    fuentePlantilla,
    motivoFallback,
    fuentesNoDisponibles,
  }
}

// Marca cerrado el día ART anterior a `ahora`: sus versiones vigentes ya no cambian.
export async function cerrarDiaAnterior(db: Db, ahora: Date): Promise<void> {
  await cargarReferencias()
  await marcarCerrado(db, sumarDias(fechaArt(ahora), -1))
}
