import type { RemitoLineRow, RemitoSummary } from './remito-api'

const DAY_MS = 86_400_000

export type EnvioStage = 'waiting' | 'delivering' | 'done'

export type EnvioStatus = {
  stage: EnvioStage
  /** Something arrived with less than what the previous leg handed over. */
  short: boolean
  label: string
  detail: string
  schools: number
  schoolsDone: number
}

export function lineDone(line: RemitoLineRow) {
  return line.status === 'received' || line.status === 'closed_empty'
}

/** Units sent, units the schools confirmed, and units lost on each leg. */
export function remitoUnits(remito: RemitoSummary) {
  let dispatched = 0
  let delivered = 0
  let shortAtCabecera = 0
  let shortAtSchool = 0
  for (const line of remito.lines) {
    for (const item of line.items) {
      dispatched += item.dispatchedQuantity
      delivered += item.schoolReceivedQuantity ?? 0
      if (item.cabeceraReceivedQuantity !== null) {
        shortAtCabecera += Math.max(0, item.dispatchedQuantity - item.cabeceraReceivedQuantity)
        if (item.schoolReceivedQuantity !== null) shortAtSchool += Math.max(0, item.cabeceraReceivedQuantity - item.schoolReceivedQuantity)
      }
    }
  }
  return { dispatched, delivered, shortAtCabecera, shortAtSchool, short: shortAtCabecera + shortAtSchool }
}

/** "hoy", "ayer" or "hace N días", counted in whole days. */
export function daysAgo(iso: string, now: number) {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS))
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

/** Where an envío stands, in the words a planner would use. */
export function envioStatus(remito: RemitoSummary, now: number): EnvioStatus {
  const schools = remito.lines.length
  const schoolsDone = remito.lines.filter(lineDone).length
  const units = remitoUnits(remito)
  const short = units.short > 0
  const shortText = `${units.short === 1 ? 'Llegó 1' : `Llegaron ${units.short.toLocaleString('es-AR')}`} de menos`
  const direct = remito.modo === 'directo'
  // A directo envío has no cabecera to wait for: it goes from Planeamiento straight to the schools.
  if (!direct && !remito.cabeceraReceivedAt) {
    return { stage: 'waiting', short, label: 'Esperando a la cabecera', detail: `Salió ${daysAgo(remito.dispatchedAt, now)} y todavía no confirmó que llegó`, schools, schoolsDone }
  }
  // A reserve is finished for Planeamiento once the cabecera has it; the cabecera splits it among schools afterwards.
  if (remito.lines.some((line) => line.reserva)) {
    return { stage: 'done', short, label: 'Reserva recibida', detail: 'La cabecera la reparte entre sus escuelas', schools, schoolsDone }
  }
  if (schools > 0 && schoolsDone === schools) {
    if (short) {
      const confirmed = schools === 1 ? 'la escuela ya confirmó' : `las ${schools} escuelas ya confirmaron`
      return { stage: 'done', short, label: 'Entregado con faltantes', detail: `${shortText} · ${confirmed}`, schools, schoolsDone }
    }
    const detail = schools === 1 ? 'La escuela confirmó que recibió todo' : `Las ${schools} escuelas confirmaron que recibieron todo`
    return { stage: 'done', short, label: 'Entregado', detail, schools, schoolsDone }
  }
  const progress = schools === 0 ? 'La cabecera ya lo recibió' : `${schoolsDone} de ${schools} escuela${schools === 1 ? '' : 's'} ya ${schoolsDone === 1 ? 'recibió' : 'recibieron'}`
  const label = direct && schoolsDone === 0 ? 'En camino a escuelas' : 'En reparto'
  return { stage: 'delivering', short, label, detail: short ? `${progress} · ${shortText.toLowerCase()}` : progress, schools, schoolsDone }
}
