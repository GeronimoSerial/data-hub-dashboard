import { formatoFechaRegion } from '../formato-region'

function fechaCorta(iso: string): string {
  const formato = formatoFechaRegion('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const partes = Object.fromEntries(formato.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${partes.day}/${partes.month} ${partes.hour}:${partes.minute}`
}

export type EstadoRio = 'evacuacion' | 'alerta' | 'normal' | 'sin_dato'

export const ETIQUETA_ESTADO_RIO: Record<EstadoRio, string> = {
  evacuacion: 'Evacuación',
  alerta: 'Alerta',
  normal: 'Normal',
  sin_dato: 'Sin dato',
}

export function metros(valor: number): string {
  return `${valor.toFixed(2).replace('.', ',')} m`
}

export type TextoAlturaRio = {
  /** 'Altura del río: 9,33 m' o 'Altura del río: sin dato'. */
  altura: string
  /** 'Evacuación' | 'Alerta' | 'Normal' | 'Sin dato'. */
  estado: string
  /** Texto secundario: 'alerta 7,50 m · evacuación 8,50 m', o null sin umbrales. */
  umbrales: string | null
}

/** Altura del río siempre explícita, con su estado y los umbrales como dato secundario. */
export function textoAlturaRio(entrada: {
  alturaM: number | null
  estado: EstadoRio
  alertaM: number | null
  evacuacionM: number | null
}): TextoAlturaRio {
  const umbrales = [
    entrada.alertaM === null ? null : `alerta ${metros(entrada.alertaM)}`,
    entrada.evacuacionM === null ? null : `evacuación ${metros(entrada.evacuacionM)}`,
  ].filter((parte): parte is string => parte !== null)
  return {
    altura: `Altura del río: ${entrada.alturaM === null ? 'sin dato' : metros(entrada.alturaM)}`,
    estado: ETIQUETA_ESTADO_RIO[entrada.estado],
    umbrales: umbrales.length > 0 ? umbrales.join(' · ') : null,
  }
}

/** 'Actualizado 13/10 20:03' (hora local), para el tooltip de un dato o sección. */
export function textoActualizado(iso: string | null | undefined): string {
  return iso ? `Actualizado ${fechaCorta(iso)}` : 'Sin fecha de actualización'
}
