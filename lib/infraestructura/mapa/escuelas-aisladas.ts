import type { AislamientoEscuelaMapa } from '@/lib/infraestructura/territorio-mapa'

export type OrdenAisladas = 'distancia' | 'tierra' | 'vados'

export const ORDENES_AISLADAS: ReadonlyArray<{ valor: OrdenAisladas; etiqueta: string }> = [
  { valor: 'distancia', etiqueta: 'Más lejos de una localidad' },
  { valor: 'tierra', etiqueta: 'Más km de tierra' },
  { valor: 'vados', etiqueta: 'Más vados sin puente' },
]

/** Más de esta distancia por camino a una localidad urbana ya es aislamiento alto. */
export const UMBRAL_LEJANA_M = 30_000

const formatoKm = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function km(metros: number): string {
  return formatoKm.format(Math.max(1, Math.round(metros / 1000)))
}

/** "42 km hasta Goya · 18 km de tierra · 2 vados sin puente · sin alternativa". Omite lo que no tiene dato o es cero. */
export function detalleAislamiento(dato: AislamientoEscuelaMapa): string {
  const partes: string[] = []
  if (dato.distanciaLocalidadM != null && dato.distanciaLocalidadM > 0) {
    partes.push(`${km(dato.distanciaLocalidadM)} km hasta ${dato.destinoNombre ?? 'una localidad urbana'}`)
  }
  if (dato.kmSinPavimentar != null && dato.kmSinPavimentar >= 0.5) {
    partes.push(`${formatoKm.format(Math.round(dato.kmSinPavimentar))} km de tierra`)
  }
  if (dato.sinPuente != null && dato.sinPuente > 0) {
    partes.push(`${dato.sinPuente} ${dato.sinPuente === 1 ? 'vado sin puente' : 'vados sin puente'}`)
  }
  if (dato.alternativaSinCruce === false) partes.push('sin alternativa')
  return partes.join(' · ')
}

function valorOrden(dato: AislamientoEscuelaMapa, orden: OrdenAisladas): number | null {
  if (orden === 'distancia') return dato.distanciaLocalidadM ?? null
  if (orden === 'tierra') return dato.kmSinPavimentar ?? null
  return dato.sinPuente
}

/** Orden descendente por el criterio elegido; sin dato al final; empate por nivel y nombre. */
export function ordenarAisladas<T extends { nombre: string; dato: AislamientoEscuelaMapa }>(
  items: readonly T[],
  orden: OrdenAisladas,
): T[] {
  const nivel = (d: AislamientoEscuelaMapa) => (typeof d.nivel === 'number' ? d.nivel : -1)
  return [...items].sort((a, b) => {
    const va = valorOrden(a.dato, orden)
    const vb = valorOrden(b.dato, orden)
    if (va !== vb) {
      if (va === null) return 1
      if (vb === null) return -1
      return vb - va
    }
    return nivel(b.dato) - nivel(a.dato) || a.nombre.localeCompare(b.nombre, 'es')
  })
}

export interface ResumenAisladas {
  escuelas: number
  alumnos: number
  lejanas: number
  sinAlternativa: number
}

export function resumenAisladas(items: ReadonlyArray<{ alumnos: number; dato: AislamientoEscuelaMapa }>): ResumenAisladas {
  return items.reduce<ResumenAisladas>(
    (acc, { alumnos, dato }) => ({
      escuelas: acc.escuelas + 1,
      alumnos: acc.alumnos + (Number.isFinite(alumnos) ? alumnos : 0),
      lejanas: acc.lejanas + (dato.distanciaLocalidadM != null && dato.distanciaLocalidadM > UMBRAL_LEJANA_M ? 1 : 0),
      sinAlternativa: acc.sinAlternativa + (dato.alternativaSinCruce === false ? 1 : 0),
    }),
    { escuelas: 0, alumnos: 0, lejanas: 0, sinAlternativa: 0 },
  )
}
