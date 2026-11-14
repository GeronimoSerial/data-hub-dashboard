// Núcleo puro del motor de riesgo v0 (E3b). TypeScript puro: no importa DB ni
// red, no tiene efectos secundarios. La única dependencia temporal es el
// parámetro `asOf` (nunca se lee el reloj real). El núcleo no construye
// adapters: recibe `PuertosMotor` por inyección.
import type { HorizontePeligro, NivelPeligro, PuertosMotor, ResumenHistorial } from './puertos'
import {
  BASE_COMBINACION_V04,
  CONFIANZA_MEDIA_MAX_FALTANTES,
  HISTORIAL_TOPE_ACCESO_INTERRUMPIDO,
  HISTORIAL_TOPE_CANTIDAD,
  HISTORIAL_TOPE_DURACION_HORAS,
  MODELO_VERSION_V04,
  MOTOR_VERSION_V03,
  NIVEL_PELIGRO_A_NUMERO,
  PESOS_AMENAZA,
  PESOS_VULNERABILIDAD,
  PISO_AMENAZA_POR_ESTADO_RIO,
  PISO_AMENAZA_REDUCIDO_V04,
  PISO_RIESGO_POR_ESTADO_RIO,
  PISO_RIESGO_REDUCIDO_V04,
  PISO_RIESGO_P_ALTO_V04,
  PISO_RIESGO_P_MODERADO_V04,
  REGLAS_V04_VERSION,
  RIO_V04_MAPEO_VERSION,
  TOPE_PROFUNDIDAD_FLUVIAL_V04_M,
  UMBRAL_ALCANZABLE_V04,
  MARGEN_ERROR_DEM_V04_M,
  BANDA_EXPOSICION_V04_M,
  UMBRAL_ALTO,
  UMBRAL_MODERADO,
  UMBRAL_MUY_ALTO,
  UMBRAL_P_ALTO_V04,
  UMBRAL_P_MODERADO_V04,
  VENTANA_HISTORIAL_DIAS,
  type ReglasMotor,
} from './config'
import type {
  Confianza,
  EvidenciaRioProbabilistica,
  FactorRiesgo,
  NivelRiesgo,
  ResultadoRiesgoEscuela,
} from './tipos'
import { calcularRiesgoAcceso, type ResultadoRiesgoAcceso } from './riesgo-acceso'
import { valorAmenazaRio } from './nivel-rio'
import { valorLluviaObservada } from './lluvia-observada'
import { explicacionExposicionV04 } from './exposicion-v04'
import { explicacionAlturaCritica } from './altura-critica'

const clamp0a100 = (valor: number): number => Math.min(100, Math.max(0, valor))
const redondear2 = (valor: number): number => Math.round(valor * 100) / 100

const MS_POR_HORA = 1000 * 60 * 60

interface ComponentePendiente {
  factor: FactorRiesgo
  valorNumerico: number
  pesoBase: number
}

// Normaliza los pesos de los componentes PRESENTES (un componente ausente no
// imputa 0: su peso se redistribuye entre los presentes) y devuelve el
// sub-score 0..100. Si no hay ningún componente presente devuelve null: el
// llamador nunca divide por cero.
function cerrarDimension(pendientes: ComponentePendiente[]): number | null {
  if (pendientes.length === 0) return null
  const sumaPesos = pendientes.reduce((acc, p) => acc + p.pesoBase, 0)
  if (sumaPesos <= 0) return null
  let acumulado = 0
  for (const pendiente of pendientes) {
    const pesoNormalizado = pendiente.pesoBase / sumaPesos
    const contribucion = redondear2(pendiente.valorNumerico * pesoNormalizado)
    pendiente.factor.peso = pesoNormalizado
    pendiente.factor.contribucion = contribucion
    acumulado += contribucion
  }
  return clamp0a100(redondear2(acumulado))
}

// 'sin_dato' mapea a null a propósito (config.ts): nunca se trata como 0.
function nivelPeligroANumero(nivel: NivelPeligro): number | null {
  const valor = NIVEL_PELIGRO_A_NUMERO[nivel]
  return typeof valor === 'number' ? valor : null
}

// As-of estricto del historial. El contrato del puerto dice que los agregados
// ya vienen filtrados por `rigeDesde <= asOf`, pero el fake de tests filtra
// `antecedentes` sin recalcular sus agregados (ver nota al final de
// calculo.test.ts). Para que el as-of sea correcto aun frente a agregados
// obsoletos, TODOS los derivados (cantidad, duración y acceso interrumpido) se
// recalculan sobre la lista de antecedentes vigentes; nunca se confía en
// `resumen.duracionTotalHoras`, que podría arrastrar un antecedente cuya
// rigeDesde es POSTERIOR a asOf y por lo tanto no cuenta para ese instante.
//
// La comparación temporal es NUMÉRICA (Date.parse), nunca lexicográfica: dos
// timestamps pueden representar el mismo instante con offsets +HH:MM o
// precisión distinta, y comparar strings daría un orden incorrecto.
function contarAntecedentesVigentes(resumen: ResumenHistorial, asOf: string) {
  const asOfMs = Date.parse(asOf)
  const vigentes = resumen.antecedentes.filter(
    (antecedente) => Date.parse(antecedente.rigeDesde) <= asOfMs,
  )
  let duracionTotalHoras = 0
  for (const antecedente of vigentes) {
    const rigeMs = Date.parse(antecedente.rigeDesde)
    const retiradaMs = antecedente.retiradaEn === null ? null : Date.parse(antecedente.retiradaEn)
    // Si retiradaEn es null o posterior a asOf, la afectación seguía vigente en
    // el instante simulado: la duración se corta en asOf, nunca se usa un
    // cierre futuro como si ya hubiera ocurrido. Mismo criterio que el adapter
    // real en motor/adaptadores/historial.ts.
    const finMs = retiradaMs !== null && retiradaMs <= asOfMs ? retiradaMs : asOfMs
    duracionTotalHoras += Math.max(0, (finMs - rigeMs) / MS_POR_HORA)
  }
  return {
    cantidadConfirmadas: vigentes.length,
    duracionTotalHoras,
    accesoInterrumpidoCantidad: vigentes.filter((antecedente) => antecedente.accesoInterrumpido)
      .length,
  }
}

export function clasificarNivel(score: number): NivelRiesgo {
  if (score < UMBRAL_MODERADO) return 'bajo'
  if (score < UMBRAL_ALTO) return 'moderado'
  if (score < UMBRAL_MUY_ALTO) return 'alto'
  return 'muy_alto'
}

// Validez del snapshot: la más temprana entre las valideces de los niveles de
// peligro/caudal efectivamente usados; si no hubo ninguno presente, se usa
// `asOf` (no hay dato con ventana propia que respetar).
function validoHastaMasTemprano(valideces: string[], asOf: string): string {
  if (valideces.length === 0) return asOf
  let elegida = valideces[0]
  let elegidaMs = Date.parse(elegida)
  for (const validez of valideces.slice(1)) {
    const ms = Date.parse(validez)
    if (ms < elegidaMs) {
      elegida = validez
      elegidaMs = ms
    }
  }
  return elegida
}

export async function calcularRiesgoEscuela(params: {
  cueAnexo: string
  horizonte: HorizontePeligro
  asOf: string
  puertos: PuertosMotor
  // Motor v0.4 (T8): P de superación del terreno para este horizonte. Si
  // falta o `principal` es null, el cálculo es exactamente el de v0.3.
  rioProbabilistico?: EvidenciaRioProbabilistica | null
  // Reglas del cálculo (T10). Por defecto 'v0.3': el job operativo no cambia.
  reglas?: ReglasMotor
}): Promise<ResultadoRiesgoEscuela> {
  const { cueAnexo, horizonte, asOf, puertos } = params
  const v04 = params.reglas === 'v0.4'
  const modeloVersion = v04 ? `${MODELO_VERSION_V04}+${REGLAS_V04_VERSION}` : MOTOR_VERSION_V03
  const rioProb =
    params.rioProbabilistico != null && params.rioProbabilistico.principal !== null
      ? { ...params.rioProbabilistico, principal: params.rioProbabilistico.principal }
      : null

  // PASO 1 - Territorio.
  const perfil = await puertos.territorio.obtenerPerfil(cueAnexo)
  if (perfil === null || perfil.motivoExclusion !== null || perfil.geometryRef === null) {
    const factorTerritorio: FactorRiesgo = {
      tipo: 'amenaza',
      fuente: 'territorio',
      variable: 'perfil',
      valor: null,
      unidad: null,
      contribucion: 0,
      peso: 0,
      explicacion: 'Sin perfil territorial valido para esta escuela',
      observadoEn: null,
    }
    return {
      cueAnexo,
      horizonteHoras: horizonte,
      evidenciaValida: false,
      scoreRiesgo: null,
      nivelRiesgo: null,
      scoreAmenaza: null,
      nivelAmenaza: null,
      scoreVulnerabilidad: null,
      confianza: 'baja',
      factores: [factorTerritorio],
      exposicion: { matricula: null, secciones: null },
      urgenciaVerificacion: { horasDesdeUltimaVerificacion: null },
      riesgoAcceso: {
        score: null,
        nivel: null,
        confianza: 'baja',
        explicacion: 'Sin perfil territorial valido: no se evaluo el riesgo de acceso',
      },
      modeloVersion,
      calculadoEn: asOf,
      validoHasta: asOf,
    }
  }

  const geometryRef = perfil.geometryRef
  const puntoRioId = perfil.puntoRioId

  const factores: FactorRiesgo[] = []
  const componentesAmenaza: ComponentePendiente[] = []
  const componentesVulnerabilidad: ComponentePendiente[] = []
  const validecesPeligro: string[] = []
  let cantidadFaltantes = 0

  // PASO 2a - Peligro por celda/horizonte.
  const niveles = await puertos.peligro.obtenerNivelesCelda({
    geometryRef,
    horizontes: [horizonte],
    asOf,
  })
  const nivelCelda = niveles.find((nivel) => nivel.horizonteHoras === horizonte)
  let peligroCeldaPresente = false
  if (nivelCelda !== undefined && nivelCelda.nivel !== 'sin_dato') {
    const valorNumerico = nivelPeligroANumero(nivelCelda.nivel)
    if (valorNumerico !== null) {
      const factor: FactorRiesgo = {
        tipo: 'amenaza',
        fuente: 'peligro-celda',
        variable: `nivel_peligro_${horizonte}h`,
        valor: valorNumerico,
        unidad: 'indice_0_100',
        contribucion: 0,
        peso: 0,
        explicacion: `Peligro estimado ${nivelCelda.nivel} a ${horizonte}h (base ${nivelCelda.base})`,
        observadoEn: nivelCelda.emitidoEn,
      }
      factores.push(factor)
      componentesAmenaza.push({
        factor,
        valorNumerico,
        pesoBase: PESOS_AMENAZA.peligroCelda,
      })
      validecesPeligro.push(nivelCelda.validoHasta)
      peligroCeldaPresente = true
      // El umbral provisorio es evidencia de MENOR CONFIANZA, no una ausencia:
      // el factor se agrega igual al score, pero cuenta como faltante para que
      // la confianza baje un escalón respecto de un percentil de climatología.
      if (nivelCelda.metodo === 'umbral_provisorio') cantidadFaltantes += 1
    }
  }
  if (!peligroCeldaPresente) cantidadFaltantes += 1

  // PASO 2b - Caudal en el punto de río asociado (sólo si existe punto).
  // `nivelPeligroCaudal` se conserva para reusarlo tal cual en el riesgo de
  // acceso (PASO 3d): el nivel ya quedó mapeado a 0..100 para el score, así que
  // la dimensión de acceso no vuelve a pedir el puerto.
  let nivelPeligroCaudal: NivelPeligro | null = null
  let caudalPresente = false
  if (puntoRioId !== null) {
    // Reglas v0.4 (F6): caudal dentro de la ventana del horizonte.
    const caudal = await puertos.peligro.obtenerNivelCaudal(
      v04 ? { puntoId: puntoRioId, asOf, horizonteHoras: horizonte } : { puntoId: puntoRioId, asOf },
    )
    nivelPeligroCaudal = caudal?.nivel ?? null
    if (caudal !== null && caudal.nivel !== 'sin_dato') {
      const valorNumerico = nivelPeligroANumero(caudal.nivel)
      if (valorNumerico !== null) {
        const factor: FactorRiesgo = {
          tipo: 'amenaza',
          fuente: 'caudal-punto-rio',
          variable: 'nivel_caudal',
          valor: valorNumerico,
          unidad: 'indice_0_100',
          contribucion: 0,
          peso: 0,
          explicacion: `Caudal estimado ${caudal.nivel} en punto de rio ${puntoRioId}`,
          observadoEn: caudal.emitidoEn,
        }
        factores.push(factor)
        componentesAmenaza.push({ factor, valorNumerico, pesoBase: PESOS_AMENAZA.caudal })
        validecesPeligro.push(caudal.validoHasta)
        caudalPresente = true
      }
    }
  }
  if (!caudalPresente) cantidadFaltantes += 1

  // PASO 2c - Lluvia observada antecedente. No existe acumulado observado de
  // más largo plazo que 72h: para 72 y 240 se usa el mismo acumulado de 72h.
  const observado = await puertos.lluviaObservada.obtenerAcumulado({ geometryRef, asOf })
  const mm = horizonte === 24 ? observado.acumuladoMm24h : observado.acumuladoMm72h
  let lluviaPresente = false
  if (mm !== null) {
    const ventana = horizonte === 24 ? 24 : 72
    const puntaje = valorLluviaObservada(
      mm,
      ventana,
      (ventana === 24 ? observado.climatologia24h : observado.climatologia72h) ?? null,
    )
    const valorNumerico = puntaje.valor
    const factor: FactorRiesgo = {
      tipo: 'amenaza',
      fuente: 'lluvia-observada',
      variable: `acumulado_${horizonte === 24 ? '24h' : '72h'}`,
      valor: mm,
      unidad: 'mm',
      contribucion: 0,
      peso: 0,
      explicacion: `Lluvia observada ${mm}mm en la ventana (fuente ${(horizonte === 24 ? observado.fuente24h : observado.fuente72h) ?? 's/d'}; puntaje ${puntaje.valor}/100 por ${puntaje.referencia})`,
      observadoEn: observado.observadoEn,
    }
    factores.push(factor)
    componentesAmenaza.push({
      factor,
      valorNumerico,
      pesoBase: PESOS_AMENAZA.lluviaAntecedente,
    })
    lluviaPresente = true
  }
  if (!lluviaPresente) cantidadFaltantes += 1

  // PASO 2d - Río observado (Prefectura). El adapter ya filtró tramo,
  // exposición física y vigencia (<= 24 h): `null` significa "escuela no
  // vinculada o no expuesta" y NO cuenta como faltante (la mayoría de las
  // escuelas no está junto a un río). 'sin_dato' (expuesta sin lectura o
  // referencia vigente) SÍ cuenta como faltante y queda como factor visible;
  // 'no_aplica' (costa de embalse) queda visible sin puntaje ni penalidad.
  const evidenciaRio = puertos.rioPrefectura
    ? await puertos.rioPrefectura.obtenerEvidencia({ cueAnexo, asOf })
    : null
  const rio = evidenciaRio !== null && !('disponibilidad' in evidenciaRio) ? evidenciaRio : null
  // Con P estimable, el factor probabilístico reemplaza al de v0.3 (incluido
  // el 'sin_dato'): la lectura observada sólo sigue aportando sus pisos.
  if (rioProb === null && evidenciaRio !== null && 'disponibilidad' in evidenciaRio) {
    factores.push({
      tipo: 'amenaza',
      fuente: 'rio-prefectura',
      variable: 'altura_rio',
      valor: null,
      unidad: evidenciaRio.disponibilidad,
      contribucion: 0,
      peso: 0,
      explicacion: `Rio ${evidenciaRio.rio} (${evidenciaRio.estacionId}): ${evidenciaRio.disponibilidad === 'sin_dato' ? 'sin dato' : 'no aplica'} - ${evidenciaRio.motivo}`,
      observadoEn: null,
    })
    if (evidenciaRio.disponibilidad === 'sin_dato') cantidadFaltantes += 1
  }
  // Reglas v0.4 (F3): alcance del agua posible en ESTE horizonte. Sin
  // exposición v0.4 (adapter v0.3 o fakes) el río no alcanza.
  const expoV04 = v04 && rio !== null ? (rio.exposicionV04?.[horizonte] ?? null) : null
  const alcanceV04 = expoV04?.alcance ?? 'ninguno'
  if (rio !== null && rioProb === null) {
    const valorNumerico = valorAmenazaRio(rio)
    const tendencia =
      rio.variacionM === null ? 's/d' : rio.variacionM > 0 ? 'crece' : rio.variacionM < 0 ? 'baja' : 'estac'
    const lectura = `Rio ${rio.rio} en ${rio.estacionId}: ${rio.lecturaM}m, estado ${rio.estado} (alerta ${rio.alertaM ?? 's/d'}m, evacuacion ${rio.evacuacionM ?? 's/d'}m), tendencia ${tendencia}`
    const detalleV04 = expoV04 === null ? `exposicion v0.4 a ${horizonte}h: sin evaluacion` : explicacionExposicionV04(expoV04, horizonte)
    if (v04 && alcanceV04 === 'ninguno') {
      // Informativo: la lectura existe pero el agua posible no alcanza el
      // terreno; no entra a la amenaza ni fija piso.
      factores.push({
        tipo: 'amenaza',
        fuente: 'rio-prefectura',
        variable: 'altura_rio',
        valor: rio.lecturaM,
        unidad: 'no_alcanzable',
        contribucion: 0,
        peso: 0,
        explicacion: `${lectura}; terreno no alcanzable: ${detalleV04}`,
        observadoEn: rio.medidaEn,
      })
    } else {
      const factor: FactorRiesgo = {
        tipo: 'amenaza',
        fuente: 'rio-prefectura',
        variable: 'altura_rio',
        valor: rio.lecturaM,
        unidad: 'm',
        contribucion: 0,
        peso: 0,
        explicacion: v04
          ? `${lectura}; escuela expuesta por ${rio.criterioExposicion}; ${detalleV04}`
          : `${lectura}; escuela expuesta por ${rio.criterioExposicion}${rio.criterioExposicion.startsWith('dem_estimado') ? ' (estimado)' : ''}`,
        observadoEn: rio.medidaEn,
      }
      factores.push(factor)
      componentesAmenaza.push({ factor, valorNumerico, pesoBase: PESOS_AMENAZA.rioPrefectura })
      if (expoV04?.confianzaBaja) cantidadFaltantes += 1
    }
  }
  let factorRioV04: FactorRiesgo | null = null
  if (rioProb !== null) {
    factorRioV04 = {
      tipo: 'amenaza',
      fuente: 'rio-v04',
      variable: 'superacion_terreno',
      valor: rioProb.principal,
      unidad: 'probabilidad',
      contribucion: 0,
      peso: 0,
      explicacion: '',
      observadoEn: asOf,
    }
    factores.push(factorRioV04)
    componentesAmenaza.push({
      factor: factorRioV04,
      valorNumerico: clamp0a100(100 * rioProb.principal),
      pesoBase: PESOS_AMENAZA.rioPrefectura,
    })
  }
  // Pisos observados. v0.3: toda escuela con evidencia. v0.4: zona modelada →
  // sólo si el agua es alcanzable (P conservadora o tendencia); resto → según
  // el alcance del horizonte (completo, reducido un nivel, ninguno).
  const alcanceModelado = v04 && rioProb !== null ? alcanceObservadoModelado(rioProb) : null
  const nivelPiso: 'completo' | 'reducido' | 'ninguno' =
    rio === null ? 'ninguno'
    : !v04 ? 'completo'
    : rioProb !== null ? alcanceModelado!.nivel
    : alcanceV04
  const pisoAmenazaRio =
    rio === null || nivelPiso === 'ninguno' ? null
    : nivelPiso === 'completo' ? PISO_AMENAZA_POR_ESTADO_RIO[rio.estado]
    : PISO_AMENAZA_REDUCIDO_V04[rio.estado]
  const pisoRiesgoRio =
    rio === null || nivelPiso === 'ninguno' ? null
    : nivelPiso === 'completo' ? PISO_RIESGO_POR_ESTADO_RIO[rio.estado]
    : PISO_RIESGO_REDUCIDO_V04[rio.estado]

  const scoreAmenazaPonderado = cerrarDimension(componentesAmenaza)
  const scoreAmenaza =
    scoreAmenazaPonderado !== null && pisoAmenazaRio !== null
      ? Math.max(scoreAmenazaPonderado, pisoAmenazaRio)
      : scoreAmenazaPonderado

  // PASO 3a - Historial (v0.3: SIEMPRE presente, un resumen con 0 confirmadas
  // es un dato real). Reglas v0.4 (F2): si el sistema no tiene ningún parte
  // cargado, 0 antecedentes es una ausencia: no entra y cuenta como faltante.
  const resumen = await puertos.historial.obtenerResumen({
    cueAnexo,
    asOf,
    ventanaDias: VENTANA_HISTORIAL_DIAS,
  })
  const { cantidadConfirmadas, duracionTotalHoras, accesoInterrumpidoCantidad } =
    contarAntecedentesVigentes(resumen, asOf)
  const scoreHistorialCrudo =
    (Math.min(100, (cantidadConfirmadas / HISTORIAL_TOPE_CANTIDAD) * 100) +
      Math.min(100, (duracionTotalHoras / HISTORIAL_TOPE_DURACION_HORAS) * 100) +
      Math.min(100, (accesoInterrumpidoCantidad / HISTORIAL_TOPE_ACCESO_INTERRUMPIDO) * 100)) /
    3
  const factorHistorial: FactorRiesgo = {
    tipo: 'vulnerabilidad',
    fuente: 'historial',
    variable: 'historial_compuesto',
    valor: cantidadConfirmadas,
    unidad: 'antecedentes_confirmados',
    contribucion: 0,
    peso: 0,
    explicacion: `${cantidadConfirmadas} antecedente(s) confirmado(s) en ${VENTANA_HISTORIAL_DIAS} dias, ${duracionTotalHoras}h totales, ${accesoInterrumpidoCantidad} con acceso interrumpido`,
    observadoEn: asOf,
  }
  if (v04 && resumen.fuenteDisponible === false) {
    cantidadFaltantes += 1
  } else {
    factores.push(factorHistorial)
    componentesVulnerabilidad.push({
      factor: factorHistorial,
      valorNumerico: scoreHistorialCrudo,
      pesoBase: PESOS_VULNERABILIDAD.historial,
    })
  }

  // PASO 3b - Aislamiento OSM. YA NO es un componente de vulnerabilidad (salió
  // de componentesVulnerabilidad / PESOS_VULNERABILIDAD en este batch): pasa a
  // ser insumo de la dimensión SEPARADA de riesgo de acceso (PASO 3d). El
  // puerto devuelve el `IndiceAislamiento` completo (nivel + conteos de cruces
  // + alternativa). `null` (sin fila) y 'sin_datos_red' (G1 no pudo calcular
  // ruta) son AMBOS ausencia, nunca 0. Su ausencia sigue contando como insumo
  // faltante para la confianza global del resultado, pero no entra al IRO.
  const indiceAislamiento = await puertos.aislamiento.obtenerIndice(cueAnexo)
  const nivelAislamiento = indiceAislamiento?.nivel ?? null
  const aislamientoPresente = nivelAislamiento !== null && nivelAislamiento !== 'sin_datos_red'
  if (!aislamientoPresente) cantidadFaltantes += 1

  // PASO 3c - Susceptibilidad estática (physrisk), catálogo abierto. Un
  // catálogo VACÍO es una ausencia, no un dato: tratar `{}` como presente con
  // valor 0 habilitaría confianza 'alta' con un componente sin datos. Mismo
  // camino que `null` (ver T-H3 en calculo.test.ts).
  const indicadores = await puertos.susceptibilidad.obtenerIndicadores(cueAnexo)
  let susceptibilidadPresente = false
  // Reglas v0.4 (F1): sólo profundidad fluvial JRC RP100, escalada por el tope
  // en metros; nunca mezclada con calor/viento/pluvial. Nula → sin dato.
  const profundidadM = indicadores?.profundidadFluvialRp100M ?? null
  if (v04 && indicadores !== null && profundidadM !== null) {
    const valorNumerico = clamp0a100(redondear2((profundidadM / TOPE_PROFUNDIDAD_FLUVIAL_V04_M) * 100))
    const factor: FactorRiesgo = {
      tipo: 'vulnerabilidad',
      fuente: 'susceptibilidad-jrc',
      variable: 'profundidad_fluvial_rp100',
      valor: profundidadM,
      unidad: 'm',
      contribucion: 0,
      peso: 0,
      explicacion: `Profundidad de inundacion fluvial JRC RP100 ${profundidadM} m (tope ${TOPE_PROFUNDIDAD_FLUVIAL_V04_M} m = 100; puntaje ${valorNumerico}; version ${indicadores.version})`,
      observadoEn: asOf,
    }
    factores.push(factor)
    componentesVulnerabilidad.push({ factor, valorNumerico, pesoBase: PESOS_VULNERABILIDAD.susceptibilidad })
    susceptibilidadPresente = true
  } else if (!v04 && indicadores !== null && Object.keys(indicadores.indicadores).length > 0) {
    const valores = Object.values(indicadores.indicadores)
    const valorNumerico = clamp0a100(
      (valores.reduce((acc, valor) => acc + valor, 0) / valores.length) * 100,
    )
    const factor: FactorRiesgo = {
      tipo: 'vulnerabilidad',
      fuente: 'susceptibilidad-physrisk',
      variable: 'indicadores_compuesto',
      valor: valorNumerico,
      unidad: 'indice_0_100',
      contribucion: 0,
      peso: 0,
      explicacion: `Susceptibilidad estatica compuesta (version ${indicadores.version})`,
      observadoEn: asOf,
    }
    factores.push(factor)
    componentesVulnerabilidad.push({
      factor,
      valorNumerico,
      pesoBase: PESOS_VULNERABILIDAD.susceptibilidad,
    })
    susceptibilidadPresente = true
  }
  if (!susceptibilidadPresente) cantidadFaltantes += 1

  // PASO 3d - Riesgo de acceso (dimensión SEPARADA del IRO; ver
  // motor/riesgo-acceso.ts). Reusa el peligro YA leído en 2a/2b (nivelCelda /
  // nivelPeligroCaudal) y el accesoInterrumpidoCantidad YA derivado en 3a:
  // nunca vuelve a pedir un puerto. Nunca entra a scoreRiesgo/scoreVulnerabilidad.
  const riesgoAcceso: ResultadoRiesgoAcceso = calcularRiesgoAcceso({
    indice: indiceAislamiento,
    nivelPeligroCelda: nivelCelda?.nivel ?? null,
    nivelPeligroCaudal,
    accesoInterrumpidoCantidad,
  })
  factores.push({
    tipo: 'acceso',
    fuente: 'riesgo-acceso',
    variable: 'riesgo_acceso',
    valor: riesgoAcceso.score,
    unidad: riesgoAcceso.score === null ? null : 'indice_0_100',
    peso: 0,
    contribucion: 0,
    explicacion: riesgoAcceso.explicacion,
    observadoEn: asOf,
  })

  // v0.3: historial siempre presente => suma de pesos > 0 => nunca null.
  // v0.4: null si faltan historial y susceptibilidad (vulnerabilidad desconocida).
  const scoreVulnerabilidad = cerrarDimension(componentesVulnerabilidad)

  // PASO 4 - Evidencia válida y score de riesgo. La vulnerabilidad nunca
  // bloquea (historial siempre presente); sólo la ausencia total de amenaza.
  const evidenciaValida = scoreAmenaza !== null
  let scoreRiesgo: number | null = null
  let nivelRiesgo: NivelRiesgo | null = null
  if (evidenciaValida && (scoreVulnerabilidad !== null || v04)) {
    scoreRiesgo = v04
      ? clamp0a100(Math.round(scoreAmenaza * factorVulnerabilidadV04(scoreVulnerabilidad)))
      : clamp0a100(Math.round((scoreAmenaza * (scoreVulnerabilidad as number)) / 100))
    const crudo = scoreRiesgo
    if (pisoRiesgoRio !== null) scoreRiesgo = Math.max(scoreRiesgo, pisoRiesgoRio)
    const pisoProb = pisoProbabilistico(rioProb)
    if (pisoProb !== null) scoreRiesgo = Math.max(scoreRiesgo, pisoProb.valor)
    if (factorRioV04 !== null && rioProb !== null) {
      // Piso que fijó el score (el observado gana el empate: es evidencia directa).
      const piso =
        scoreRiesgo === crudo
          ? 'ninguno'
          : pisoRiesgoRio !== null && scoreRiesgo === pisoRiesgoRio
            ? `observado_${rio?.estado}`
            : (pisoProb?.etiqueta ?? 'ninguno')
      factorRioV04.explicacion = explicacionRioV04(rioProb, horizonte, piso, alcanceModelado?.texto)
    }
    nivelRiesgo = clasificarNivel(scoreRiesgo)
  }

  if (factorRioV04 !== null && rioProb !== null && factorRioV04.explicacion === '') {
    factorRioV04.explicacion = explicacionRioV04(rioProb, horizonte, 'ninguno', alcanceModelado?.texto)
  }

  // PASO 5 - Confianza.
  const confianza: Confianza = !evidenciaValida
    ? 'baja'
    : cantidadFaltantes === 0
      ? 'alta'
      : cantidadFaltantes <= CONFIANZA_MEDIA_MAX_FALTANTES
        ? 'media'
        : 'baja'

  // PASO 6 - Exposición (dimensión aparte, nunca se mezcla en scoreRiesgo).
  const exposicionResumen = await puertos.exposicion.obtenerResumen({ cueAnexo, asOf })
  factores.push({
    tipo: 'exposicion',
    fuente: 'matricula',
    variable: 'matricula_secciones',
    valor: exposicionResumen?.matricula ?? null,
    unidad: 'alumnos',
    peso: 0,
    contribucion: 0,
    explicacion: exposicionResumen
      ? `Matricula ${exposicionResumen.matricula} en ${exposicionResumen.secciones} seccion(es)`
      : 'Sin datos de exposicion disponibles',
    observadoEn: asOf,
  })

  // PASO 7 - Urgencia (fuera de alcance en v0: el contrato no tiene puerto de
  // verificaciones).
  factores.push({
    tipo: 'urgencia',
    fuente: 'verificacion',
    variable: 'horas_desde_ultima_verificacion',
    valor: null,
    unidad: null,
    peso: 0,
    contribucion: 0,
    explicacion:
      'No implementado en el motor v0: no hay puerto de verificaciones en el contrato de E3b',
    observadoEn: null,
  })

  // PASO 8 - Completar resultado.
  return {
    cueAnexo,
    horizonteHoras: horizonte,
    evidenciaValida,
    scoreRiesgo,
    nivelRiesgo,
    scoreAmenaza,
    nivelAmenaza: scoreAmenaza === null ? null : clasificarNivel(scoreAmenaza),
    scoreVulnerabilidad,
    confianza,
    factores,
    exposicion: {
      matricula: exposicionResumen?.matricula ?? null,
      secciones: exposicionResumen?.secciones ?? null,
    },
    urgenciaVerificacion: { horasDesdeUltimaVerificacion: null },
    riesgoAcceso,
    modeloVersion,
    calculadoEn: asOf,
    validoHasta: validoHastaMasTemprano(validecesPeligro, asOf),
  }
}

// Reglas v0.4 (F2): la vulnerabilidad modula la amenaza sin poder anularla.
// Desconocida (null) → 1: un faltante nunca baja el riesgo.
function factorVulnerabilidadV04(scoreVulnerabilidad: number | null): number {
  if (scoreVulnerabilidad === null) return 1
  return BASE_COMBINACION_V04 + (1 - BASE_COMBINACION_V04) * (scoreVulnerabilidad / 100)
}

// Pisos de riesgo por probabilidad (motor v0.4, provisorios en config.ts).
function pisoProbabilistico(
  rioProb: EvidenciaRioProbabilistica | null,
): { valor: number; etiqueta: string } | null {
  if (rioProb === null) return null
  if (rioProb.principal !== null && rioProb.principal >= UMBRAL_P_ALTO_V04) {
    return { valor: PISO_RIESGO_P_ALTO_V04, etiqueta: 'probabilistico_alto' }
  }
  if (rioProb.conservador !== null && rioProb.conservador >= UMBRAL_P_MODERADO_V04) {
    return { valor: PISO_RIESGO_P_MODERADO_V04, etiqueta: 'probabilistico_moderado' }
  }
  return null
}

// El factor persistido no tiene columna de metadatos: método, versión,
// horizonte, P conservadora y piso aplicado viajan en la explicación con un
// formato estable (lo leen explicar-snapshot.ts y motor-v04/comparacion.ts).
function explicacionRioV04(
  rioProb: EvidenciaRioProbabilistica,
  horizonte: HorizontePeligro,
  piso: string,
  alcance?: string,
): string {
  const base = `Rio v0.4: P superacion del terreno ${rioProb.principal} a ${horizonte}h; conservador ${rioProb.conservador ?? 's/d'}; metodo ${rioProb.metodo} version ${rioProb.version}; mapeo ${RIO_V04_MAPEO_VERSION}; piso ${piso}`
  return alcance === undefined ? base : `${base}; alcance_observado ${alcance}`
}

// Reglas v0.4 (F3 + T10b), zona modelada: mismo margen de error vertical y
// banda que la zona DEM. umbral = cota_conservadora − MARGEN_ERROR_DEM_V04_M.
//   completo: P(máx ≥ umbral) ≥ UMBRAL_ALCANZABLE o tendencia ≥ umbral;
//   reducido: lo mismo contra umbral − BANDA (piso un nivel menor);
//   ninguno: el resto.
// Sin `alcanceMargen` (cota conservadora sin P con margen) se usa la P exacta
// (conservadora o principal) para ambos umbrales.
function alcanceObservadoModelado(rioProb: EvidenciaRioProbabilistica): { nivel: 'completo' | 'reducido' | 'ninguno'; texto: string } {
  // T10d: con altura crítica, la compuerta es P(máx escala ≥ h_crit) /
  // tendencia, con piso S2 y defensa (motor/altura-critica.ts).
  const altura = rioProb.alcanceMargen?.alturaCritica ?? null
  if (altura) return { nivel: altura.alcance, texto: `${altura.alcance}: ${explicacionAlturaCritica(altura, rioProb.ventanaHoras)}` }
  const pExacta = rioProb.conservador ?? rioProb.principal
  const pUmbral = rioProb.alcanceMargen ? rioProb.alcanceMargen.pUmbral : pExacta
  const pBanda = rioProb.alcanceMargen ? rioProb.alcanceMargen.pBanda : pExacta
  const t = rioProb.tendencia ?? null
  const cota = rioProb.alcanceMargen?.cotaConservadoraM ?? t?.cotaM ?? null
  const redondear = (x: number) => Math.round(x * 100) / 100
  const umbral = cota === null ? null : redondear(cota - MARGEN_ERROR_DEM_V04_M)
  const umbralBanda = umbral === null ? null : redondear(umbral - BANDA_EXPOSICION_V04_M)
  const contexto = `cota_conservadora ${cota ?? 's/d'}m; margen_error ${MARGEN_ERROR_DEM_V04_M}m; banda ${BANDA_EXPOSICION_V04_M}m; umbral ${umbral ?? 's/d'}m; umbral_banda ${umbralBanda ?? 's/d'}m`
  const tendenciaTexto = t ? `tendencia nivel_sitio ${t.nivelSitioM}m` : 'sin tendencia'
  const alcanzaP = (p: number | null) => p !== null && p >= UMBRAL_ALCANZABLE_V04
  if (alcanzaP(pUmbral)) {
    return { nivel: 'completo', texto: `completo: p_umbral ${pUmbral} >= ${UMBRAL_ALCANZABLE_V04} (${contexto})` }
  }
  if (t && umbral !== null && t.nivelSitioM >= umbral) {
    return { nivel: 'completo', texto: `completo: ${tendenciaTexto} >= umbral ${umbral}m (subida ${t.subidaM}m; ${contexto})` }
  }
  if (alcanzaP(pBanda)) {
    return { nivel: 'reducido', texto: `reducido: p_banda ${pBanda} >= ${UMBRAL_ALCANZABLE_V04} (p_umbral ${pUmbral}; ${contexto})` }
  }
  if (t && umbralBanda !== null && t.nivelSitioM >= umbralBanda) {
    return { nivel: 'reducido', texto: `reducido: ${tendenciaTexto} >= umbral_banda ${umbralBanda}m (subida ${t.subidaM}m; ${contexto})` }
  }
  return {
    nivel: 'ninguno',
    texto: `ninguno (p_umbral ${pUmbral ?? 's/d'}, p_banda ${pBanda ?? 's/d'} < ${UMBRAL_ALCANZABLE_V04}; ${tendenciaTexto}; ${contexto})`,
  }
}
