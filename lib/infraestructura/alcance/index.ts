import type { EjecutorSql } from '../ge-db'
import { crearAlcanceGe, type AlcanceGe } from './ge'
import { crearAlcanceMatricula, type AlcanceMatricula } from './matricula'

export type { AlcanceProvider, IdentidadMiembro, UnidadAlcance } from './tipos'
export type { AlcanceGe } from './ge'
export type { AlcanceMatricula, CarreraMatricula } from './matricula'

// Alcance de un CUE según su sistema: GE (padrón, escuelas) o matrícula
// (institutos superiores). `sistema` discrimina; los consumidores GE-shaped
// sólo pueden tocar AlcanceGe.
export type AlcanceCue = AlcanceGe | AlcanceMatricula

// Adaptador GE del CUE, con su superficie GE-only. Mantener una instancia por
// request y usarla para todas las lecturas del CUE, así las filas de sección
// se leen una sola vez.
export function alcanceGeParaCue(client: EjecutorSql, corteId: number, cueAnexo: string): AlcanceGe {
  return crearAlcanceGe(client, corteId, cueAnexo)
}

// REGLA ÚNICA de detección de instituto: el CUE tiene al menos una carrera en
// el corte de matrícula vigente, sin importar su nivel jurisdiccional. Toda
// decisión de sistema (adaptador por CUE y lotes) pasa por acá.
export function esCueInstituto(carrerasVigentes: number): boolean {
  return carrerasVigentes > 0
}

// Corte de matrícula vigente (id), o null si no hay ninguno.
export async function corteMatriculaVigente(client: EjecutorSql): Promise<number | null> {
  const vigente = await client.execute("SELECT id FROM matricula_corte WHERE estado = 'vigente' LIMIT 1")
  const fila = vigente.rows[0]
  return fila ? Number(fila.id) : null
}

// Cantidad de carreras del CUE en un corte de matrícula (una consulta).
export async function contarCarrerasVigentes(client: EjecutorSql, corteId: number, cueAnexo: string): Promise<number> {
  const res = await client.execute({
    sql: 'SELECT COUNT(*) AS total FROM matricula_carrera WHERE corte_id = ? AND cue_anexo = ?',
    args: [corteId, cueAnexo],
  })
  return Number(res.rows[0]?.total ?? 0)
}

// Elige el adaptador del CUE con esCueInstituto. En cualquier otro caso queda
// el padrón GE.
export async function alcanceParaCue(
  client: EjecutorSql,
  corteId: number,
  cueAnexo: string,
): Promise<AlcanceCue> {
  const corte = await corteMatriculaVigente(client)
  if (corte !== null && esCueInstituto(await contarCarrerasVigentes(client, corte, cueAnexo))) {
    return crearAlcanceMatricula(client, corte, cueAnexo)
  }
  return crearAlcanceGe(client, corteId, cueAnexo)
}

// Misma decisión que alcanceParaCue, en lote: qué CUEs de la lista son
// instituto. Dos consultas constantes (corte de matrícula vigente y conteo de
// carreras de todos los CUEs), nunca una por CUE.
export async function cuesDeInstitutoVigentes(
  client: EjecutorSql,
  cueAnexos: string[],
): Promise<{ cues: Set<string>; corteId: number | null }> {
  const cues = new Set<string>()
  if (cueAnexos.length === 0) return { cues, corteId: null }
  const corteId = await corteMatriculaVigente(client)
  if (corteId === null) return { cues, corteId }
  const marcadores = cueAnexos.map(() => '?').join(', ')
  const carreras = await client.execute({
    sql: `SELECT cue_anexo, COUNT(*) AS total FROM matricula_carrera
          WHERE corte_id = ? AND cue_anexo IN (${marcadores})
          GROUP BY cue_anexo`,
    args: [corteId, ...cueAnexos],
  })
  for (const fila of carreras.rows) {
    if (esCueInstituto(Number(fila.total))) cues.add(String(fila.cue_anexo))
  }
  return { cues, corteId }
}
