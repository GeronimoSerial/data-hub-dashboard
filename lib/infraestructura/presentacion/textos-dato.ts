import { formatoFechaRegion } from '../formato-region'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

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

// Alerta y Normal se escriben igual en portugués: quedan literales, no en el diccionario.
const ESTADO_RIO_IGUAL: Partial<Record<EstadoRio, string>> = { alerta: 'Alerta', normal: 'Normal' }

function estadoRioTexto(estado: EstadoRio, t: Diccionario): string {
  const igual = ESTADO_RIO_IGUAL[estado]
  if (igual !== undefined) return igual
  return estado === 'evacuacion' ? t.libTextos2.rio.estado.evacuacion : t.libTextos2.rio.estado.sinDato
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
}, t: Diccionario = es): TextoAlturaRio {
  const rio = t.libTextos2.rio
  const umbrales = [
    entrada.alertaM === null ? null : rio.umbralAlerta(metros(entrada.alertaM)),
    entrada.evacuacionM === null ? null : rio.umbralEvacuacion(metros(entrada.evacuacionM)),
  ].filter((parte): parte is string => parte !== null)
  return {
    altura: rio.altura(entrada.alturaM === null ? rio.alturaSinDato : metros(entrada.alturaM)),
    estado: estadoRioTexto(entrada.estado, t),
    umbrales: umbrales.length > 0 ? umbrales.join(' · ') : null,
  }
}

/** 'Actualizado 13/10 20:03' (hora local), para el tooltip de un dato o sección. */
export function textoActualizado(iso: string | null | undefined, t: Diccionario = es): string {
  return iso ? t.libTextos2.actualizado.con(fechaCorta(iso)) : t.libTextos2.actualizado.sinFecha
}
