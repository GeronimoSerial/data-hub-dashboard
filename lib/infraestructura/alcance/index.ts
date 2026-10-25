import type { EjecutorSql } from '../ge-db'
import { nivelJurisdiccionalDeCue } from '../nivel-jurisdiccional'
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

// Un CUE es de instituto superior cuando GE lo asigna al nivel jurisdiccional
// "Superior" (ge_escuela_nivel_jur). Se compara sin acentos ni mayúsculas.
export function esNivelSuperior(nombreNivel: string): boolean {
  const normalizado = nombreNivel.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  return normalizado.includes('superior')
}

// REGLA ÚNICA de detección de instituto: nivel "Superior" Y corte de matrícula
// vigente. Toda decisión de sistema (adaptador por CUE y lotes) pasa por acá.
export function esCueInstituto(nivelNombre: string | null, corteMatriculaVigente: number | null): boolean {
  return nivelNombre !== null && corteMatriculaVigente !== null && esNivelSuperior(nivelNombre)
}

// Corte de matrícula vigente (id), o null si no hay ninguno.
export async function corteMatriculaVigente(client: EjecutorSql): Promise<number | null> {
  const vigente = await client.execute("SELECT id FROM matricula_corte WHERE estado = 'vigente' LIMIT 1")
  const fila = vigente.rows[0]
  return fila ? Number(fila.id) : null
}

// Elige el adaptador del CUE con esCueInstituto. En cualquier otro caso queda
// el padrón GE.
export async function alcanceParaCue(
  client: EjecutorSql,
  corteId: number,
  cueAnexo: string,
): Promise<AlcanceCue> {
  const nivel = await nivelJurisdiccionalDeCue(client, cueAnexo)
  // El corte de matrícula sólo se consulta si el nivel puede ser instituto.
  const corteMatricula = nivel && esNivelSuperior(nivel.nombre) ? await corteMatriculaVigente(client) : null
  if (esCueInstituto(nivel?.nombre ?? null, corteMatricula)) {
    return crearAlcanceMatricula(client, corteMatricula!, cueAnexo)
  }
  return crearAlcanceGe(client, corteId, cueAnexo)
}

// Misma decisión que alcanceParaCue, en lote: qué CUEs de la lista son
// instituto. Tres consultas constantes (niveles de todos los CUEs, corte de
// matrícula vigente), nunca una por CUE.
export async function cuesDeInstitutoVigentes(
  client: EjecutorSql,
  cueAnexos: string[],
): Promise<{ cues: Set<string>; corteId: number | null }> {
  const cues = new Set<string>()
  if (cueAnexos.length === 0) return { cues, corteId: null }
  const marcadores = cueAnexos.map(() => '?').join(', ')
  const niveles = await client.execute({
    sql: `SELECT e.cue_anexo, n.nombre
          FROM ge.ge_escuela_nivel_jur e
          JOIN ge.ge_nivel_jurisdiccional n ON n.id = e.nivel_jurisdiccional_id
          WHERE e.cue_anexo IN (${marcadores})`,
    args: cueAnexos,
  })
  const hayNivelSuperior = niveles.rows.some((fila) => esNivelSuperior(String(fila.nombre)))
  const corteId = hayNivelSuperior ? await corteMatriculaVigente(client) : null
  for (const fila of niveles.rows) {
    const cue = String(fila.cue_anexo)
    if (esCueInstituto(String(fila.nombre), corteId)) cues.add(cue)
  }
  return { cues, corteId }
}
