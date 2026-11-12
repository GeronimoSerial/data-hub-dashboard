import { asignarCeldasADepartamentos, listarDepartamentos, type Departamento } from './departamentos'
import { categoriaGranizo, type EntradaGranizo } from './granizo'
import { formatoFechaRegion } from '../formato-region'

export type DatosRadar = {
  times: string[]
  cells: Array<{ id: string; row?: number; col?: number; lat: number; lon: number; latModelo?: number; lonModelo?: number }>
  values: Record<string, Array<Array<number | null>>>
}
export const UMBRALES_RESALTADO = { lluvia24h: { atencion: 25, importante: 50 }, rafagaKmh: { atencion: 60, importante: 80 } } as const
function diaLocal(iso: string): string {
  const v = Object.fromEntries(formatoFechaRegion('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${v.year}-${v.month}-${v.day}`
}
function horaLocal(iso: string): string { return formatoFechaRegion('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) }
function valor(datos: DatosRadar, campo: string, celda: number, hora: number): number | null {
  const n = datos.values[campo]?.[celda]?.[hora]
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
function redondear(n: number | null, places = 1): number | null { if (n === null) return null; const f = 10 ** places; return Math.round(n * f) / f }
function nivelLluvia(n: number | null): 'atencion' | 'importante' | null { return n !== null && n >= 50 ? 'importante' : n !== null && n >= 25 ? 'atencion' : null }
function nivelRafaga(n: number | null): 'atencion' | 'importante' | null { return n !== null && n >= 80 ? 'importante' : n !== null && n >= 60 ? 'atencion' : null }

export function calcularResumen(datos: DatosRadar, ahora = new Date()) {
  const departamentos = listarDepartamentos()
  const asignaciones = asignarCeldasADepartamentos(datos.cells)
  const indicesPorDepto = new Map<string, number[]>()
  asignaciones.forEach((a, i) => indicesPorDepto.set(a.departamentoId, [...(indicesPorDepto.get(a.departamentoId) ?? []), i]))
  const hoyLocal = diaLocal(ahora.toISOString())
  // Local day of every forecast hour, computed once and grouped by day.
  const horasPorDia = new Map<string, Array<{ t: string; i: number }>>()
  datos.times.forEach((t, i) => {
    const dia = diaLocal(t)
    const horas = horasPorDia.get(dia)
    if (horas) horas.push({ t, i })
    else horasPorDia.set(dia, [{ t, i }])
  })
  const diasDisponibles = [...horasPorDia.keys()].filter((dia) => dia >= hoyLocal)
  const dias = diasDisponibles.filter((dia, index) => {
    if (index !== diasDisponibles.length - 1) return true
    const horasDia = horasPorDia.get(dia) ?? []
    const esperadas = datos.cells.length * horasDia.length
    const presentes = datos.cells.reduce((total, _, celda) => total + horasDia.filter(({ i }) => valor(datos, 'precipitation', celda, i) !== null).length, 0)
    return !esperadas || presentes / esperadas >= 0.5
  }).slice(0, 7)
  const horas48 = datos.times.map((t, i) => ({ t, i })).filter((x) => Date.parse(x.t) >= ahora.getTime() && Date.parse(x.t) < ahora.getTime() + 48 * 3600000).slice(0, 48)
  const salida = departamentos.map((depto) => {
    const celdas = indicesPorDepto.get(depto.id) ?? []
    const diasDepto = dias.map((dia) => {
      const hs = horasPorDia.get(dia) ?? []
      const sumas = celdas.map((c) => hs.map((h) => valor(datos, 'precipitation', c, h.i)).filter((n): n is number => n !== null))
      const presentes = sumas.flat().length
      const esperadas = celdas.length * hs.length
      const cobertura = esperadas ? presentes / esperadas : 0
      const totalPorCelda = sumas.map((serie) => serie.length ? serie.reduce((a, b) => a + b, 0) : null)
      const validos = totalPorCelda.filter((n): n is number => n !== null)
      const area = cobertura >= 0.8 && validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null
      const max = validos.length ? Math.max(...validos) : null
      const rafagas = hs.flatMap((h) => celdas.map((c) => valor(datos, 'wind_gusts_10m', c, h.i))).filter((n): n is number => n !== null)
      let pico: { mm: number; hora: string } | null = null
      for (const h of hs) {
        const vals = celdas.map((c) => valor(datos, 'precipitation', c, h.i)).filter((n): n is number => n !== null)
        const media = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        if (media !== null && (pico === null || media > pico.mm)) pico = { mm: media, hora: h.t }
      }
      let tormenta = false, granizoMax: number | null = null
      for (const h of hs) for (const c of celdas) {
        const codigo = valor(datos, 'weather_code', c, h.i)
        if (codigo === 95 || codigo === 96 || codigo === 99) tormenta = true
        if (codigo === 96 || codigo === 99) {
          const entrada = Object.fromEntries(['weather_code', 'precipitation_probability', 'cape', 'lifted_index', 'wind_gusts_10m', 'freezing_level_height'].map((v) => [v, valor(datos, v, c, h.i)])) as EntradaGranizo
          const cat = categoriaGranizo(entrada)
          if (cat !== null) granizoMax = Math.max(granizoMax ?? 0, cat)
        }
      }
      const maxRafaga = rafagas.length ? Math.max(...rafagas) : null
      return { fecha: dia, lluvia24h: redondear(area), lluviaLocalMax: redondear(max), rafagaMaxKmh: redondear(maxRafaga, 0), picoHora: pico ? horaLocal(pico.hora) : null, tormenta, granizoMax, cobertura: redondear(cobertura * 100, 0), resaltado: { lluvia: nivelLluvia(area), rafaga: nivelRafaga(maxRafaga) } }
    })
    const proximas48h = horas48.map(({ t, i }) => {
      const rain = celdas.map((c) => valor(datos, 'precipitation', c, i)).filter((n): n is number => n !== null)
      const gust = celdas.map((c) => valor(datos, 'wind_gusts_10m', c, i)).filter((n): n is number => n !== null)
      const prob = celdas.map((c) => valor(datos, 'precipitation_probability', c, i)).filter((n): n is number => n !== null)
      return { hora: t, lluviaMm: redondear(rain.length ? rain.reduce((a, b) => a + b, 0) / rain.length : null), rafagaMaxKmh: redondear(gust.length ? Math.max(...gust) : null, 0), probabilidadMax: prob.length ? Math.max(...prob) : null, cobertura: celdas.length ? redondear(rain.length / celdas.length * 100, 0) : 0 }
    })
    return { id: depto.id, nombre: depto.nombre, dias: diasDepto, proximas48h }
  })
  return { dias, departamentos: salida, umbrales: UMBRALES_RESALTADO }
}

export function departamentoDeCoordenada(lat: number, lon: number): Departamento | null {
  const deptoId = asignarCeldasADepartamentos([{ id: `point-${lat}-${lon}`, lat, lon }])[0]?.departamentoId
  return listarDepartamentos().find((d) => d.id === deptoId) ?? null
}
