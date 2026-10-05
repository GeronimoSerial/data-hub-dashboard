import type { EscuelaMapaEnriquecida } from './tipos'
import { ETIQUETA_GRAVEDAD } from './etiquetas'

export type AgruparPor = 'departamento' | 'nivel' | 'gravedad' | 'categoria'

export interface FilaAgrupada {
  clave: string
  escuelas: number
  afectadas: number
  porcentaje: number
  alumnosSinClases: number
}

export interface ResumenMapa {
  conReporte: number
  sinClases: number
  alumnosSinClases: number
  sinActualizar: number
  sinClasesConApoyo: number
  sinClasesSinDato: number
  solucionadasRecientes: number
}

export function ultimaActualizacion(escuelas: EscuelaMapaEnriquecida[]): string | null {
  return escuelas.reduce<string | null>((masReciente, escuela) => {
    const novedad = escuela.ultimaNovedad
    if (novedad === null) return masReciente
    if (masReciente === null || Date.parse(novedad) > Date.parse(masReciente)) return novedad
    return masReciente
  }, null)
}

export function resumir(escuelas: EscuelaMapaEnriquecida[]): ResumenMapa {
  return escuelas.reduce<ResumenMapa>((resumen, escuela) => {
    if (escuela.gravedad > 0) resumen.conReporte += 1
    if (escuela.clases !== 'normal') {
      resumen.sinClases += 1
      resumen.alumnosSinClases += escuela.alumnosSinClases
      if (escuela.apoyo === 'virtual' || escuela.apoyo === 'cuadernillo' || escuela.apoyo === 'ambos' || escuela.apoyo === 'brinda') {
        resumen.sinClasesConApoyo += 1
      }
      if (escuela.apoyo === 'sin_dato') resumen.sinClasesSinDato += 1
    }
    if (escuela.sinActualizar) resumen.sinActualizar += 1
    if (escuela.solucionadasRecientes > 0) resumen.solucionadasRecientes += 1
    return resumen
  }, {
    conReporte: 0,
    sinClases: 0,
    alumnosSinClases: 0,
    sinActualizar: 0,
    sinClasesConApoyo: 0,
    sinClasesSinDato: 0,
    solucionadasRecientes: 0,
  })
}

export function agrupar(escuelas: EscuelaMapaEnriquecida[], por: AgruparPor): FilaAgrupada[] {
  const grupos = new Map<string, FilaAgrupada>()

  for (const escuela of escuelas) {
    let claves: string[]
    switch (por) {
      case 'departamento':
        claves = [escuela.departamento]
        break
      case 'nivel':
        claves = [...new Set(escuela.niveles)]
        break
      case 'gravedad':
        claves = [ETIQUETA_GRAVEDAD[escuela.gravedad]]
        break
      case 'categoria':
        claves = [escuela.categoriaPrincipal ?? 'Sin categoría']
        break
    }

    for (const clave of claves) {
      const fila = grupos.get(clave) ?? {
        clave,
        escuelas: 0,
        afectadas: 0,
        porcentaje: 0,
        alumnosSinClases: 0,
      }
      fila.escuelas += 1
      if (escuela.gravedad > 0) fila.afectadas += 1
      if (escuela.clases !== 'normal') fila.alumnosSinClases += escuela.alumnosSinClases
      grupos.set(clave, fila)
    }
  }

  return [...grupos.values()].map((fila) => ({
    ...fila,
    porcentaje: Math.round(fila.afectadas / fila.escuelas * 100),
  })).sort((a, b) =>
    b.afectadas - a.afectadas ||
    b.escuelas - a.escuelas ||
    a.clave.localeCompare(b.clave, 'es'),
  )
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
