import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { ResumenRadarMeteo } from './use-resumen-radar-meteo'

export interface FilaPronosticoDepartamento {
  id: string
  nombre: string
  lluviaMm: number | null
  probabilidadMax: number | null
  rafagaMaxKmh: number | null
  granizoPosible: boolean
}

export interface PronosticoHorizonte {
  dias: number
  filas: FilaPronosticoDepartamento[]
  conLluvia20mm: number
  rafagaMax: { kmh: number; departamento: string } | null
  conGranizo: number
}

export const UMBRAL_LLUVIA_MM = 20

export function pronosticoPorHorizonte(
  resumen: Pick<ResumenRadarMeteo, 'departamentos'>,
  horizonte: HorizonteMotor,
): PronosticoHorizonte {
  if (resumen.departamentos.length === 0) {
    return { dias: 0, filas: [], conLluvia20mm: 0, rafagaMax: null, conGranizo: 0 }
  }

  const diasObjetivo = horizonte === 240 ? 7 : horizonte / 24
  const diasDisponibles = Math.max(...resumen.departamentos.map(({ dias }) => dias.length))
  const diasUsados = Math.min(diasObjetivo, diasDisponibles)
  const horasProbabilidad = horizonte === 24 ? 24 : 48

  const filas = resumen.departamentos.map((departamento): FilaPronosticoDepartamento => {
    const dias = departamento.dias.slice(0, diasUsados)
    const lluvias = dias.map(({ lluvia24h }) => lluvia24h).filter((valor): valor is number => valor !== null)
    const lluviaTotal = lluvias.length > 0 ? lluvias.reduce((total, valor) => total + valor, 0) : null
    const rafagas = dias.map(({ rafagaMaxKmh }) => rafagaMaxKmh).filter((valor): valor is number => valor !== null)
    const probabilidades = departamento.proximas48h
      .slice(0, horasProbabilidad)
      .map(({ probabilidadMax }) => probabilidadMax)
      .filter((valor): valor is number => valor !== null)

    return {
      id: departamento.id,
      nombre: departamento.nombre,
      lluviaMm: lluviaTotal === null ? null : Math.round(lluviaTotal * 10) / 10,
      probabilidadMax: probabilidades.length > 0 ? Math.max(...probabilidades) : null,
      rafagaMaxKmh: rafagas.length > 0 ? Math.max(...rafagas) : null,
      granizoPosible: dias.some(({ granizoMax }) => granizoMax !== null),
    }
  }).sort((a, b) => {
    if (a.lluviaMm === null && b.lluviaMm !== null) return 1
    if (a.lluviaMm !== null && b.lluviaMm === null) return -1
    return (b.lluviaMm ?? 0) - (a.lluviaMm ?? 0) || a.nombre.localeCompare(b.nombre, 'es')
  })

  let rafagaMax: PronosticoHorizonte['rafagaMax'] = null
  for (const fila of filas) {
    if (fila.rafagaMaxKmh !== null && (rafagaMax === null || fila.rafagaMaxKmh > rafagaMax.kmh)) {
      rafagaMax = { kmh: fila.rafagaMaxKmh, departamento: fila.nombre }
    }
  }

  return {
    dias: diasUsados,
    filas,
    conLluvia20mm: filas.filter(({ lluviaMm }) => lluviaMm !== null && lluviaMm >= UMBRAL_LLUVIA_MM).length,
    rafagaMax,
    conGranizo: filas.filter(({ granizoPosible }) => granizoPosible).length,
  }
}
