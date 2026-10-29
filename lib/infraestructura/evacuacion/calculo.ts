import { eq, and } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import { infraCentroEvacuados, infraExposicionRutaInundacion, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { claseRutaDe, ultimaExposicionDeCue } from '@/lib/infraestructura/exposicion-ruta'
import { cargarTerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import { crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { evaluarAptitud, type MotivoNoApta, type RiesgoVigente } from './aptitud'
import { elegirDestino, type CandidatoOsm, type EscuelaApta } from './destino'

// Mismo horizonte por defecto que la capa de riesgo del mapa.
export const HORIZONTE_APTITUD_HORAS = 72

export interface EscuelaEntrada {
  cueAnexo: string
  nombre: string
  lat: number | null
  lon: number | null
}

export interface EntradaCalculo {
  escuelas: readonly EscuelaEntrada[]
  riesgoPorCue: ReadonlyMap<string, RiesgoVigente>
  sitioPorCue: ReadonlyMap<string, { claseRio: string | null; juntoLaguna: boolean | null }>
  claseRutaPorCue: ReadonlyMap<string, string | null>
  candidatosOsmPorCue: ReadonlyMap<string, readonly CandidatoOsm[]>
  ahora: Date
}

export type FilaCentroEvacuados = typeof infraCentroEvacuados.$inferInsert & {
  cueAnexo: string
  apto: boolean
  motivo: MotivoNoApta | null
  destinoCue: string | null
  destinoNombre: string | null
  distanciaRectaM: number | null
  distanciaRutaM: number | null
  calculadoEn: string
}

export function calcularFilasCentros(entrada: EntradaCalculo): FilaCentroEvacuados[] {
  const calculadoEn = entrada.ahora.toISOString()
  const evaluadas = entrada.escuelas.map((e) => {
    const tieneCoordenadas = e.lat !== null && e.lon !== null && Number.isFinite(e.lat) && Number.isFinite(e.lon)
    const sitio = entrada.sitioPorCue.get(e.cueAnexo)
    return {
      escuela: e,
      tieneCoordenadas,
      resultado: evaluarAptitud({
        tieneCoordenadas,
        riesgo: entrada.riesgoPorCue.get(e.cueAnexo) ?? null,
        claseRio: sitio?.claseRio ?? null,
        juntoLaguna: sitio?.juntoLaguna ?? null,
        claseRuta: entrada.claseRutaPorCue.get(e.cueAnexo) ?? null,
      }),
    }
  })

  const aptas: EscuelaApta[] = evaluadas
    .filter((x) => x.resultado.apta)
    .map((x) => ({ cueAnexo: x.escuela.cueAnexo, nombre: x.escuela.nombre, lat: x.escuela.lat as number, lon: x.escuela.lon as number }))

  return evaluadas.map(({ escuela, tieneCoordenadas, resultado }) => {
    const destino = tieneCoordenadas
      ? elegirDestino(
        { cueAnexo: escuela.cueAnexo, nombre: escuela.nombre, lat: escuela.lat as number, lon: escuela.lon as number },
        aptas,
        entrada.candidatosOsmPorCue.get(escuela.cueAnexo) ?? [],
      )
      : null
    return {
      cueAnexo: escuela.cueAnexo,
      apto: resultado.apta,
      motivo: resultado.motivo,
      destinoCue: destino?.cueAnexo ?? null,
      destinoNombre: destino?.nombre ?? null,
      distanciaRectaM: destino ? Math.round(destino.distanciaRectaM) : null,
      distanciaRutaM: destino?.distanciaRutaM != null ? Math.round(destino.distanciaRutaM) : null,
      calculadoEn,
    }
  })
}

async function cargarEscuelas(): Promise<EscuelaEntrada[]> {
  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)
  const res = await client.execute({
    sql: `SELECT l.cue_anexo, l.nombre, l.lat, l.lon FROM ge.ge_localizacion l
      WHERE (NOT EXISTS (SELECT 1 FROM infra_dataset_publicacion WHERE dataset_id='localizaciones')
        OR EXISTS (SELECT 1 FROM infra_dataset_publicacion p JOIN infra_dataset_registro r ON r.version_id=p.version_id
          WHERE p.dataset_id='localizaciones' AND r.clave=l.cue_anexo))`,
    args: [],
  })
  const num = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return res.rows.map((r) => ({ cueAnexo: String(r.cue_anexo), nombre: String(r.nombre ?? ''), lat: num(r.lat), lon: num(r.lon) }))
}

async function cargarRiesgoVigente(db: ReturnType<typeof getDb>): Promise<Map<string, RiesgoVigente>> {
  const filas = await db
    .select({ cueAnexo: infraRiskSnapshot.cueAnexo, evidenciaValida: infraRiskSnapshot.evidenciaValida, nivelRiesgo: infraRiskSnapshot.nivelRiesgo })
    .from(infraRiskSnapshot)
    .innerJoin(infraRiskRun, eq(infraRiskSnapshot.runId, infraRiskRun.id))
    .where(and(
      eq(infraRiskRun.estado, 'vigente'),
      eq(infraRiskRun.modo, 'operativo'),
      eq(infraRiskSnapshot.horizonteHoras, HORIZONTE_APTITUD_HORAS),
    ))
  return new Map(filas.map((f) => [f.cueAnexo, { evidenciaValida: f.evidenciaValida, nivelRiesgo: f.nivelRiesgo }]))
}

async function cargarClaseRuta(db: ReturnType<typeof getDb>): Promise<Map<string, string | null>> {
  const filas = await db.select().from(infraExposicionRutaInundacion)
  const porCue = new Map<string, typeof filas>()
  for (const f of filas) porCue.set(f.cueAnexo, [...(porCue.get(f.cueAnexo) ?? []), f])
  return new Map([...porCue].map(([cue, lista]) => [cue, claseRutaDe(ultimaExposicionDeCue(lista)?.claseRuta)]))
}

export async function reemplazarCentros(filas: readonly FilaCentroEvacuados[], db = getDb()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(infraCentroEvacuados)
    for (let i = 0; i < filas.length; i += 500) await tx.insert(infraCentroEvacuados).values(filas.slice(i, i + 500))
  })
}

export async function correrCalculoCentrosEvacuados(
  opciones: { ahora?: Date; candidatosOsmPorCue?: ReadonlyMap<string, readonly CandidatoOsm[]> } = {},
): Promise<{ escuelas: number; aptas: number }> {
  const db = getDb()
  const [escuelas, riesgoPorCue, territorio, claseRutaPorCue] = await Promise.all([
    cargarEscuelas(), cargarRiesgoVigente(db), cargarTerritorioMapa(), cargarClaseRuta(db),
  ])
  const sitioPorCue = new Map(Object.entries(territorio.susceptibilidad?.escuelas ?? {}).map(([cue, s]) => [cue, { claseRio: s.claseRio, juntoLaguna: s.juntoLaguna }]))
  const filas = calcularFilasCentros({
    escuelas, riesgoPorCue, sitioPorCue, claseRutaPorCue,
    candidatosOsmPorCue: opciones.candidatosOsmPorCue ?? new Map(),
    ahora: opciones.ahora ?? new Date(),
  })
  await reemplazarCentros(filas, db)
  return { escuelas: filas.length, aptas: filas.filter((f) => f.apto).length }
}
