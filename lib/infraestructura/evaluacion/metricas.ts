import type { CasoReferencia, NivelTerritorial } from './conjunto-referencia'

/** One event as the detection layer published it. */
export type EventoSistema = {
  /** Reference case the event matches, or null when it matches none. */
  casoId: string | null
  /** ISO UTC instant of publication in the system. */
  publicadoEn: string
  respaldado: boolean
  nivelTerritorial: NivelTerritorial
}

export type DemoraCaso = {
  casoId: string
  desdeInicioHoras: number | null
  desdePrimeraPublicacionHoras: number | null
}

const MS_POR_HORA = 3_600_000

const horasEntre = (desde: string | null, hasta: string): number | null => {
  if (desde === null) return null
  return (Date.parse(hasta) - Date.parse(desde)) / MS_POR_HORA
}

const positivos = (conjunto: readonly CasoReferencia[]) =>
  conjunto.filter((caso) => caso.clase === 'positivo')

/**
 * Share of reference positives with at least one matching system event.
 * Returns 0 when nothing is covered and null when the set has no positives.
 */
export const calcularCobertura = (
  conjunto: readonly CasoReferencia[],
  eventos: readonly EventoSistema[],
): number | null => {
  const casos = positivos(conjunto)
  if (casos.length === 0) return null

  const presentes = new Set(eventos.map((evento) => evento.casoId))
  const cubiertos = casos.filter((caso) => presentes.has(caso.id)).length
  return cubiertos / casos.length
}

/** Backed published events over published events. Null when nothing was published. */
export const calcularPrecision = (eventos: readonly EventoSistema[]): number | null => {
  if (eventos.length === 0) return null

  const respaldados = eventos.filter((evento) => evento.respaldado).length
  return respaldados / eventos.length
}

/**
 * For each reference positive that the system matched, the delay in hours from the
 * case start and from its first publication to the earliest matching system event.
 * A reference time that is unknown yields null for that delay.
 */
export const calcularDemoras = (
  conjunto: readonly CasoReferencia[],
  eventos: readonly EventoSistema[],
): DemoraCaso[] => {
  const demoras: DemoraCaso[] = []

  for (const caso of positivos(conjunto)) {
    const publicaciones = eventos
      .filter((evento) => evento.casoId === caso.id)
      .map((evento) => evento.publicadoEn)
      .sort((a, b) => Date.parse(a) - Date.parse(b))

    const primera = publicaciones[0]
    if (primera === undefined) continue

    demoras.push({
      casoId: caso.id,
      desdeInicioHoras: horasEntre(caso.inicio, primera),
      desdePrimeraPublicacionHoras: horasEntre(caso.primeraPublicacion, primera),
    })
  }

  return demoras
}

/** Published events beyond the first one for each reference case. Events without a case are not counted. */
export const calcularDuplicados = (eventos: readonly EventoSistema[]): number => {
  const porCaso = new Map<string, number>()
  for (const evento of eventos) {
    if (evento.casoId === null) continue
    porCaso.set(evento.casoId, (porCaso.get(evento.casoId) ?? 0) + 1)
  }

  let duplicados = 0
  for (const cantidad of porCaso.values()) duplicados += cantidad - 1
  return duplicados
}
