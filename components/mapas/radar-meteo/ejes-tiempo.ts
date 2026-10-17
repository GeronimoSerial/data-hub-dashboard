export type MarcaEje = {
  time: string
  left: number
  label: string
  tipo: 'dia' | 'hora'
}

const HORA_MS = 3_600_000

function horaLocal(ms: number, zona: string): { hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0)
  return { hora: valor('hour'), minuto: valor('minute') }
}

function etiquetaDia(ms: number, zona: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: zona, weekday: 'short', day: 'numeric' })
    .format(new Date(ms))
    .replaceAll(',', '')
}

/**
 * Axis ticks at local 00 (short day label) and 12 ("12"), positioned by real
 * time so uneven frame steps still line up with the clock.
 */
export function calcularMarcasEje(times: string[], zona: string): MarcaEje[] {
  if (times.length < 2) {
    return []
  }

  const inicio = Date.parse(times[0])
  const fin = Date.parse(times[times.length - 1])
  const rango = fin - inicio
  if (!(rango > 0)) {
    return []
  }

  const marcas: MarcaEje[] = []
  for (let ms = Math.ceil(inicio / HORA_MS) * HORA_MS; ms <= fin; ms += HORA_MS) {
    const { hora, minuto } = horaLocal(ms, zona)
    if (minuto !== 0 || (hora !== 0 && hora !== 12)) {
      continue
    }
    marcas.push({
      time: new Date(ms).toISOString(),
      left: ((ms - inicio) / rango) * 100,
      label: hora === 0 ? etiquetaDia(ms, zona) : '12',
      tipo: hora === 0 ? 'dia' : 'hora',
    })
  }
  return marcas
}
