// Ventana móvil de vigencia editable (issues #29 y #30): el director puede
// fechar un cambio hasta 12 meses atrás o hasta el momento actual, nunca más
// allá en ninguna de las dos direcciones. Un solo lugar calcula los bordes
// para que el campo del cliente (vigencia-field.tsx) y el schema del
// servidor (validacion-trayectoria.ts) nunca discrepen.
const MESES_VENTANA = 12

export const MENSAJE_FUERA_DE_RANGO_VIGENCIA =
  'La fecha debe estar entre hace 12 meses y el momento actual.'

export interface RangoVigencia {
  /** Momento más antiguo aceptado (inclusive). */
  min: Date
  /** Momento más reciente aceptado (inclusive): el propio "ahora". */
  max: Date
}

/**
 * `ahora` es un parámetro y no un `new Date()` fijo adentro, para que los
 * tests puedan congelarlo sin pisar el reloj del sistema.
 */
export function rangoVigencia(ahora: Date = new Date()): RangoVigencia {
  const min = new Date(ahora)
  min.setMonth(min.getMonth() - MESES_VENTANA)
  return { min, max: new Date(ahora) }
}

export function dentroDeRangoVigencia(fecha: Date, ahora: Date = new Date()): boolean {
  const { min, max } = rangoVigencia(ahora)
  return fecha.getTime() >= min.getTime() && fecha.getTime() <= max.getTime()
}

/**
 * Desfasaje máximo aceptado entre el reloj del cliente y el del servidor.
 * El cliente fecha con el reloj de su PC (p. ej. "Ahora" =
 * `new Date().toISOString()`); una PC con la hora adelantada mandaba un
 * instante "futuro" para el servidor y el envío se rechazaba aunque el
 * usuario no hubiera elegido ninguna fecha. Cubre relojes sin sincronizar y
 * un cambio de horario mal aplicado.
 */
export const TOLERANCIA_RELOJ_MS = 60 * 60 * 1000

/**
 * Validación del lado del servidor para un instante que fechó el cliente:
 * un futuro dentro de la tolerancia de reloj se recorta al `ahora` del
 * servidor, así nunca se persiste una vigencia futura. `null` = fuera de
 * rango.
 */
export function normalizarVigenciaRecibida(fecha: Date, ahora: Date = new Date()): Date | null {
  const { min, max } = rangoVigencia(ahora)
  const t = fecha.getTime()
  if (t < min.getTime() || t > max.getTime() + TOLERANCIA_RELOJ_MS) return null
  return t > max.getTime() ? max : new Date(t)
}
