// Job sync-ina-serie-diaria (Motor v0.4, U3a): descarga la altura diaria
// histórica de cada estación del catálogo A5 en ventanas de fechas acotadas.
// Primera corrida: backfill desde `historiaDesde`; luego incremental desde la
// última fecha guardada menos un solape. Una estación que falla no detiene las
// demás; el total de solicitudes por corrida está acotado.
import { getDb } from '@/lib/db'
import { CONFIG_FUENTES } from '@/lib/infraestructura/riesgo/providers/config-fuentes'
import { actualizarSaludFuente } from '@/lib/infraestructura/riesgo/jobs/salud-fuente'
import { CATALOGO_A5, type EntradaCatalogoA5 } from './catalogo-a5'
import { type ClienteA5, crearClienteA5 } from './cliente-a5'
import { fechaLocalA5, normalizarSerieDiaria } from './parser-a5'
import { FUENTE_INA_A5, guardarLoteSerieDiaria, ultimaFechaSerieDiaria } from './serie-diaria-repo'

type Db = ReturnType<typeof getDb>

export type ResultadoEstacionIna = {
  estado: 'ok' | 'incompleto' | 'fallido'
  solicitudes: number
  insertadas: number
  discrepancias: number
  repetidas: number
  ultimaFecha: string | null
  error?: string
}

export type ResultadoSyncInaSerieDiaria = {
  ejecutado: true
  estado: 'completo' | 'parcial' | 'fallido'
  solicitudes: number
  presupuestoAgotado: boolean
  porEstacion: Record<string, ResultadoEstacionIna>
}

export type OpcionesSyncInaSerieDiaria = {
  db?: Db
  cliente?: ClienteA5
  catalogo?: readonly EntradaCatalogoA5[]
  ahora?: Date
  ventanaDias?: number
  maxSolicitudes?: number
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function sincronizarSerieDiariaIna(opts: OpcionesSyncInaSerieDiaria = {}): Promise<ResultadoSyncInaSerieDiaria> {
  const cfg = CONFIG_FUENTES.inaA5
  const db = opts.db ?? getDb()
  const cliente = opts.cliente ?? crearClienteA5()
  const catalogo = opts.catalogo ?? CATALOGO_A5
  const ahora = opts.ahora ?? new Date()
  const ventanaDias = opts.ventanaDias ?? cfg.ventanaDias
  const maxSolicitudes = opts.maxSolicitudes ?? cfg.maxSolicitudesPorCorrida
  const descargadoEn = ahora.toISOString()
  // `hasta` es exclusivo en la planificación: mañana local incluye hoy.
  const fin = sumarDias(fechaLocalA5(descargadoEn), 1)

  let solicitudes = 0
  let presupuestoAgotado = false
  const porEstacion: Record<string, ResultadoEstacionIna> = {}

  for (const estacion of catalogo) {
    const ultima = await ultimaFechaSerieDiaria(db, estacion.estacionId)
    const r: ResultadoEstacionIna = { estado: 'ok', solicitudes: 0, insertadas: 0, discrepancias: 0, repetidas: 0, ultimaFecha: ultima }
    porEstacion[estacion.estacionId] = r
    let desde = ultima ? sumarDias(ultima, -cfg.solapeIncrementalDias) : estacion.historiaDesde
    while (desde < fin) {
      if (solicitudes >= maxSolicitudes) {
        presupuestoAgotado = true
        r.estado = 'incompleto'
        break
      }
      const hasta = sumarDias(desde, ventanaDias) < fin ? sumarDias(desde, ventanaDias) : fin
      solicitudes++
      r.solicitudes++
      const respuesta = await cliente.obtenerObservaciones(estacion.a5SerieAlturaDiariaId, desde, hasta)
      if (!respuesta.ok) {
        r.estado = 'fallido'
        r.error = `${respuesta.motivo}: ${respuesta.detalle}`.slice(0, 200)
        break
      }
      const serie = normalizarSerieDiaria(respuesta.datos.observaciones)
      const guardado = await guardarLoteSerieDiaria(db, {
        estacionId: estacion.estacionId,
        serieId: estacion.a5SerieAlturaDiariaId,
        url: respuesta.datos.url,
        payload: respuesta.datos.payload,
        sha256: respuesta.datos.sha256,
        descargadoEn,
        filas: serie.filas,
      })
      r.insertadas += guardado.insertadas
      r.discrepancias += guardado.discrepancias.length
      r.repetidas += serie.repetidas
      if (serie.filas.length > 0) r.ultimaFecha = serie.filas[serie.filas.length - 1].fecha
      desde = hasta
    }
  }

  const estados = Object.values(porEstacion).map((r) => r.estado)
  const fallidas = estados.filter((e) => e === 'fallido').length
  const estado =
    estados.length > 0 && fallidas === estados.length ? 'fallido'
    : estados.every((e) => e === 'ok') ? 'completo'
    : 'parcial'

  // Salud de fuente: best-effort, nunca hace fallar el job.
  try {
    const primerError = Object.values(porEstacion).find((r) => r.error)?.error ?? null
    await actualizarSaludFuente(db, {
      provider: FUENTE_INA_A5,
      ttlMinutos: 1440,
      licencia: 'INA A5, datos públicos (alturas Prefectura Naval Argentina)',
      estado: estado === 'fallido' ? 'no_disponible' : fallidas > 0 ? 'degradado' : 'ok',
      ultimoErrorSaneado: primerError,
      ahoraIso: descargadoEn,
    })
  } catch {
    // Se ignora: la serie ya quedó guardada.
  }

  return { ejecutado: true, estado, solicitudes, presupuestoAgotado, porEstacion }
}
