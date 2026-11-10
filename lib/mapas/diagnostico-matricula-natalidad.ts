import type { DatosMatriculaNatalidad, NivelMatricula } from './matricula-natalidad'
import { normalizarNombreDepartamento } from './normalizar-departamento'

interface Filtro {
  departamento?: string
  cueAnexo?: string
  nivel?: NivelMatricula
  curso?: string
}

export function resumirMatricula(datos: DatosMatriculaNatalidad, anio: number, filtro: Filtro = {}) {
  // The aggregate has no CUE-to-department mapping; never silently drop unmatched schools.
  if (filtro.departamento) {
    if (filtro.nivel || filtro.curso) return null
    const dato = datos.departamentos[normalizarNombreDepartamento(filtro.departamento)]?.[anio]
    return dato ? { ...dato, alumnosPorSeccion: dato.secciones ? dato.matricula / dato.secciones : null } : null
  }
  const escuelas = filtro.cueAnexo ? [datos.escuelas[filtro.cueAnexo]] : Object.values(datos.escuelas)
  let matricula = 0
  let secciones = 0
  let escuelasInformadas = 0
  for (const serie of escuelas) {
    const anual = serie?.[anio]
    if (!anual) continue
    const cursos = anual.cursos.filter((curso) => (!filtro.nivel || curso.nivel === filtro.nivel) && (!filtro.curso || curso.curso === filtro.curso))
    if (!cursos.length) continue
    escuelasInformadas++
    for (const curso of cursos) {
      matricula += curso.matricula
      secciones += curso.secciones
    }
  }
  return escuelasInformadas ? { matricula, secciones, escuelas: escuelasInformadas, alumnosPorSeccion: secciones ? matricula / secciones : null } : null
}
