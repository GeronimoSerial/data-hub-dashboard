import catalogo from '../../data/carreras-superior-2026.json' with { type: 'json' }
import { normalizeCue } from './cue'
import type { CategoriaAfectacion } from './categorias'
import type { AlcanceSecciones } from './consistencia-parte'

const carrerasPorCue: Readonly<Record<string, readonly string[]>> = catalogo

export function carrerasDelCue(cue: string): readonly string[] {
  const normalizado = normalizeCue(cue)
  if (!normalizado) return []
  return carrerasPorCue[normalizado.kind === 'base' ? `${normalizado.base}-00` : normalizado.value] ?? []
}

export function esCueSuperior(cue: string): boolean {
  return carrerasDelCue(cue).length > 0
}

export function validarCarrerasDeServicio(cue: string, seleccionadas: readonly string[]): string | null {
  const disponibles = carrerasDelCue(cue)
  if (disponibles.length === 0) return 'Este establecimiento no admite selección de carreras'
  if (seleccionadas.length === 0) return 'Elija al menos una carrera'
  if (new Set(seleccionadas).size !== seleccionadas.length) return 'No repita carreras en la selección'
  if (seleccionadas.some((carrera) => !disponibles.includes(carrera))) {
    return 'Alguna de las carreras no pertenece al establecimiento indicado'
  }
  return null
}

export function alcanceDeCarreras(seleccionadas: readonly string[], disponibles: readonly string[]): AlcanceSecciones | null {
  if (seleccionadas.length === 0) return null
  return disponibles.length > 0 && disponibles.every((carrera) => seleccionadas.includes(carrera))
    ? { tipo: 'toda' }
    : { tipo: 'algunas', secciones: seleccionadas.length }
}

export function validarAlcanceCarreras(
  cue: string,
  categoria: CategoriaAfectacion,
  alcance: { carreras?: string[]; secciones?: number[]; alumnos?: number[] },
  esNueva: boolean,
): string | null {
  const catalogo = carrerasDelCue(cue)
  const carreras = alcance.carreras ?? []
  if (catalogo.length === 0) return carreras.length > 0 ? 'Este establecimiento no admite selección de carreras' : null
  if (categoria === 'alumnos') return 'Inaccesibilidad de alumnos no está disponible para Superior'
  if ((alcance.alumnos?.length ?? 0) > 0 || (alcance.secciones?.length ?? 0) > 0) {
    return 'Para Superior seleccione carreras, no secciones ni alumnos'
  }
  if ((esNueva || alcance.carreras !== undefined) && carreras.length === 0) return 'Elija al menos una carrera'
  if (carreras.some((carrera) => !catalogo.includes(carrera))) return 'Alguna de las carreras no pertenece al establecimiento indicado'
  if (new Set(carreras).size !== carreras.length) return 'No repita carreras en la selección'
  return null
}
