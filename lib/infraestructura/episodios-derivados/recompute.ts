// Recomputo de episodios derivados: traduce las filas persistidas del modelo
// de parte (infra_afectacion + infra_parte + infra_geo_profile + infra_movimiento)
// al input puro de la regla (lib/infraestructura/episodios-derivados/regla.ts)
// y persiste el resultado reemplazando, de forma atómica, TODA la versión de
// regla vigente.
//
// Decisiones de diseño:
// - No se filtra por período acá: el as-of estricto (nunca usar un dato
//   posterior) lo aplica la regla pura, que ya descarta las afectaciones con
//   rigeDesde > asOf. Esta capa sólo resuelve geografía y movimiento.
// - La resolución de movimientoId es por (parteId, rigeDesde) EXACTO, traído
//   una sola vez a un Map para no hacer N queries. Un movimientoId null es un
//   caso degradado esperado (datos legacy sin movimiento), no un error.
// - El reemplazo es por versión de regla: un recomputo con la misma
//   EPISODIOS_REGLA_VERSION reemplaza por completo el resultado anterior, sin
//   dejar filas residuales ni duplicadas. La unicidad transaccional
//   (delete + insert en una sola db.transaction) es la garantía de atomicidad.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import {
  infraAfectacion,
  infraEpisodioDerivado,
  infraEpisodioMiembro,
  infraGeoProfile,
  infraMovimiento,
  infraParte,
} from '@/lib/db/schema'
import {
  calcularEpisodiosDerivados,
  EPISODIOS_REGLA_VERSION,
  PARAMETROS_DEFAULT_V01,
  type AfectacionConfirmada,
  type ParametrosEpisodiosV01,
} from './regla'

export type ResultadoRecompute = {
  reglaVersion: string
  asOf: string
  episodiosCreados: number
  escuelasExcluidas: number
  departamentosProcesados: number
}

export async function recomputarEpisodiosDerivados(params?: {
  asOf?: Date
  parametros?: ParametrosEpisodiosV01
}): Promise<ResultadoRecompute> {
  const db = getDb()
  const asOf = params?.asOf ?? new Date()
  const asOfIso = asOf.toISOString()
  const parametros = params?.parametros ?? PARAMETROS_DEFAULT_V01
  const reglaVersion = EPISODIOS_REGLA_VERSION

  // 1. Todas las afectaciones, con su CUE (join a infra_parte) y su perfil
  // geográfico (left join a infra_geo_profile). Sin filtro de período: el
  // as-of lo aplica la regla.
  const filas = await db
    .select({
      parteId: infraAfectacion.parteId,
      cueAnexo: infraParte.cueAnexo,
      rigeDesde: infraAfectacion.rigeDesde,
      // Auditoría: cuándo se confirmó/registró ESTA afectación (no el parte,
      // no el movimiento correlacionado por rigeDesde — que ya es
      // best-effort, ver comentario sobre movimientoIdPorParteYRige). La
      // regla la usa como segundo as-of (follow-up del gate E7a).
      registradoEn: infraAfectacion.creadaEn,
      retiradaEn: infraAfectacion.retiradaEn,
      departamento: infraGeoProfile.departamento,
      motivoExclusion: infraGeoProfile.motivoExclusion,
    })
    .from(infraAfectacion)
    .innerJoin(infraParte, eq(infraAfectacion.parteId, infraParte.id))
    .leftJoin(infraGeoProfile, eq(infraParte.cueAnexo, infraGeoProfile.cueAnexo))

  // 3. Movimientos traídos una sola vez, indexados por la clave exacta
  // `${parteId}|${rigeDesde}`.
  const movimientos = await db
    .select({
      id: infraMovimiento.id,
      parteId: infraMovimiento.parteId,
      rigeDesde: infraMovimiento.rigeDesde,
    })
    .from(infraMovimiento)

  const movimientoIdPorParteYRige = new Map<string, string>()
  for (const movimiento of movimientos) {
    movimientoIdPorParteYRige.set(
      `${movimiento.parteId}|${movimiento.rigeDesde}`,
      movimiento.id,
    )
  }

  // 2. Exclusión geográfica por escuela (Set de cueAnexo, no filas): sin perfil
  // (departamento null) o perfil inválido (motivoExclusion no null).
  const escuelasExcluidas = new Set<string>()
  const departamentosIncluidos = new Set<string>()
  const afectaciones: AfectacionConfirmada[] = []

  for (const fila of filas) {
    if (fila.departamento === null || fila.motivoExclusion !== null) {
      escuelasExcluidas.add(fila.cueAnexo)
      continue
    }
    departamentosIncluidos.add(fila.departamento)
    afectaciones.push({
      cueAnexo: fila.cueAnexo,
      departamento: fila.departamento,
      movimientoId:
        movimientoIdPorParteYRige.get(`${fila.parteId}|${fila.rigeDesde}`) ?? null,
      rigeDesde: fila.rigeDesde,
      registradoEn: fila.registradoEn,
      retiradaEn: fila.retiradaEn,
    })
  }

  const episodios = calcularEpisodiosDerivados({
    afectaciones,
    asOf: asOfIso,
    parametros,
  })

  // 5. Reemplazo atómico por versión de regla: delete + insert completo dentro
  // de UNA sola transacción. El onDelete: 'cascade' de infra_episodio_miembro
  // limpia sus filas al borrar el episodio. Job (no request path): puede
  // toparse con SQLITE_BUSY si compite con un escritor concurrente sobre el
  // mismo hub.sqlite; reintento seguro porque la transacción se revierte
  // entera si falla a mitad de camino y el reemplazo completo es
  // re-ejecutable desde cero (mismo resultado, calculado en memoria antes de
  // la transacción).
  await conReintentoPorBloqueo(() => db.transaction(async (tx) => {
    await tx
      .delete(infraEpisodioDerivado)
      .where(eq(infraEpisodioDerivado.reglaVersion, reglaVersion))

    if (episodios.length === 0) return

    const aInsertar = episodios.map((episodio) => ({
      fila: {
        id: randomUUID(),
        reglaVersion,
        parametros,
        unidadTipo: episodio.unidadTipo,
        unidadId: episodio.unidadId,
        inicioEn: episodio.inicioEn,
        finEn: episodio.finEn,
        estado: episodio.estado,
        escuelasAfectadas: episodio.escuelasAfectadas,
        calculadoEn: asOfIso,
      },
      miembros: episodio.miembros,
    }))

    await tx.insert(infraEpisodioDerivado).values(aInsertar.map((e) => e.fila))

    const filasMiembros = aInsertar.flatMap((e) =>
      e.miembros.map((miembro) => ({
        id: randomUUID(),
        episodioDerivadoId: e.fila.id,
        cueAnexo: miembro.cueAnexo,
        movimientoId: miembro.movimientoId,
        primeraAfectacionEn: miembro.primeraAfectacionEn,
        recuperadoEn: miembro.recuperadoEn,
      })),
    )

    if (filasMiembros.length > 0) {
      await tx.insert(infraEpisodioMiembro).values(filasMiembros)
    }
  }))

  return {
    reglaVersion,
    asOf: asOfIso,
    episodiosCreados: episodios.length,
    escuelasExcluidas: escuelasExcluidas.size,
    departamentosProcesados: departamentosIncluidos.size,
  }
}
