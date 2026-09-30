// Regla pura y determinista de "episodios derivados": agrupa afectaciones
// confirmadas de escuelas por departamento a lo largo del tiempo, formando
// episodios (unidades territoriales afectadas de forma sostenida).
//
// Sin DB, sin fetch, sin `new Date()` implícito: todo timestamp llega por
// parámetro. El caller es responsable de resolver cada escuela a su
// departamento normalizado y de excluir las escuelas sin perfil geográfico.

export const EPISODIOS_REGLA_VERSION = 'episodios-v0.1'

export type ParametrosEpisodiosV01 = {
  // Unidad territorial; hoy sólo 'departamento'. Parametrizado para poder
  // pasar a 'cuenca' en una versión futura de la regla sin cambiar la firma.
  unidadTipo: 'departamento'
  // Días sin nuevas afectaciones confirmadas en la unidad para cerrar
  // automáticamente el episodio (default 7).
  diasSinAfectacionParaCierre: number
}

export const PARAMETROS_DEFAULT_V01: ParametrosEpisodiosV01 = {
  unidadTipo: 'departamento',
  diasSinAfectacionParaCierre: 7,
}

// Una afectación confirmada de una escuela (ya resuelta a su departamento
// normalizado por el caller; escuelas sin perfil geográfico NO llegan acá,
// las excluye el caller antes). `retiradaEn` no nulo y <= asOf significa que
// la afectación fue recuperada en esa fecha; null o > asOf significa vigente
// a los fines de este cálculo. El caller nunca debería pasar retiradaEn > asOf,
// pero la regla igual lo trata de forma segura: el as-of estricto la descarta
// como recuperación y la escuela sigue vigente.
export type AfectacionConfirmada = {
  cueAnexo: string
  departamento: string
  movimientoId: string | null
  rigeDesde: string // ISO 8601
  retiradaEn: string | null // ISO 8601 o null
  // Cuándo se registró la confirmación (infra_afectacion.creada_en), no
  // cuándo empieza a regir. Es la variable de auditoría contra la que se
  // aplica el segundo as-of: un parte cargado hoy pero con rigeDesde pasado
  // no puede "aparecer" en un recompute con asOf anterior a hoy, porque ese
  // recompute nunca pudo haberlo visto en ese momento.
  registradoEn: string // ISO 8601
}

export type MiembroEpisodioCalculado = {
  cueAnexo: string
  movimientoId: string | null
  primeraAfectacionEn: string
  recuperadoEn: string | null
}

export type EpisodioCalculado = {
  unidadTipo: 'departamento'
  unidadId: string // el departamento
  inicioEn: string
  finEn: string | null
  estado: 'abierto' | 'cerrado'
  escuelasAfectadas: number // cueAnexo distintos que fueron miembro alguna vez (acumulado)
  miembros: MiembroEpisodioCalculado[]
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

type TipoEvento = 'apertura' | 'recuperacion'

type Evento = {
  t: number
  tipo: TipoEvento
  afectacion: AfectacionConfirmada
}

type EpisodioEnCurso = {
  inicioEn: string
  ultimaAperturaEnMs: number
  finEn: string | null
  estado: 'abierto' | 'cerrado'
  miembros: Map<string, MiembroEpisodioCalculado>
  vigentes: Set<string>
}

function materializar(
  episodio: EpisodioEnCurso,
  departamento: string,
): EpisodioCalculado {
  return {
    unidadTipo: 'departamento',
    unidadId: departamento,
    inicioEn: episodio.inicioEn,
    finEn: episodio.finEn,
    estado: episodio.estado,
    escuelasAfectadas: episodio.miembros.size,
    miembros: Array.from(episodio.miembros.values()),
  }
}

export function calcularEpisodiosDerivados(input: {
  afectaciones: AfectacionConfirmada[]
  asOf: string // ISO 8601
  parametros?: ParametrosEpisodiosV01
}): EpisodioCalculado[] {
  const params = input.parametros ?? PARAMETROS_DEFAULT_V01
  const nMs = params.diasSinAfectacionParaCierre * MS_POR_DIA
  const asOfMs = Date.parse(input.asOf)

  // As-of estricto por partida doble: rigeDesde <= asOf (nunca contar una
  // vigencia futura) Y registradoEn <= asOf (nunca contar un dato que en ese
  // momento todavía no existía en el sistema). Un parte registrado después
  // del corte con rigeDesde anterior al corte no debe aparecer en ese
  // recompute histórico: sólo aparece en un recompute posterior a su
  // registro (ver follow-up del gate E7a).
  const vistas = input.afectaciones.filter(
    (a) => Date.parse(a.rigeDesde) <= asOfMs && Date.parse(a.registradoEn) <= asOfMs,
  )

  const porDepartamento = new Map<string, AfectacionConfirmada[]>()
  for (const afectacion of vistas) {
    const lista = porDepartamento.get(afectacion.departamento)
    if (lista) lista.push(afectacion)
    else porDepartamento.set(afectacion.departamento, [afectacion])
  }

  const episodiosResultado: EpisodioCalculado[] = []

  // Se recorren los departamentos en orden ascendente para que el output sea
  // totalmente determinista e independiente del orden de entrada (cada
  // departamento es independiente; cualquier orden es válido, elegimos el
  // ordenado).
  const departamentos = Array.from(porDepartamento.keys()).sort()

  for (const departamento of departamentos) {
    const lista = porDepartamento.get(departamento) ?? []

    const eventos: Evento[] = []
    for (const afectacion of lista) {
      eventos.push({
        t: Date.parse(afectacion.rigeDesde),
        tipo: 'apertura',
        afectacion,
      })
      if (afectacion.retiradaEn !== null) {
        const retiradaMs = Date.parse(afectacion.retiradaEn)
        if (retiradaMs <= asOfMs) {
          eventos.push({
            t: retiradaMs,
            tipo: 'recuperacion',
            afectacion,
          })
        }
      }
    }

    // Orden determinista: por t ascendente; en empate, 'apertura' antes que
    // 'recuperacion'; en empate de tipo y t, por cueAnexo ascendente.
    const rangoTipo = (tipo: TipoEvento) => (tipo === 'apertura' ? 0 : 1)
    eventos.sort((a, b) => {
      if (a.t !== b.t) return a.t - b.t
      const r = rangoTipo(a.tipo) - rangoTipo(b.tipo)
      if (r !== 0) return r
      return a.afectacion.cueAnexo < b.afectacion.cueAnexo
        ? -1
        : a.afectacion.cueAnexo > b.afectacion.cueAnexo
          ? 1
          : 0
    })

    let episodioActual: EpisodioEnCurso | null = null

    const cerrar = (finEn: string) => {
      if (episodioActual === null) return
      episodioActual.finEn = finEn
      episodioActual.estado = 'cerrado'
      episodiosResultado.push(materializar(episodioActual, departamento))
      episodioActual = null
    }

    for (const evento of eventos) {
      // Cierre por N días sin nuevas afectaciones: se evalúa antes de
      // CUALQUIER evento (apertura o recuperación). El cierre por recuperación
      // total nunca debe ganarle a un timeout que ya venció: gana la condición
      // que ocurre más temprano. Las recuperaciones no resetean este reloj.
      if (
        episodioActual !== null &&
        evento.t - episodioActual.ultimaAperturaEnMs >= nMs
      ) {
        cerrar(
          new Date(episodioActual.ultimaAperturaEnMs + nMs).toISOString(),
        )
      }

      if (evento.tipo === 'apertura') {
        if (episodioActual === null) {
          episodioActual = {
            inicioEn: evento.afectacion.rigeDesde,
            ultimaAperturaEnMs: evento.t,
            finEn: null,
            estado: 'abierto',
            miembros: new Map(),
            vigentes: new Set(),
          }
        } else {
          episodioActual.ultimaAperturaEnMs = evento.t
        }

        const cueAnexo = evento.afectacion.cueAnexo
        const existente = episodioActual.miembros.get(cueAnexo)
        if (existente) {
          // Reingreso dentro del mismo episodio: no duplica fila, vuelve a
          // quedar vigente, actualiza movimientoId, no pisa primeraAfectacionEn.
          existente.recuperadoEn = null
          existente.movimientoId = evento.afectacion.movimientoId
        } else {
          episodioActual.miembros.set(cueAnexo, {
            cueAnexo,
            movimientoId: evento.afectacion.movimientoId,
            primeraAfectacionEn: evento.afectacion.rigeDesde,
            recuperadoEn: null,
          })
        }
        episodioActual.vigentes.add(cueAnexo)
      } else {
        // evento.tipo === 'recuperacion'
        if (
          episodioActual !== null &&
          episodioActual.miembros.has(evento.afectacion.cueAnexo)
        ) {
          const miembro = episodioActual.miembros.get(
            evento.afectacion.cueAnexo,
          )!
          miembro.recuperadoEn = evento.afectacion.retiradaEn
          episodioActual.vigentes.delete(evento.afectacion.cueAnexo)
          // Cierre por recuperación total: sin escuelas vigentes, cierra ahora.
          if (episodioActual.vigentes.size === 0) {
            cerrar(evento.afectacion.retiradaEn as string)
          }
        }
      }
    }

    // Cierre por N días contra asOf (no hay apertura futura en los datos vistos).
    if (
      episodioActual !== null &&
      asOfMs - episodioActual.ultimaAperturaEnMs >= nMs
    ) {
      cerrar(new Date(episodioActual.ultimaAperturaEnMs + nMs).toISOString())
    }

    if (episodioActual !== null) {
      episodiosResultado.push(materializar(episodioActual, departamento))
    }
  }

  return episodiosResultado
}
