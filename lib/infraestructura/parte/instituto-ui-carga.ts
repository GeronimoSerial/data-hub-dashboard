// Decide, por CUE, si el parte usa el flujo de institutos superiores y carga
// sus carreras de la matrícula vigente. Las pantallas sólo ven cuatro
// resultados: GE, desconocido (no se pudo leer la matrícula: camino GE), instituto
// con carreras, o error (el CUE tiene carreras pero no se pudieron listar).
//
// Los errores se registran sin el CUE ni datos de alumnos: sólo el evento y el
// error técnico.
import { contarCarrerasVigentes, corteMatriculaVigente, esCueInstituto } from '../alcance'
import { crearAlcanceMatricula } from '../alcance/matricula'
import type { EjecutorSql } from '../ge-db'
import { log } from '@/lib/http/log'
import type { CarreraElegible } from './instituto-ui'

export type CargaCarrerasInstituto =
  | { tipo: 'ge' }
  | { tipo: 'desconocido' }
  | { tipo: 'instituto'; carreras: CarreraElegible[] }
  | { tipo: 'error' }

export async function cargarCarrerasInstituto(client: EjecutorSql, cue: string): Promise<CargaCarrerasInstituto> {
  let corte: number | null
  let cantidad: number
  try {
    corte = await corteMatriculaVigente(client)
    cantidad = corte === null ? 0 : await contarCarrerasVigentes(client, corte, cue)
  } catch (error) {
    log.error('parte.instituto.deteccion_fallo', { error })
    return { tipo: 'desconocido' }
  }
  if (corte === null || !esCueInstituto(cantidad)) return { tipo: 'ge' }

  try {
    const carreras = await crearAlcanceMatricula(client, corte, cue).listarCarreras()
    return {
      tipo: 'instituto',
      carreras: carreras.map((carrera) => ({
        id: carrera.id,
        nombre: carrera.nombre,
        tipo: carrera.tipo,
        totalAlumnos: carrera.totalAlumnos,
        rm: carrera.rm,
      })),
    }
  } catch (error) {
    log.error('parte.instituto.carreras_fallo', { error })
    return { tipo: 'error' }
  }
}
