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

// Elige el adaptador del CUE. Usa matrícula sólo si el nivel es Superior Y hay
// un corte de matrícula vigente; en cualquier otro caso queda el padrón GE.
export async function alcanceParaCue(
  client: EjecutorSql,
  corteId: number,
  cueAnexo: string,
): Promise<AlcanceCue> {
  const nivel = await nivelJurisdiccionalDeCue(client, cueAnexo)
  if (nivel && esNivelSuperior(nivel.nombre)) {
    const vigente = await client.execute(
      "SELECT id FROM matricula_corte WHERE estado = 'vigente' LIMIT 1",
    )
    const fila = vigente.rows[0]
    if (fila) return crearAlcanceMatricula(client, Number(fila.id), cueAnexo)
  }
  return crearAlcanceGe(client, corteId, cueAnexo)
}
