// Motor de consulta del replay temporal de solo lectura (batch E7b).
//
// Dada una ventana temporal y un territorio, `generarReplay` arma un CUADRO por
// cada paso entre `desde` y `hasta`, en una de las dos vistas de tipos.ts:
//
// - 'conocido'    : as-of por fecha de REGISTRO (infra_afectacion.creadaEn).
// - 'reconstruido': as-of por fecha de VIGENCIA (infra_afectacion.rigeDesde).
//
// Cinco fuentes por cuadro: afectaciones confirmadas (infra_afectacion +
// infra_parte), snapshot de riesgo vigente (infra_risk_run + infra_risk_snapshot),
// nivel de peligro por celda (hazard_ensemble_prob / hazard_forecast +
// hazard_climatology, E3a), lluvia observada IMERG (hazard_observation) y
// salud de fuentes (hazard_source_health, ver limitación documentada en
// consultarSaludFuentes). Peligro y lluvia usan un único as-of por fecha de
// emisión/ingesta (no tienen la semántica de corrección tardía de
// infra_afectacion, así que no se dividen en las dos vistas).

import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  hazardClimatology,
  hazardEnsembleProb,
  hazardForecast,
  hazardObservation,
  hazardSourceHealth,
  infraAfectacion,
  infraEpisodioDerivado,
  infraGeoProfile,
  infraParte,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import { VARIABLE_OBSERVADA } from '@/lib/infraestructura/riesgo/jobs/sync-imerg'
import {
  MUESTRA_CLIMATOLOGIA,
  PERCENTILES_CLIMATOLOGIA,
  VARIABLE_CLIMATOLOGIA_PRECIPITACION,
  VARIABLE_ENSEMBLE,
  VARIABLE_PRONOSTICO_PRECIPITACION,
  nivelDesdeDeterministico,
  nivelDesdeEnsemble,
} from '@/lib/infraestructura/riesgo/peligro/nivel'
import {
  parametrosReplaySchema,
  type AfectacionConfirmadaReplay,
  type CuadroReplay,
  type LluviaObservadaReplay,
  type NivelPeligroReplay,
  type NivelRiesgoEscuelaReplay,
  type ParametrosReplay,
  type SaludFuenteReplay,
  type SnapshotRiesgoReplay,
  type VaciosReplay,
  type VistaReplay,
} from './tipos'

// Horizonte al que ancla el replay para el nivel de peligro por celda.
// Decisión local documentada (registro E7b): la Capa 1 (E3a) produce niveles a
// 24/72/240 h, pero el replay reconstruye "qué se sabía en t", no una
// proyección — 24 h es el horizonte más corto y el más cercano a un estado
// puntual. Ampliar a múltiples horizontes queda para el batch de UI post-E4.
const HORIZONTE_PELIGRO_REPLAY_HORAS = 24

// Tope de cuadros por respuesta. Si la ventana pedida necesita más pasos que
// este máximo, se devuelven los primeros MAX_CUADROS_POR_VENTANA y se informa
// `siguienteDesde` (el instante donde debería continuar la próxima página), en
// vez de fabricar una respuesta del tamaño que pida el cliente.
export const MAX_CUADROS_POR_VENTANA = 120

export interface ResultadoReplay {
  // vacios[i] corresponde a cuadros[i] (misma longitud, mismo orden).
  cuadros: CuadroReplay[]
  vacios: VaciosReplay[]
  // Instante ISO donde debería empezar la próxima página, o null si no hay más.
  siguienteDesde: string | null
}

const MS_HORA = 3_600_000

export async function generarReplay(params: ParametrosReplay): Promise<ResultadoReplay> {
  // Re-parsear aplica los defaults del schema (paso, territorioTipo) y valida la
  // combinación territorio/episodio antes de tocar la base.
  const p = parametrosReplaySchema.parse(params)
  const db = getDb()

  // (a) Alcance territorial y ventana temporal.
  let territorioId: string
  let desde: string
  let hasta: string

  if (p.episodioDerivadoId !== undefined) {
    const [episodio] = await db
      .select()
      .from(infraEpisodioDerivado)
      .where(eq(infraEpisodioDerivado.id, p.episodioDerivadoId))
      .limit(1)
    if (!episodio) {
      throw new Error(`episodio derivado no encontrado: ${p.episodioDerivadoId}`)
    }
    territorioId = episodio.unidadId
    desde = p.desde ?? episodio.inicioEn
    hasta = p.hasta ?? episodio.finEn ?? new Date().toISOString()
  } else {
    if (p.territorioId === undefined || p.desde === undefined || p.hasta === undefined) {
      throw new Error('Se requiere episodioDerivadoId o territorioId + desde + hasta')
    }
    territorioId = p.territorioId
    desde = p.desde
    hasta = p.hasta
  }

  // (b) Escuelas (cueAnexo) del territorio. Normalización deliberadamente
  // básica (UPPER + TRIM): la normalización completa de nombres de
  // departamento (tildes, colapso de espacios, CONCEPCION/CONCEPCIÓN) vive en
  // otros módulos (ver docs/ejecucion-enos/E2 y E3a). Acá sólo se evitan
  // diferencias de caja y espacios sobrantes alrededor.
  const filasGeo = await db
    .select({ cueAnexo: infraGeoProfile.cueAnexo, geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(
      sql`UPPER(TRIM(${infraGeoProfile.departamento})) = UPPER(TRIM(${territorioId}))`,
    )
  const cueAnexos = filasGeo.map((f) => f.cueAnexo)
  // Celdas de grilla del territorio, sin duplicados y sin null (escuela sin
  // geo-perfil calculado todavía).
  const geometryRefs = [
    ...new Set(filasGeo.map((f) => f.geometryRef).filter((ref): ref is string => ref !== null)),
  ].sort()

  // (c) Instantes de la ventana, de `desde` a `hasta` inclusive, cada `paso` h.
  const pasoMs = p.paso * MS_HORA
  const desdeMs = Date.parse(desde)
  const hastaMs = Date.parse(hasta)
  const instantes: string[] = []
  for (let t = desdeMs; t <= hastaMs; t += pasoMs) {
    instantes.push(new Date(t).toISOString())
  }

  let siguienteDesde: string | null = null
  let instantesPagina = instantes
  if (instantes.length > MAX_CUADROS_POR_VENTANA) {
    instantesPagina = instantes.slice(0, MAX_CUADROS_POR_VENTANA)
    const ultimoMs = Date.parse(instantesPagina[instantesPagina.length - 1]!)
    siguienteDesde = new Date(ultimoMs + pasoMs).toISOString()
  }

  // (d) Un cuadro por instante.
  const cuadros: CuadroReplay[] = []
  const vacios: VaciosReplay[] = []

  for (const instante of instantesPagina) {
    const afectacionesConfirmadas = await consultarAfectaciones(cueAnexos, p.vista, instante)
    const snapshotRiesgo = await consultarSnapshot(cueAnexos, instante)
    const nivelesPeligro = await consultarNivelesPeligro(geometryRefs, instante)
    const lluviaObservada = await consultarLluviaObservada(geometryRefs, instante)
    const saludFuentes = await consultarSaludFuentes(instante)

    cuadros.push({
      instante,
      afectacionesConfirmadas,
      snapshotRiesgo,
      nivelesPeligro,
      lluviaObservada,
      saludFuentes,
    })
    vacios.push({
      // Un run ausente es "sin dato de riesgo"; porEscuela vacío con run
      // presente es "no hay evidencia para esas escuelas". Son cosas distintas.
      snapshotRiesgo: snapshotRiesgo === null,
      // "sin dato" cuando NINGUNA celda del territorio resolvió nivel/lluvia en
      // este instante; nunca se rellena con el cuadro anterior.
      peligro: geometryRefs.length === 0 || nivelesPeligro.length === 0,
      lluvia: geometryRefs.length === 0 || lluviaObservada.length === 0,
    })
  }

  return { cuadros, vacios, siguienteDesde }
}

// Afectaciones confirmadas vigentes en `instante`.
//
// Las dos vistas comparten el borde de vigencia de la retirada
// (retiradaEn IS NULL OR retiradaEn > t = seguía vigente en t) y SÓLO cambian
// la fecha de inclusión: creadaEn para 'conocido', rigeDesde para
// 'reconstruido'. Nunca se usa rigeDesde en 'conocido' ni creadaEn en
// 'reconstruido'.
//
// Limitación conocida (E7b): el esquema no guarda por separado "cuándo se
// registró la retirada", sólo cuándo rige (retiradaEn), así que no se puede
// distinguir "ya se sabía que estaba retirada" de "dejó de regir". El caso
// crítico que SÍ se garantiza sin fuga es el de creación: una corrección
// tardía (creadaEn posterior al corte) no aparece en 'conocido' antes de su
// carga, porque la inclusión se decide por creadaEn.
async function consultarAfectaciones(
  cueAnexos: string[],
  vista: VistaReplay,
  instante: string,
): Promise<AfectacionConfirmadaReplay[]> {
  if (cueAnexos.length === 0) return []
  const db = getDb()
  const condicionFecha =
    vista === 'conocido'
      ? lte(infraAfectacion.creadaEn, instante)
      : lte(infraAfectacion.rigeDesde, instante)

  return db
    .select({
      cueAnexo: infraParte.cueAnexo,
      motivo: infraAfectacion.motivo,
      categoria: infraAfectacion.categoria,
      severidad: infraAfectacion.severidad,
      rigeDesde: infraAfectacion.rigeDesde,
    })
    .from(infraAfectacion)
    .innerJoin(infraParte, eq(infraAfectacion.parteId, infraParte.id))
    .where(
      and(
        inArray(infraParte.cueAnexo, cueAnexos),
        condicionFecha,
        or(isNull(infraAfectacion.retiradaEn), gt(infraAfectacion.retiradaEn, instante)),
      ),
    )
}

// Snapshot de riesgo vigente en `instante`: el run publicado más reciente con
// publicadoEn <= t, SIN filtrar por estado (un run hoy 'vencido' pudo haber
// sido el vigente en el pasado). Si no hay run, null.
async function consultarSnapshot(
  cueAnexos: string[],
  instante: string,
): Promise<SnapshotRiesgoReplay | null> {
  const db = getDb()
  const [run] = await db
    .select()
    .from(infraRiskRun)
    .where(and(isNotNull(infraRiskRun.publicadoEn), lte(infraRiskRun.publicadoEn, instante)))
    .orderBy(desc(infraRiskRun.publicadoEn))
    .limit(1)

  if (!run) return null

  // calculadoEn <= t por si un snapshot individual se calculó después del
  // publicadoEn del run; un run publicado en t no debe mostrar scores futuros.
  const porEscuela: NivelRiesgoEscuelaReplay[] =
    cueAnexos.length === 0
      ? []
      : await db
          .select({
            cueAnexo: infraRiskSnapshot.cueAnexo,
            nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
            horizonteHoras: infraRiskSnapshot.horizonteHoras,
          })
          .from(infraRiskSnapshot)
          .where(
            and(
              eq(infraRiskSnapshot.runId, run.id),
              inArray(infraRiskSnapshot.cueAnexo, cueAnexos),
              lte(infraRiskSnapshot.calculadoEn, instante),
            ),
          )

  return {
    runId: run.id,
    publicadoEn: run.publicadoEn!,
    porEscuela,
  }
}

// Nivel de peligro (Capa 1, E3a) por celda EMITIDO antes de `instante`, anclado
// a HORIZONTE_PELIGRO_REPLAY_HORAS. No hay vista 'conocido'/'reconstruido' acá:
// el peligro no tiene semántica de corrección tardía documentada, así que se
// aplica un único as-of por `corridaEn` (cuándo se emitió la corrida).
//
// Reusa las funciones puras de traducción de lib/infraestructura/riesgo/peligro/nivel.ts
// (nivelDesdeEnsemble, nivelDesdeDeterministico) para no bifurcar la regla de
// umbrales; NO reusa `obtenerNivelesPeligro` porque esa función no acepta un
// corte temporal (usa siempre la fila más reciente, sin importar el instante).
//
// Si una celda no resuelve ni ensemble ni fallback determinístico, se omite
// del arreglo (nunca 'sin_dato' inventado ni el nivel de un instante anterior).
async function consultarNivelesPeligro(
  geometryRefs: string[],
  instante: string,
): Promise<NivelPeligroReplay[]> {
  if (geometryRefs.length === 0) return []
  const db = getDb()
  const resultado: NivelPeligroReplay[] = []

  for (const geometryRef of geometryRefs) {
    const filasEnsemble = await db
      .select({
        corridaEn: hazardEnsembleProb.corridaEn,
        horizonteHoras: hazardEnsembleProb.horizonteHoras,
        probabilidadP95: hazardEnsembleProb.probabilidadP95,
        probabilidadP99: hazardEnsembleProb.probabilidadP99,
        miembrosValidos: hazardEnsembleProb.miembrosValidos,
      })
      .from(hazardEnsembleProb)
      .where(
        and(
          eq(hazardEnsembleProb.geometryRef, geometryRef),
          eq(hazardEnsembleProb.variable, VARIABLE_ENSEMBLE),
          eq(hazardEnsembleProb.horizonteHoras, HORIZONTE_PELIGRO_REPLAY_HORAS),
          lte(hazardEnsembleProb.corridaEn, instante),
        ),
      )
      .orderBy(desc(hazardEnsembleProb.corridaEn))
      .limit(1)
    const filaEnsemble = filasEnsemble[0]

    // 0 miembros válidos es "sin dato", no "0% de probabilidad" (mismo criterio
    // que cargarFilaEnsemble en nivel.ts).
    if (filaEnsemble !== undefined && filaEnsemble.miembrosValidos > 0) {
      resultado.push({
        geometryRef,
        nivel: nivelDesdeEnsemble(filaEnsemble.probabilidadP95, filaEnsemble.probabilidadP99),
        emitidoEn: filaEnsemble.corridaEn,
      })
      continue
    }

    const filasPronostico = await db
      .select({
        corridaEn: hazardForecast.corridaEn,
        horizonteHoras: hazardForecast.horizonteHoras,
        valor: hazardForecast.valor,
      })
      .from(hazardForecast)
      .where(
        and(
          eq(hazardForecast.geometryRef, geometryRef),
          eq(hazardForecast.variable, VARIABLE_PRONOSTICO_PRECIPITACION),
          eq(hazardForecast.horizonteHoras, HORIZONTE_PELIGRO_REPLAY_HORAS),
          lte(hazardForecast.corridaEn, instante),
        ),
      )
      .orderBy(desc(hazardForecast.corridaEn))
      .limit(1)
    const filaPronostico = filasPronostico[0]
    if (filaPronostico === undefined) continue

    const filasClimatologia = await db
      .select({ percentil: hazardClimatology.percentil, valor: hazardClimatology.valor })
      .from(hazardClimatology)
      .where(
        and(
          eq(hazardClimatology.geometryRef, geometryRef),
          eq(hazardClimatology.variable, VARIABLE_CLIMATOLOGIA_PRECIPITACION),
          eq(hazardClimatology.muestra, MUESTRA_CLIMATOLOGIA),
          inArray(hazardClimatology.percentil, [...PERCENTILES_CLIMATOLOGIA]),
        ),
      )
      .orderBy(desc(hazardClimatology.periodoHasta), desc(hazardClimatology.version))
    const porPercentil = new Map<string, number>()
    for (const fila of filasClimatologia) {
      if (!porPercentil.has(fila.percentil)) porPercentil.set(fila.percentil, fila.valor)
    }
    const p90 = porPercentil.get('p90')
    const p95 = porPercentil.get('p95')
    const p99 = porPercentil.get('p99')
    if (p90 === undefined || p95 === undefined || p99 === undefined) continue

    const { nivel } = nivelDesdeDeterministico(filaPronostico.valor, p90, p95, p99)
    resultado.push({ geometryRef, nivel, emitidoEn: filaPronostico.corridaEn })
  }

  return resultado
}

// Lluvia observada (NASA GPM IMERG) por celda, as-of `instante` sobre AMBAS
// fechas: `ingeridoEn` (cuándo entró al sistema) y `validoHasta` (fin de la
// ventana de 30 min del gránulo). Exigir las dos evita mostrar un gránulo cuya
// ventana de validez todavía no cerró al instante t, aunque ya se haya
// ingerido (caso borde de reproceso/backfill). Se queda con el gránulo más
// reciente por celda; si no hay ninguno, la celda queda ausente del arreglo
// ("sin dato", nunca interpolado).
async function consultarLluviaObservada(
  geometryRefs: string[],
  instante: string,
): Promise<LluviaObservadaReplay[]> {
  if (geometryRefs.length === 0) return []
  const db = getDb()
  const filas = await db
    .select({
      geometryRef: hazardObservation.geometryRef,
      valor: hazardObservation.valor,
      observadoEn: hazardObservation.observadoEn,
      validoHasta: hazardObservation.validoHasta,
      ingeridoEn: hazardObservation.ingeridoEn,
    })
    .from(hazardObservation)
    .where(
      and(
        inArray(hazardObservation.geometryRef, geometryRefs),
        eq(hazardObservation.variable, VARIABLE_OBSERVADA),
        lte(hazardObservation.ingeridoEn, instante),
        lte(hazardObservation.validoHasta, instante),
      ),
    )
    .orderBy(desc(hazardObservation.observadoEn))

  const porCelda = new Map<string, LluviaObservadaReplay>()
  for (const fila of filas) {
    if (porCelda.has(fila.geometryRef)) continue
    porCelda.set(fila.geometryRef, {
      geometryRef: fila.geometryRef,
      valorMm: fila.valor,
      observadoEn: fila.observadoEn,
    })
  }
  return geometryRefs.flatMap((ref) => {
    const fila = porCelda.get(ref)
    return fila ? [fila] : []
  })
}

// Salud de fuentes al instante `instante`. Limitación conocida (registro
// E7b): `hazard_source_health` guarda SÓLO el estado actual por proveedor
// (una fila, sin historial), así que no hay forma de reconstruir cuál era el
// estado exacto en un instante pasado. Se aplica el as-of que el esquema SÍ
// permite: si la fila se actualizó después de `instante`, se excluye (no se
// puede afirmar que ese estado ya regía en t); si se actualizó antes o en t,
// se incluye tal cual. Documentado como aproximación, no como historial real.
async function consultarSaludFuentes(instante: string): Promise<SaludFuenteReplay[]> {
  const db = getDb()
  const filas = await db
    .select({
      fuente: hazardSourceHealth.provider,
      estado: hazardSourceHealth.estado,
      actualizadoEn: hazardSourceHealth.actualizadaEn,
    })
    .from(hazardSourceHealth)
    .where(lte(hazardSourceHealth.actualizadaEn, instante))
    .orderBy(hazardSourceHealth.provider)
  return filas
}
