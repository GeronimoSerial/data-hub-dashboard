// Depuración de la serie diaria A5 antes de usarla en análogos, récords y
// referencias (reglas v0.4, T10d). Módulo puro, sin DB ni reloj.
// Ver docs/motor-v0.4/validacion-historica.md (§T10d).
//
// 1. Valores no físicos: fuera de (VALOR_MIN, VALOR_MAX) m se descartan
//    (Santo Tomé trae 1e12 m el 2017-11-26).
// 2. Picos aislados: un día cuyo valor se aparta de la mediana de sus vecinos
//    (±3 días por fecha, sin incluirlo) más que max(2,5 m, K·MAD de los
//    vecinos) se descarta (Empedrado 12,33/12,44/12,89 m sobre ~4 m en
//    2026-09/10, Ituzaingó 9,72 m sobre ~0,7 m el 2024-08-17). El MAD protege
//    las crecidas reales: un pico que sube y baja 2 m/día tiene vecinos
//    dispersos y no se descarta.
// 3. Inicio de historia por estación: tramos regulados por represas sólo usan
//    historia desde la regulación (Ituzaingó desde 1995, Yacyretá).

export const VALOR_MIN_FISICO_M = -5
export const VALOR_MAX_FISICO_M = 30
export const VENTANA_DESPIKE_DIAS = 3
export const SALTO_MIN_DESPIKE_M = 2.5
export const K_MAD_DESPIKE = 5

/** Primera fecha de historia utilizable por estación (régimen actual). */
export const INICIO_HISTORIA_ESTACION_V04: Readonly<Record<string, string>> = {
  // Aguas abajo de Yacyretá: el embalse llenó por etapas desde 1994; antes el
  // régimen no es comparable (analogía y récords sólo desde 1995).
  'pna-ituzaingo': '1995-01-01',
}

const DIA_MS = 86_400_000

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

export type ResultadoDepuracion<T> = {
  filas: T[]
  descartadas: Array<{ fecha: string; valorM: number; motivo: 'no_fisico' | 'pico_aislado' | 'antes_inicio_historia' }>
}

export function depurarSerieDiaria<T extends { fecha: string; valorM: number }>(filas: readonly T[], estacionId: string): ResultadoDepuracion<T> {
  const inicio = INICIO_HISTORIA_ESTACION_V04[estacionId] ?? ''
  const descartadas: ResultadoDepuracion<T>['descartadas'] = []
  const fisicas: T[] = []
  for (const f of [...filas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))) {
    if (f.fecha < inicio) descartadas.push({ fecha: f.fecha, valorM: f.valorM, motivo: 'antes_inicio_historia' })
    else if (!Number.isFinite(f.valorM) || f.valorM <= VALOR_MIN_FISICO_M || f.valorM >= VALOR_MAX_FISICO_M) {
      descartadas.push({ fecha: f.fecha, valorM: f.valorM, motivo: 'no_fisico' })
    } else fisicas.push(f)
  }
  const ms = fisicas.map((f) => Date.parse(`${f.fecha}T00:00:00Z`))
  const salida: T[] = []
  let desde = 0
  fisicas.forEach((f, i) => {
    while (ms[desde] < ms[i] - VENTANA_DESPIKE_DIAS * DIA_MS) desde++
    const vecinos: number[] = []
    for (let j = desde; j < fisicas.length && ms[j] <= ms[i] + VENTANA_DESPIKE_DIAS * DIA_MS; j++) if (j !== i) vecinos.push(fisicas[j].valorM)
    if (vecinos.length >= 2) {
      const med = mediana(vecinos)
      const mad = mediana(vecinos.map((v) => Math.abs(v - med)))
      if (Math.abs(f.valorM - med) > Math.max(SALTO_MIN_DESPIKE_M, K_MAD_DESPIKE * mad)) {
        descartadas.push({ fecha: f.fecha, valorM: f.valorM, motivo: 'pico_aislado' })
        return
      }
    }
    salida.push(f)
  })
  descartadas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  return { filas: salida, descartadas }
}
