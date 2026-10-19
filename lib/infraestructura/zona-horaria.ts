// Calendario de Buenos Aires para el servidor. Buenos Aires es UTC-3 todo el
// año (sin horario de verano desde 2009), así que un desfasaje fijo es exacto
// y no depende de la zona horaria del proceso (TZ) donde corre Node.
const DESFASAJE_BA_MS = 3 * 60 * 60 * 1000

export interface CalendarioBA {
  año: number
  /** 1 a 12. */
  mes: number
  dia: number
  /** 0 = domingo, igual que `Date.prototype.getDay`. */
  diaSemana: number
}

export function calendarioBA(instante: Date): CalendarioBA {
  const reloj = new Date(instante.getTime() - DESFASAJE_BA_MS)
  return {
    año: reloj.getUTCFullYear(),
    mes: reloj.getUTCMonth() + 1,
    dia: reloj.getUTCDate(),
    diaSemana: reloj.getUTCDay(),
  }
}

/** Instante en que el reloj de Buenos Aires marca `año-mes-dia hora:minuto`. */
export function instanteBA(año: number, mes: number, dia: number, hora: number, minuto: number): Date {
  return new Date(Date.UTC(año, mes - 1, dia, hora, minuto) + DESFASAJE_BA_MS)
}

/** Suma meses en el calendario de Buenos Aires conservando la hora de reloj. */
export function sumarMesesBA(instante: Date, meses: number): Date {
  const reloj = new Date(instante.getTime() - DESFASAJE_BA_MS)
  const movido = Date.UTC(
    reloj.getUTCFullYear(),
    reloj.getUTCMonth() + meses,
    reloj.getUTCDate(),
    reloj.getUTCHours(),
    reloj.getUTCMinutes(),
    reloj.getUTCSeconds(),
    reloj.getUTCMilliseconds(),
  )
  return new Date(movido + DESFASAJE_BA_MS)
}
