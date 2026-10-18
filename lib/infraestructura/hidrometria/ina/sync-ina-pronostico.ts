// Job sync-ina-pronostico (Motor v0.4, U3b): descarga la última corrida de los
// calibrados INA 499 y 289 (una solicitud por calibrado, reintentos acotados
// en el cliente). Deduplica por (cal_id, cor_id); un calibrado que falla no
// detiene el otro. Series fuera del catálogo se guardan sin estación y se
// informan. Sin autenticación A5 sólo publica la última corrida.
import { getDb } from '@/lib/db'
import { actualizarSaludFuente } from '@/lib/infraestructura/riesgo/jobs/salud-fuente'
import { type ClienteA5, crearClienteA5 } from './cliente-a5'
import { normalizarCorrida } from './parser-pronostico-a5'
import { guardarCorridaIna } from './pronostico-repo'
import { CALIBRADOS_PRONOSTICO } from './series-pronostico-a5'

type Db = ReturnType<typeof getDb>

export const FUENTE_INA_PRONOSTICO = 'ina-a5-pronostico'

export type ResultadoCalibradoIna = {
  estado: 'nueva' | 'existente' | 'fallido'
  corId: number | null
  forecastDate: string | null
  insertadas: number
  repetidas: number
  sinValor: number
  seriesDesconocidas: number[]
  error?: string
}

export type ResultadoSyncInaPronostico = {
  ejecutado: true
  estado: 'completo' | 'parcial' | 'fallido'
  solicitudes: number
  porCalibrado: Record<string, ResultadoCalibradoIna>
}

export type OpcionesSyncInaPronostico = {
  db?: Db
  cliente?: ClienteA5
  calibrados?: readonly number[]
  ahora?: Date
}

export async function sincronizarPronosticoIna(opts: OpcionesSyncInaPronostico = {}): Promise<ResultadoSyncInaPronostico> {
  const db = opts.db ?? getDb()
  const cliente = opts.cliente ?? crearClienteA5()
  const calibrados = opts.calibrados ?? CALIBRADOS_PRONOSTICO
  const descargadoEn = (opts.ahora ?? new Date()).toISOString()
  const porCalibrado: Record<string, ResultadoCalibradoIna> = {}
  let solicitudes = 0

  for (const calId of calibrados) {
    const r: ResultadoCalibradoIna = { estado: 'fallido', corId: null, forecastDate: null, insertadas: 0, repetidas: 0, sinValor: 0, seriesDesconocidas: [] }
    porCalibrado[String(calId)] = r
    solicitudes++
    try {
      const respuesta = await cliente.obtenerUltimaCorrida(calId)
      if (!respuesta.ok) {
        r.error = `${respuesta.motivo}: ${respuesta.detalle}`.slice(0, 200)
        continue
      }
      const { corrida } = respuesta.datos
      const n = normalizarCorrida(corrida)
      const guardado = await guardarCorridaIna(db, {
        calId,
        corId: corrida.corId,
        forecastDate: corrida.forecastDate,
        url: respuesta.datos.url,
        payload: respuesta.datos.payload,
        sha256: respuesta.datos.sha256,
        descargadoEn,
        filas: n.filas,
      })
      Object.assign(r, {
        estado: guardado.nueva ? 'nueva' : 'existente',
        corId: corrida.corId,
        forecastDate: corrida.forecastDate,
        insertadas: guardado.insertadas,
        repetidas: n.repetidas,
        sinValor: n.sinValor,
        seriesDesconocidas: n.seriesDesconocidas,
      })
    } catch (error) {
      r.error = `error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200)
    }
  }

  const fallidos = Object.values(porCalibrado).filter((r) => r.estado === 'fallido').length
  const total = Object.keys(porCalibrado).length
  const estado = total > 0 && fallidos === total ? 'fallido' : fallidos > 0 ? 'parcial' : 'completo'

  // Salud de fuente: best-effort, nunca hace fallar el job.
  try {
    await actualizarSaludFuente(db, {
      provider: FUENTE_INA_PRONOSTICO,
      ttlMinutos: 1440,
      licencia: 'INA A5, datos públicos (pronósticos calibrados 499 y 289)',
      estado: estado === 'fallido' ? 'no_disponible' : fallidos > 0 ? 'degradado' : 'ok',
      ultimoErrorSaneado: Object.values(porCalibrado).find((r) => r.error)?.error ?? null,
      ahoraIso: descargadoEn,
    })
  } catch {
    // Se ignora: las corridas ya quedaron guardadas.
  }

  return { ejecutado: true, estado, solicitudes, porCalibrado }
}
