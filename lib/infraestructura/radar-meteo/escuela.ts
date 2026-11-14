import { interpolarBilineal } from './interpolacion'
import { departamentoDeCoordenada, type DatosRadar } from './resumen'
import { ESPACIADO_GRILLA } from './grilla'
import { formatoFechaRegion, zonaHorariaRegion } from '../formato-region'

export function pronosticoEscuela(datos: DatosRadar & { cells: Array<{ id: string; lat: number; lon: number; row?: number; col?: number }> }, escuela: { cueAnexo: string; nombre: string; lat: number; lon: number; departamento?: string | null }, ahora = new Date()) {
  const maxRow = Math.max(...datos.cells.map((c) => c.row ?? Math.round(c.lat / ESPACIADO_GRILLA)))
  const minCol = Math.min(...datos.cells.map((c) => c.col ?? Math.round(c.lon / ESPACIADO_GRILLA)))
  const filas = maxRow - Math.min(...datos.cells.map((c) => c.row ?? Math.round(c.lat / ESPACIADO_GRILLA))) + 1
  const columnas = Math.max(...datos.cells.map((c) => c.col ?? Math.round(c.lon / ESPACIADO_GRILLA))) - minCol + 1
  const pos = (campo: string, h: number) => {
    const valores: Array<number | null> = Array(filas * columnas).fill(null)
    datos.cells.forEach((c, i) => { valores[(maxRow - (c.row ?? Math.round(c.lat / ESPACIADO_GRILLA))) * columnas + (c.col ?? Math.round(c.lon / ESPACIADO_GRILLA)) - minCol] = datos.values[campo]?.[i]?.[h] ?? null })
    const f = maxRow - escuela.lat / ESPACIADO_GRILLA
    const col = escuela.lon / ESPACIADO_GRILLA - minCol
    const interpolado = interpolarBilineal({ filas, columnas }, valores, Math.max(0, Math.min(filas - 1, f)), Math.max(0, Math.min(columnas - 1, col)))
    if (interpolado !== null) return { valor: interpolado, metodo: 'bilineal' }
    const cercanos: Array<{ valor: number; distancia: number }> = []
    datos.cells.forEach((c, i) => {
      const valor = datos.values[campo]?.[i]?.[h]
      if (typeof valor !== 'number') return
      const distancia = Math.hypot((c.lon - escuela.lon) * Math.cos(escuela.lat * Math.PI / 180), c.lat - escuela.lat)
      cercanos.push({ valor, distancia })
    })
    cercanos.sort((a, b) => a.distancia - b.distancia)
    return cercanos[0] ? { valor: cercanos[0].valor, metodo: 'celda_mas_cercana' } : { valor: null, metodo: 'sin_dato' }
  }
  const horas = datos.times.map((hora, i) => ({ hora, lluviaMm: pos('precipitation', i), rafagaKmh: pos('wind_gusts_10m', i), weatherCode: pos('weather_code', i) })).filter((_, i) => Date.parse(datos.times[i]) >= ahora.getTime() && Date.parse(datos.times[i]) < ahora.getTime() + 48 * 3600000)
  const formatoDia = formatoFechaRegion('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const fechas = [...new Set(datos.times.map((t) => formatoDia.format(new Date(t))))].slice(0, 7)
  const dias = fechas.map((fecha) => {
    const hs = datos.times.map((t, i) => ({ t, i })).filter((x) => formatoDia.format(new Date(x.t)) === fecha)
    const mm = hs.map((x) => pos('precipitation', x.i)).filter((x) => x.valor !== null).reduce((s, x) => s + x.valor!, 0)
    return { fecha, lluviaMm: mm, metodo: 'bilineal' }
  })
  const depto = departamentoDeCoordenada(escuela.lat, escuela.lon)
  return { cueAnexo: escuela.cueAnexo, nombre: escuela.nombre, departamento: { id: depto?.id ?? null, nombre: escuela.departamento ?? depto?.nombre ?? null }, coordenada: { lat: escuela.lat, lon: escuela.lon, fuente: 'ge.ge_localizacion' }, runAt: null, zonaHoraria: zonaHorariaRegion(), horas, dias, interpolacion: 'bilineal_con_respaldo_celda_cercana', cobertura: horas.length ? horas.filter((h) => h.lluviaMm.valor !== null).length / horas.length : 0 }
}
