import type { EjecutorSql } from '../ge-db'
import { obtenerMembresiaSecciones } from '../impacto'
import { listarIdentidadesPorPersonas } from '../identidad'
import { listarSeccionesDelCue } from '../secciones-cue'
import type { SeccionEstablecimiento } from '../trayectoria-tipos'
import type { AlcanceProvider, UnidadAlcance } from './tipos'

// GE adapter with its GE-only surface. Only for GE-shaped consumers
// (ParteActual.secciones, GET ficha); validation and logic use the generic port.
export interface AlcanceGe extends AlcanceProvider {
  readonly sistema: 'ge'
  // Original section rows of the CUE. Read once per instance and shared with
  // listUnits(): one ge_seccion query per instance, not one per caller.
  listarSeccionesGe(): Promise<SeccionEstablecimiento[]>
}

function aUnidadAlcance(seccion: SeccionEstablecimiento): UnidadAlcance {
  return {
    id: seccion.geSectionId,
    etiqueta: `${seccion.curso ?? ''} ${seccion.division ?? ''}`.trim(),
    turno: seccion.turno,
    grupo: seccion.nivel ?? null,
  }
}

// Adapter for the GE padrón: units are ge_seccion rows of the CUE, members
// are ge_alumno_seccion rows and identities come from ge_alumno_identidad.
// Only delegates to the existing queries; the SQL lives in those modules.
export function crearAlcanceGe(client: EjecutorSql, corteId: number, cueAnexo: string): AlcanceGe {
  let seccionesGe: Promise<SeccionEstablecimiento[]> | undefined
  const listarSeccionesGe = () => {
    if (!seccionesGe) {
      const lectura = listarSeccionesDelCue(client, corteId, cueAnexo)
      seccionesGe = lectura
      // Un fallo no queda cacheado: la siguiente llamada vuelve a consultar.
      lectura.catch(() => {
        seccionesGe = undefined
      })
    }
    return seccionesGe
  }
  return {
    sistema: 'ge',
    listarSeccionesGe,
    listUnits: async () => (await listarSeccionesGe()).map(aUnidadAlcance),
    listMembers: (unitIds) => obtenerMembresiaSecciones(client, { corteId, geSectionIds: unitIds }),
    resolveIdentities: async (memberIds) =>
      (await listarIdentidadesPorPersonas(client, memberIds)).map((i) => ({
        miembroId: i.gePersonId,
        nombre: i.nombre,
        apellido: i.apellido,
      })),
  }
}
