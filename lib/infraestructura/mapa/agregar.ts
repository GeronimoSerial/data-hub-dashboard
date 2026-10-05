import type { EscuelaMapaEnriquecida } from './tipos'

export interface ResumenMapa {
  conReporte: number
  sinClases: number
  alumnosSinClases: number
  sinActualizar: number
  sinClasesConApoyo: number
}

export function resumir(escuelas: EscuelaMapaEnriquecida[]): ResumenMapa {
  return escuelas.reduce<ResumenMapa>((resumen, escuela) => {
    if (escuela.gravedad > 0) resumen.conReporte += 1
    if (escuela.clases !== 'normal') {
      resumen.sinClases += 1
      resumen.alumnosSinClases += escuela.alumnosSinClases
      if (escuela.apoyo === 'virtual' || escuela.apoyo === 'cuadernillo' || escuela.apoyo === 'ambos') {
        resumen.sinClasesConApoyo += 1
      }
    }
    if (escuela.sinActualizar) resumen.sinActualizar += 1
    return resumen
  }, {
    conReporte: 0,
    sinClases: 0,
    alumnosSinClases: 0,
    sinActualizar: 0,
    sinClasesConApoyo: 0,
  })
}

export function ordenarReportes(escuelas: EscuelaMapaEnriquecida[]): EscuelaMapaEnriquecida[] {
  return [...escuelas].sort((a, b) => {
    const porGravedad = b.gravedad - a.gravedad
    if (porGravedad !== 0) return porGravedad

    const porClases = Number(b.clases !== 'normal') - Number(a.clases !== 'normal')
    if (porClases !== 0) return porClases

    const novedadA = a.ultimaNovedad === null ? Number.NEGATIVE_INFINITY : Date.parse(a.ultimaNovedad)
    const novedadB = b.ultimaNovedad === null ? Number.NEGATIVE_INFINITY : Date.parse(b.ultimaNovedad)
    return novedadB - novedadA
  })
}
