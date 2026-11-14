// Sonda de cadena de datos: prueba que datos reales recorren toda la cadena
// (Prefectura -> lecturas guardadas -> corrida de riesgo vigente -> vista de escuela).
// Función pura respecto al lease: el job que la envuelve (job.ts) gestiona la corrida.
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { buscarEstacionPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { EDAD_MAXIMA_LECTURA_HORAS } from '@/lib/infraestructura/hidrometria/estado-altura'
import { ultimaLecturaEstacion } from '@/lib/infraestructura/hidrometria/lecturas-repo'
import { descargarAlturasPrefectura } from '@/lib/infraestructura/hidrometria/prefectura-cliente'
import type { FilaAlturaPrefectura } from '@/lib/infraestructura/hidrometria/prefectura-parser'
import { escuelasTestigo, estacionesTestigo } from './testigos'

export const EDAD_MAXIMA_CORRIDA_HORAS = 12
// Horizonte que la vista de escuela muestra por defecto.
const HORIZONTE_VISTA_ESCUELA_HORAS = 72
const TOLERANCIA_PUBLICACION_HORAS = 3
const HORA_MS = 60 * 60 * 1000

export type ResultadoSonda = {
  escuelasVerificadas: number
  escuelasFallidas: string[]
  estacionesVerificadas: number
  estacionesFallidas: string[]
  discrepancias: string[]
  prefecturaConsultada: boolean
}

export type OpcionesSonda = {
  ahora?: Date
  consultarPrefectura: boolean
  fetchImpl?: typeof fetch
  escuelas?: string[]
  estaciones?: string[]
}

// Same join as GET /api/infraestructura/riesgo/escuela/[cueAnexo]: a school has a
// result only through the snapshot of the vigente run.
async function escuelasConCorridaVigente(cues: string[]) {
  const db = getDb()
  const [corrida] = await db
    .select({ publicadoEn: infraRiskRun.publicadoEn })
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)
  const cuesConResultado = new Set<string>()
  if (!corrida) return { publicadoEn: null, cuesConResultado }
  const filas = await db
    .select({ cueAnexo: infraRiskSnapshot.cueAnexo })
    .from(infraRiskSnapshot)
    .innerJoin(infraRiskRun, eq(infraRiskSnapshot.runId, infraRiskRun.id))
    .where(
      and(
        eq(infraRiskRun.estado, 'vigente'),
        eq(infraRiskSnapshot.horizonteHoras, HORIZONTE_VISTA_ESCUELA_HORAS),
        inArray(infraRiskSnapshot.cueAnexo, cues),
      ),
    )
  for (const fila of filas) cuesConResultado.add(fila.cueAnexo)
  return { publicadoEn: corrida.publicadoEn, cuesConResultado }
}

async function verificarEscuelas(cues: string[], ahora: Date): Promise<string[]> {
  const { publicadoEn, cuesConResultado } = await escuelasConCorridaVigente(cues)
  const publicadoMs = publicadoEn === null ? NaN : Date.parse(publicadoEn)
  const corridaReciente =
    !Number.isNaN(publicadoMs) && ahora.getTime() - publicadoMs < EDAD_MAXIMA_CORRIDA_HORAS * HORA_MS
  return cues.filter((cue) => !(corridaReciente && cuesConResultado.has(cue)))
}

async function verificarEstaciones(estaciones: string[], ahora: Date): Promise<string[]> {
  const db = getDb()
  const fallidas: string[] = []
  for (const estacionId of estaciones) {
    const lectura = await ultimaLecturaEstacion(db, estacionId)
    const medidaMs = lectura ? Date.parse(lectura.medidaEn) : NaN
    const reciente =
      !Number.isNaN(medidaMs) && ahora.getTime() - medidaMs < EDAD_MAXIMA_LECTURA_HORAS * HORA_MS
    if (!reciente) fallidas.push(estacionId)
  }
  return fallidas
}

// Latest published row per catalogue station; rows outside the catalogue are ignored.
function ultimaPublicadaPorEstacion(filas: FilaAlturaPrefectura[]): Map<string, FilaAlturaPrefectura> {
  const porEstacion = new Map<string, FilaAlturaPrefectura>()
  for (const fila of filas) {
    const estacion = buscarEstacionPrefectura(fila)
    if (!estacion || fila.medidaEn === null || fila.lecturaM === null) continue
    const previa = porEstacion.get(estacion.estacionId)
    if (!previa || Date.parse(fila.medidaEn) > Date.parse(previa.medidaEn!)) {
      porEstacion.set(estacion.estacionId, fila)
    }
  }
  return porEstacion
}

async function detectarDiscrepancias(estaciones: string[], fetchImpl?: typeof fetch): Promise<string[]> {
  const db = getDb()
  const publicadas = ultimaPublicadaPorEstacion(await descargarAlturasPrefectura({ fetchImpl }))
  const discrepancias: string[] = []
  for (const estacionId of estaciones) {
    const publicada = publicadas.get(estacionId)
    const guardada = await ultimaLecturaEstacion(db, estacionId)
    if (!publicada || !guardada) continue
    if (guardada.medidaEn === publicada.medidaEn) {
      if (guardada.lecturaM !== publicada.lecturaM) discrepancias.push(estacionId)
      continue
    }
    const adelanto = Date.parse(publicada.medidaEn!) - Date.parse(guardada.medidaEn)
    if (adelanto > TOLERANCIA_PUBLICACION_HORAS * HORA_MS) discrepancias.push(estacionId)
  }
  return discrepancias
}

export async function ejecutarSonda(opts: OpcionesSonda): Promise<ResultadoSonda> {
  const ahora = opts.ahora ?? new Date()
  const escuelas = opts.escuelas ?? escuelasTestigo()
  const estaciones = opts.estaciones ?? estacionesTestigo()

  const escuelasFallidas = await verificarEscuelas(escuelas, ahora)
  const estacionesFallidas = await verificarEstaciones(estaciones, ahora)
  const discrepancias = opts.consultarPrefectura
    ? await detectarDiscrepancias(estaciones, opts.fetchImpl)
    : []

  return {
    escuelasVerificadas: escuelas.length,
    escuelasFallidas,
    estacionesVerificadas: estaciones.length,
    estacionesFallidas,
    discrepancias,
    prefecturaConsultada: opts.consultarPrefectura,
  }
}
