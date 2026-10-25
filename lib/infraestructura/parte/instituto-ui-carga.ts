// Decide, por CUE, si el parte usa el flujo de institutos superiores y carga
// sus carreras de la matrícula vigente. Las pantallas sólo ven cuatro
// resultados: GE, desconocido (no se pudo leer el nivel: camino GE), instituto
// con carreras, o error (nivel Superior pero no se pudieron leer las carreras).
//
// Los errores se registran sin el CUE ni datos de alumnos: sólo el evento y el
// error técnico.
import { esNivelSuperior, corteMatriculaVigente } from '../alcance'
import { crearAlcanceMatricula } from '../alcance/matricula'
import { nivelJurisdiccionalDeCue } from '../nivel-jurisdiccional'
import type { EjecutorSql } from '../ge-db'
import { log } from '@/lib/http/log'
import type { CarreraElegible } from './instituto-ui'

export type CargaCarrerasInstituto =
  | { tipo: 'ge' }
  | { tipo: 'desconocido' }
  | { tipo: 'instituto'; carreras: CarreraElegible[] }
  | { tipo: 'error' }

export async function cargarCarrerasInstituto(client: EjecutorSql, cue: string): Promise<CargaCarrerasInstituto> {
  let nivel: Awaited<ReturnType<typeof nivelJurisdiccionalDeCue>>
  try {
    nivel = await nivelJurisdiccionalDeCue(client, cue)
  } catch (error) {
    log.error('parte.instituto.nivel_fallo', { error })
    return { tipo: 'desconocido' }
  }
  if (!nivel || !esNivelSuperior(nivel.nombre)) return { tipo: 'ge' }

  try {
    const corte = await corteMatriculaVigente(client)
    if (corte === null) return { tipo: 'ge' }
    const carreras = await crearAlcanceMatricula(client, corte, cue).listarCarreras()
    return {
      tipo: 'instituto',
      carreras: carreras.map((carrera) => ({
        id: carrera.id,
        nombre: carrera.nombre,
        tipo: carrera.tipo,
        totalAlumnos: carrera.totalAlumnos,
      })),
    }
  } catch (error) {
    log.error('parte.instituto.carreras_fallo', { error })
    return { tipo: 'error' }
  }
}
