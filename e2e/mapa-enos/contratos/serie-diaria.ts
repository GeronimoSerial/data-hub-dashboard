// Projects a daily series (one point per UTC calendar day, from a fixed start up to "today") onto a form that
// does not depend on the day the test runs.
//
// GET /evolucion returns one point per day from the start of the period until today, so the array grows by one
// entry every day. The server under test uses the real clock, so the raw series cannot be snapshotted as is.
//
// What is checked on every call (a failure throws, so the contract keeps its teeth):
// - the series is not empty and the days are consecutive UTC dates, in ascending order;
// - the last day is today (or yesterday, to tolerate a run that crosses UTC midnight).
// What is kept in the projection: every value other than `fecha`, grouped in runs of consecutive equal points.
// Each run keeps its exact length, except the last one, which runs until today and is marked `hasta-hoy`.

export type PuntoDiario = { fecha: string }

export type TramoDiario<T extends PuntoDiario> = { valores: Omit<T, 'fecha'>; dias: number | 'hasta-hoy' }

const DIA_MS = 24 * 60 * 60 * 1000

function aMs(fecha: string): number {
  const ms = Date.parse(`${fecha}T00:00:00.000Z`)
  if (Number.isNaN(ms)) throw new Error(`serie diaria: fecha invalida ${JSON.stringify(fecha)}`)
  return ms
}

export function proyectarSerieDiaria<T extends PuntoDiario>(serie: readonly T[], hoy: Date = new Date()): Array<TramoDiario<T>> {
  if (serie.length === 0) throw new Error('serie diaria: la serie esta vacia')

  for (let i = 1; i < serie.length; i++) {
    if (aMs(serie[i]!.fecha) - aMs(serie[i - 1]!.fecha) !== DIA_MS) {
      throw new Error(`serie diaria: ${serie[i - 1]!.fecha} y ${serie[i]!.fecha} no son dias consecutivos`)
    }
  }

  const hoyMs = aMs(hoy.toISOString().slice(0, 10))
  const ultimoMs = aMs(serie[serie.length - 1]!.fecha)
  if (ultimoMs !== hoyMs && ultimoMs !== hoyMs - DIA_MS) {
    throw new Error(`serie diaria: el ultimo dia ${serie[serie.length - 1]!.fecha} no es hoy`)
  }

  const tramos: Array<{ valores: Omit<T, 'fecha'>; dias: number }> = []
  for (const punto of serie) {
    const { fecha: _fecha, ...valores } = punto
    const clave = JSON.stringify(valores)
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && JSON.stringify(ultimo.valores) === clave) ultimo.dias++
    else tramos.push({ valores: valores as Omit<T, 'fecha'>, dias: 1 })
  }

  return tramos.map((tramo, i) => ({ valores: tramo.valores, dias: i === tramos.length - 1 ? 'hasta-hoy' : tramo.dias }))
}
