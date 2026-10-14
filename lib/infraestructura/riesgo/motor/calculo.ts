// Núcleo puro del motor de riesgo v0 (E3b). TypeScript puro: no importa DB ni
// red, no tiene efectos secundarios. La única dependencia temporal es el
// parámetro `asOf` (nunca se lee el reloj real). El núcleo no construye
// adapters: recibe `PuertosMotor` por inyección.
import type { HorizontePeligro, NivelPeligro, PuertosMotor, ResumenHistorial } from './puertos'
import {
  CONFIANZA_MEDIA_MAX_FALTANTES,
  HISTORIAL_TOPE_ACCESO_INTERRUMPIDO,
  HISTORIAL_TOPE_CANTIDAD,
  HISTORIAL_TOPE_DURACION_HORAS,
  MOTOR_VERSION,
  NIVEL_PELIGRO_A_NUMERO,
  PESOS_AMENAZA,
  PESOS_VULNERABILIDAD,
  PISO_AMENAZA_POR_ESTADO_RIO,
  PISO_RIESGO_POR_ESTADO_RIO,
  UMBRAL_ALTO,
  UMBRAL_MODERADO,
  UMBRAL_MUY_ALTO,
  VENTANA_HISTORIAL_DIAS,
} from './config'
import type { Confianza, FactorRiesgo, NivelRiesgo, ResultadoRiesgoEscuela } from './tipos'
import { calcularRiesgoAcceso, type ResultadoRiesgoAcceso } from './riesgo-acceso'
import { valorAmenazaRio } from './rio-prefectura'
import { valorLluviaObservada } from './lluvia-observada'

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

function clasificarNivel(score: number): NivelRiesgo {
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
}): Promise<ResultadoRiesgoEscuela> {
  const { cueAnexo, horizonte, asOf, puertos } = params

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
      modeloVersion: MOTOR_VERSION,
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
    const caudal = await puertos.peligro.obtenerNivelCaudal({ puntoId: puntoRioId, asOf })
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
  if (evidenciaRio !== null && 'disponibilidad' in evidenciaRio) {
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
  if (rio !== null) {
    const valorNumerico = valorAmenazaRio(rio)
    const tendencia =
      rio.variacionM === null ? 's/d' : rio.variacionM > 0 ? 'crece' : rio.variacionM < 0 ? 'baja' : 'estac'
    const factor: FactorRiesgo = {
      tipo: 'amenaza',
      fuente: 'rio-prefectura',
      variable: 'altura_rio',
      valor: rio.lecturaM,
      unidad: 'm',
      contribucion: 0,
      peso: 0,
      explicacion: `Rio ${rio.rio} en ${rio.estacionId}: ${rio.lecturaM}m, estado ${rio.estado} (alerta ${rio.alertaM ?? 's/d'}m, evacuacion ${rio.evacuacionM ?? 's/d'}m), tendencia ${tendencia}; escuela expuesta por ${rio.criterioExposicion}${rio.criterioExposicion.startsWith('dem_estimado') ? ' (estimado)' : ''}`,
      observadoEn: rio.medidaEn,
    }
    factores.push(factor)
    componentesAmenaza.push({ factor, valorNumerico, pesoBase: PESOS_AMENAZA.rioPrefectura })
  }
  const pisoAmenazaRio = rio === null ? null : PISO_AMENAZA_POR_ESTADO_RIO[rio.estado]
  const pisoRiesgoRio = rio === null ? null : PISO_RIESGO_POR_ESTADO_RIO[rio.estado]

  const scoreAmenazaPonderado = cerrarDimension(componentesAmenaza)
  const scoreAmenaza =
    scoreAmenazaPonderado !== null && pisoAmenazaRio !== null
      ? Math.max(scoreAmenazaPonderado, pisoAmenazaRio)
      : scoreAmenazaPonderado

  // PASO 3a - Historial (SIEMPRE presente: un resumen con 0 confirmadas es un
  // dato real, nunca una ausencia).
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
  factores.push(factorHistorial)
  componentesVulnerabilidad.push({
    factor: factorHistorial,
    valorNumerico: scoreHistorialCrudo,
    pesoBase: PESOS_VULNERABILIDAD.historial,
  })

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
  if (indicadores !== null && Object.keys(indicadores.indicadores).length > 0) {
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

  // Historial siempre presente => suma de pesos > 0 => nunca null.
  const scoreVulnerabilidad = cerrarDimension(componentesVulnerabilidad)

  // PASO 4 - Evidencia válida y score de riesgo. La vulnerabilidad nunca
  // bloquea (historial siempre presente); sólo la ausencia total de amenaza.
  const evidenciaValida = scoreAmenaza !== null
  let scoreRiesgo: number | null = null
  let nivelRiesgo: NivelRiesgo | null = null
  if (evidenciaValida && scoreVulnerabilidad !== null) {
    scoreRiesgo = clamp0a100(Math.round((scoreAmenaza * scoreVulnerabilidad) / 100))
    if (pisoRiesgoRio !== null) scoreRiesgo = Math.max(scoreRiesgo, pisoRiesgoRio)
    nivelRiesgo = clasificarNivel(scoreRiesgo)
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
    modeloVersion: MOTOR_VERSION,
    calculadoEn: asOf,
    validoHasta: validoHastaMasTemprano(validecesPeligro, asOf),
  }
}
