import { and, desc, eq, gt, gte, lte, lt, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardObservation, radarMeteoRun, radarMeteoVerificacion } from '@/lib/db/schema'
import { calcularResumen } from './resumen'
import { departamentoQueContienePunto, listarDepartamentos } from './departamentos'

export const VERSION_ALGORITMO_VERIFICACION = 'imerg-departamento-v1'
const ZONA = 'America/Argentina/Buenos_Aires'
const UMBRAL_MM = 10
const UMBRAL_COBERTURA = 0.8
type Db = ReturnType<typeof getDb>

export type ParVerificacion = {
  fecha: string
  pronosticoMm: number | null
  observadoMm: number | null
  coberturaObs: number
  creadoEn?: string
}
export function runValidoParaFecha(run: { status: string; fetchedAt: string; forecastStart: string; forecastEnd: string }, fecha: string) {
  const inicio = inicioLocal(fecha).getTime()
  const fin = inicioLocal(siguiente(fecha)).getTime()
  return run.status === 'completo' && Date.parse(run.fetchedAt) < inicio && Date.parse(run.forecastStart) <= inicio
    && Date.parse(run.forecastEnd) >= fin - 3600000
}
export function calidadImergAceptable(calidad: number | null) {
  // QIh < 0.5 indica alta incertidumbre; los valores ausentes no se imputan.
  return calidad !== null && Number.isFinite(calidad) && calidad >= 0.5
}
export function claveUnicaVerificacion() {
  return [radarMeteoVerificacion.fecha, radarMeteoVerificacion.departamento]
}
export function calcularMetricasVerificacion(filas: ParVerificacion[], hasta: string) {
  const fin = new Date(`${hasta}T12:00:00Z`)
  const fechas = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(fin.getTime() - (13 - i) * 86400000)
    return d.toISOString().slice(0, 10)
  })
  const desde = fechas[0]
  const dentro = filas.filter((f) => f.fecha >= desde && f.fecha <= hasta)
  const pares = dentro.filter((f) => f.pronosticoMm !== null && f.observadoMm !== null && f.coberturaObs >= UMBRAL_COBERTURA)
  const eventos = pares.filter((f) => f.observadoMm! >= UMBRAL_MM)
  const hits = pares.filter((f) => f.pronosticoMm! >= UMBRAL_MM && f.observadoMm! >= UMBRAL_MM).length
  const falsasAlarmas = pares.filter((f) => f.pronosticoMm! >= UMBRAL_MM && f.observadoMm! < UMBRAL_MM).length
  const misses = eventos.length - hits
  const ok = pares.length >= 14 && eventos.length >= 5
  return {
    estado: ok ? 'ok' as const : (dentro.length ? 'muestra_insuficiente' as const : 'sin_datos' as const),
    sesgoMm: ok ? redondear(pares.reduce((s, f) => s + f.pronosticoMm! - f.observadoMm!, 0) / pares.length) : null,
    pod: ok && hits + misses ? hits / (hits + misses) : null,
    far: ok && hits + falsasAlarmas ? falsasAlarmas / (hits + falsasAlarmas) : null,
    nPares: pares.length, nEventos: eventos.length, desde, hasta,
    cobertura: dentro.length ? dentro.reduce((s, f) => s + f.coberturaObs, 0) / dentro.length : 0,
    actualizadoEn: dentro.map((f) => f.creadoEn).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null,
  }
}
function redondear(n: number) { return Math.round(n * 10) / 10 }
function desplazarFecha(fecha: string, dias: number) {
  const date = new Date(`${fecha}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + dias)
  return date.toISOString().slice(0, 10)
}
function fechaLocal(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function inicioLocal(fecha: string) {
  const [year, month, day] = fecha.split('-').map(Number)
  const objetivo = Date.UTC(year, month - 1, day)
  let instante = objetivo
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  // Itera el desfase de zona para obtener medianoche local incluso al cambiar
  // el offset estacional; no asumimos que todos los días duren 24 horas.
  for (let intento = 0; intento < 3; intento++) {
    const partes = Object.fromEntries(formato.formatToParts(new Date(instante)).map((p) => [p.type, Number(p.value)]))
    const representado = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second)
    const correccion = objetivo - representado
    instante += correccion
    if (correccion === 0) break
  }
  return new Date(instante)
}
function siguiente(fecha: string) { return desplazarFecha(fecha, 1) }
export function centroGeometryRefImerg(ref: string): { lat: number; lon: number } | null {
  const m = /^(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/.exec(ref)
  // celdaDeCoordenada redondea los centros IMERG, desplazados 0,05° del
  // múltiplo de décima; restituimos ese centro antes del punto-en-polígono.
  return m ? { lat: Number(m[1]) - 0.05, lon: Number(m[2]) - 0.05 } : null
}

export function fechaD1(ahora = new Date()) {
  const hoy = fechaLocal(ahora)
  return desplazarFecha(hoy, -1)
}

export async function obtenerMetricasVerificacion(hasta = fechaD1(), db: Db = getDb()) {
  const desde = desplazarFecha(hasta, -13)
  const rows = await db.select().from(radarMeteoVerificacion).where(and(gte(radarMeteoVerificacion.fecha, desde), lt(radarMeteoVerificacion.fecha, siguiente(hasta))))
  return calcularMetricasVerificacion(rows, hasta)
}

export async function ejecutarVerificacionRadarMeteo(params: { ahora?: Date; desde?: string; db?: Db } = {}) {
  const db = params.db ?? getDb()
  const hoy = fechaD1(params.ahora)
  const fechas: string[] = params.desde ? [] : [hoy]
  if (params.desde && (!/^\d{4}-\d{2}-\d{2}$/.test(params.desde) || Number.isNaN(Date.parse(`${params.desde}T00:00:00Z`)))) {
    throw new Error('--desde debe usar el formato YYYY-MM-DD')
  }
  if (params.desde && (params.desde > hoy || params.desde < desplazarFecha(hoy, -13))) {
    throw new Error('--desde debe estar dentro de los últimos 14 días completos')
  }
  if (params.desde) {
    let fecha = params.desde
    while (fecha <= hoy) { fechas.push(fecha); fecha = siguiente(fecha) }
  }
  let procesados = 0
  for (const fecha of fechas) {
    const inicio = inicioLocal(fecha).toISOString()
    const fin = inicioLocal(siguiente(fecha)).toISOString()
    // La condición estricta protege contra usar un ciclo que ya observó datos del día objetivo.
    const candidatos = await db.select({
      id: radarMeteoRun.id,
      status: radarMeteoRun.status,
      fetchedAt: radarMeteoRun.fetchedAt,
      forecastStart: radarMeteoRun.forecastStart,
      forecastEnd: radarMeteoRun.forecastEnd,
    }).from(radarMeteoRun).where(eq(radarMeteoRun.status, 'completo'))
      .orderBy(desc(radarMeteoRun.fetchedAt)).limit(200)
    const seleccionado = candidatos.find((candidato) => runValidoParaFecha(candidato, fecha))
    if (!seleccionado) continue
    const [run] = await db.select().from(radarMeteoRun).where(eq(radarMeteoRun.id, seleccionado.id)).limit(1)
    if (!run) continue
    const resumen = calcularResumen(run.payload as Parameters<typeof calcularResumen>[0])
    const pronosticos = new Map(resumen.departamentos.map((d) => [d.id, d.dias.find((x) => x.fecha === fecha)?.lluvia24h ?? null]))
    const observaciones = await db.select({ geometryRef: hazardObservation.geometryRef, valor: hazardObservation.valor, validoHasta: hazardObservation.validoHasta, calidad: hazardObservation.calidad })
      .from(hazardObservation).where(and(eq(hazardObservation.provider, 'nasa-imerg'), eq(hazardObservation.variable, 'precipitacion_observada_satelital'), gt(hazardObservation.validoHasta, inicio), lte(hazardObservation.validoHasta, fin)))
    const celdas = new Map<string, { suma: number; tiempos: Set<string>; depto: string; pesoArea: number }>()
    for (const row of observaciones) {
      if (!calidadImergAceptable(row.calidad)) continue
      const centro = centroGeometryRefImerg(row.geometryRef)
      if (!centro) continue
      const depto = departamentoQueContienePunto(centro.lat, centro.lon)
      if (!depto) continue
      const pesoArea = Math.cos(centro.lat * Math.PI / 180)
      const acc = celdas.get(row.geometryRef) ?? { suma: 0, tiempos: new Set<string>(), depto: depto.id, pesoArea }
      acc.suma += row.valor; acc.tiempos.add(row.validoHasta); celdas.set(row.geometryRef, acc)
    }
    const departamentos = listarDepartamentos()
    const celdasEsperadas = new Map(departamentos.map((d) => [d.id, 0]))
    for (let lat = -31.95; lat <= -26.05; lat = Math.round((lat + 0.1) * 10) / 10) {
      for (let lon = -60.95; lon <= -54.05; lon = Math.round((lon + 0.1) * 10) / 10) {
        const depto = departamentoQueContienePunto(lat, lon)
        if (depto) {
          const area = Math.cos(lat * Math.PI / 180)
          celdasEsperadas.set(depto.id, (celdasEsperadas.get(depto.id) ?? 0) + area)
        }
      }
    }
    const vals = departamentos.map((d) => {
      const todas = [...celdas.values()].filter((c) => c.depto === d.id)
      const validas = todas.filter((c) => c.tiempos.size >= 39)
      const areaValida = validas.reduce((s, c) => s + c.pesoArea, 0)
      const areaTotal = celdasEsperadas.get(d.id) ?? 0
      const coberturaObs = areaTotal ? areaValida / areaTotal : 0
      const observadoMm = coberturaObs >= UMBRAL_COBERTURA && areaValida
        ? validas.reduce((s, c) => s + c.suma * c.pesoArea, 0) / areaValida
        : null
      const pronosticoMm = pronosticos.get(d.id) ?? null
      const motivoExclusion = pronosticoMm === null
        ? 'pronostico_insuficiente'
        : observadoMm === null
          ? (todas.length === 0 ? 'sin_celdas_observadas' : 'cobertura_insuficiente')
          : null
      return {
        fecha,
        departamento: d.id,
        runId: run.id,
        pronosticoMm,
        observadoMm,
        coberturaObs,
        motivoExclusion,
        versionAlgoritmo: VERSION_ALGORITMO_VERIFICACION,
        creadoEn: (params.ahora ?? new Date()).toISOString(),
      }
    })
    await db.transaction(async (tx) => {
      await tx.insert(radarMeteoVerificacion).values(vals).onConflictDoUpdate({ target: claveUnicaVerificacion(), set: { runId: sql`excluded.run_id`, pronosticoMm: sql`excluded.pronostico_mm`, observadoMm: sql`excluded.observado_mm`, coberturaObs: sql`excluded.cobertura_obs`, motivoExclusion: sql`excluded.motivo_exclusion`, versionAlgoritmo: sql`excluded.version_algoritmo`, creadoEn: sql`excluded.creado_en` } })
      const fechaLimite = fechaLocal(params.ahora ?? new Date())
      const fechaRetencion = new Date(`${fechaLimite}T12:00:00Z`)
      fechaRetencion.setUTCFullYear(fechaRetencion.getUTCFullYear() - 2)
      const limite = fechaRetencion.toISOString().slice(0, 10)
      await tx.delete(radarMeteoVerificacion).where(lt(radarMeteoVerificacion.fecha, limite))
    })
    procesados += vals.length
  }
  return { fechas, departamentos: procesados }
}
