// Puerto de insumos de superación del terreno (T6/U5). Una sola carga por
// corrida, en lote: catálogo A5 (cero, km), coordenadas declaradas PNA,
// tramos aprobados, ubicación y localidad de cada escuela, y la serie diaria
// ≤ asOf de cada hidrómetro interpolable con la última lectura de Prefectura.
// El puerto no lanza: cualquier falla devuelve null y el job publica
// `no_estimable` con motivo.
import { and, desc, eq } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { CATALOGO_A5, CATALOGO_A5_VERSION } from '@/lib/infraestructura/hidrometria/ina/catalogo-a5'
import { leerSerieDiaria } from '@/lib/infraestructura/hidrometria/ina/serie-diaria-repo'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { obtenerTramosPrefectura, obtenerVersionTramosPrefectura } from '@/lib/infraestructura/hidrometria/tramos-prefectura'
import { asegurarGeAdjuntada } from '../../impacto'
import { crearEjecutorSql } from '../../ge-db'
import type { FilaDiaria } from './hidrologia/analogos'
import { fechaLocal, fusionarLecturaActual } from './superacion-terreno'
import type { EstacionTransferencia, TramoAprobado } from './transferencia-nivel'

export type EscuelaGeoV04 = { localidad: string | null; lat: number; lon: number }

export type InsumosTerrenoV04 = {
  catalogoVersion: string
  tramosVersion: string
  estaciones: EstacionTransferencia[]
  tramos: TramoAprobado[]
  escuelas: Map<string, EscuelaGeoV04>
  /** Serie diaria ≤ asOf (fecha local) con la lectura de Prefectura fusionada. */
  series: Map<string, FilaDiaria[]>
}

export interface PuertoTerrenoV04 {
  cargar(cues: string[], asOf: string): Promise<InsumosTerrenoV04 | null>
}

export type ReferenciasTerreno = {
  tramosVersion: string
  tramos: TramoAprobado[]
  coordenadas: Map<string, { lat: number; lon: number } | null>
}

export type DependenciasTerrenoV04 = {
  referencias?: () => Promise<ReferenciasTerreno>
  escuelas?: (cues: string[]) => Promise<Map<string, EscuelaGeoV04>>
  serie?: (estacionId: string, asOfFecha: string) => Promise<FilaDiaria[]>
  ultimaLectura?: (estacionId: string, asOf: string) => Promise<{ fecha: string; valorM: number } | null>
}

const referenciasDesdeDb = async (): Promise<ReferenciasTerreno> => {
  await cargarReferencias()
  return {
    tramosVersion: obtenerVersionTramosPrefectura(),
    tramos: obtenerTramosPrefectura()
      .filter((t) => t.estado === 'aprobada')
      .map((t) => ({ estacionId: t.estacionId, localidades: t.localidades })),
    coordenadas: new Map(obtenerEstacionesPrefectura().map((e) => [e.estacionId, e.coordenadas ? { lat: e.coordenadas.lat, lon: e.coordenadas.lon } : null])),
  }
}

// Misma fuente que el padrón: coordenadas de infra_geo_profile válidas y
// localidad de ge.ge_localizacion (como cargarDatosRioDesdeDb en v0.3).
const escuelasDesdeDb = async (cues: string[]): Promise<Map<string, EscuelaGeoV04>> => {
  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)
  const res = await client.execute(
    `SELECT l.cue_anexo, l.localidad, p.lat, p.lon
     FROM ge.ge_localizacion l
     JOIN infra_geo_profile p ON p.cue_anexo = l.cue_anexo
     WHERE p.motivo_exclusion IS NULL`,
  )
  const pedidas = new Set(cues)
  const salida = new Map<string, EscuelaGeoV04>()
  for (const fila of res.rows) {
    const cue = String(fila.cue_anexo)
    const lat = Number(fila.lat)
    const lon = Number(fila.lon)
    if (!pedidas.has(cue) || fila.lat === null || fila.lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    salida.set(cue, { localidad: fila.localidad === null ? null : String(fila.localidad), lat, lon })
  }
  return salida
}

const serieDesdeDb = async (estacionId: string, asOfFecha: string): Promise<FilaDiaria[]> =>
  (await leerSerieDiaria(getDb(), estacionId, asOfFecha)).map((f) => ({ fecha: f.fecha, valorM: f.valorM }))

// Última lectura consistente con medida ≤ asOf; se filtra en memoria para no
// depender del formato textual de `medida_en`.
const ultimaLecturaDesdeDb = async (estacionId: string, asOf: string) => {
  const filas = await getDb()
    .select({ lecturaM: hidroLectura.lecturaM, medidaEn: hidroLectura.medidaEn })
    .from(hidroLectura)
    .where(and(eq(hidroLectura.estacionId, estacionId), eq(hidroLectura.inconsistente, false)))
    .orderBy(desc(hidroLectura.medidaEn))
    .limit(50)
  const limite = Date.parse(asOf)
  const valida = filas.find((f) => f.lecturaM !== null && Number.isFinite(Date.parse(f.medidaEn)) && Date.parse(f.medidaEn) <= limite)
  return valida ? { fecha: fechaLocal(valida.medidaEn), valorM: valida.lecturaM as number } : null
}

export function crearAdapterTerrenoV04(deps: DependenciasTerrenoV04 = {}): PuertoTerrenoV04 {
  const referencias = deps.referencias ?? referenciasDesdeDb
  const escuelas = deps.escuelas ?? escuelasDesdeDb
  const serie = deps.serie ?? serieDesdeDb
  const ultimaLectura = deps.ultimaLectura ?? ultimaLecturaDesdeDb
  return {
    async cargar(cues, asOf) {
      try {
        const refs = await referencias()
        const estaciones: EstacionTransferencia[] = CATALOGO_A5.map((e) => ({
          estacionId: e.estacionId,
          rio: e.rio,
          ceroM: e.ceroIgnM,
          kmRio: e.kmRio,
          coordenadas: refs.coordenadas.get(e.estacionId) ?? null,
        }))
        const asOfFecha = fechaLocal(asOf)
        const interpolables = estaciones.filter((e) => e.rio === 'parana' && e.ceroM !== null && e.kmRio !== null)
        const series = new Map<string, FilaDiaria[]>()
        for (const e of interpolables) {
          const [filas, lectura] = await Promise.all([serie(e.estacionId, asOfFecha), ultimaLectura(e.estacionId, asOf)])
          series.set(e.estacionId, fusionarLecturaActual(filas, lectura, asOfFecha))
        }
        return {
          catalogoVersion: CATALOGO_A5_VERSION,
          tramosVersion: refs.tramosVersion,
          estaciones,
          tramos: refs.tramos,
          escuelas: await escuelas(cues),
          series,
        }
      } catch {
        return null
      }
    },
  }
}
