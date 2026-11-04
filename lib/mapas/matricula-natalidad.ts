import { normalizarNombreDepartamento } from './normalizar-departamento'

export type NivelMatricula = 'Inicial' | 'Primario'
export interface FilaMatricula {
  cueAnexo: string
  departamento: string
  nivel: NivelMatricula
  curso: string
  anio: number
  matricula: number
  secciones: number
}
export interface ResumenMatricula {
  matricula: number
  secciones: number
  escuelas: number
  porNivel: Partial<Record<NivelMatricula, number>>
}
export interface MatriculaEscuelaAnual extends ResumenMatricula {
  cursos: { nivel: NivelMatricula; curso: string; matricula: number; secciones: number }[]
}
export interface DatosMatriculaNatalidad {
  meta: {
    fuente: string
    fechaReporte: string
    cobertura: string
    anios: number[]
    registros: number
    establecimientos: number
    cueSinCoincidencia: string[]
  }
  provincia: Record<string, ResumenMatricula>
  departamentos: Record<string, Record<string, ResumenMatricula>>
  escuelas: Record<string, Record<string, MatriculaEscuelaAnual>>
}

function resumen(): ResumenMatricula {
  return { matricula: 0, secciones: 0, escuelas: 0, porNivel: {} }
}

/** Administrative totals include every source school, independently of map coordinates. */
export function construirMatriculaNatalidad(
  filas: FilaMatricula[],
  cuesMapa?: ReadonlySet<string>,
): DatosMatriculaNatalidad {
  const datos: DatosMatriculaNatalidad = {
    meta: {
      fuente: 'Reporte de matrícula — Consejo General de Educación',
      fechaReporte: '2026-09-28',
      cobertura: 'Consejo General de Educación · Inicial y Primario. No representa todo el sistema educativo. Corte del reporte; no implica cierre definitivo del ciclo 2026.',
      anios: [], registros: filas.length, establecimientos: 0, cueSinCoincidencia: [],
    },
    provincia: {}, departamentos: {}, escuelas: {},
  }
  const claves = new Set<string>()
  const anios = new Set<number>()
  const escuelasPorAgregado = new Map<ResumenMatricula, Set<string>>()
  function sumar(destino: ResumenMatricula, fila: FilaMatricula) {
    destino.matricula += fila.matricula
    destino.secciones += fila.secciones
    destino.porNivel[fila.nivel] = (destino.porNivel[fila.nivel] ?? 0) + fila.matricula
    const cues = escuelasPorAgregado.get(destino) ?? new Set<string>()
    cues.add(fila.cueAnexo)
    escuelasPorAgregado.set(destino, cues)
    destino.escuelas = cues.size
  }
  for (const fila of filas) {
    if (!/^\d{7}-\d{2}$/.test(fila.cueAnexo)) throw new Error('CUE-anexo inválido')
    if (!['Inicial', 'Primario'].includes(fila.nivel)) throw new Error('Nivel fuera de cobertura')
    if (!Number.isInteger(fila.anio) || fila.anio < 2021 || fila.anio > 2026) throw new Error('Ciclo fuera del reporte')
    if (!Number.isSafeInteger(fila.matricula) || fila.matricula < 0) throw new Error('Matrícula inválida')
    if (!Number.isSafeInteger(fila.secciones) || fila.secciones < 0) throw new Error('Secciones inválidas')
    const departamento = normalizarNombreDepartamento(fila.departamento)
    if (!departamento || !fila.curso.trim()) throw new Error('Departamento o curso vacío')
    const clave = JSON.stringify([fila.cueAnexo, fila.nivel, fila.curso, fila.anio])
    if (claves.has(clave)) throw new Error('Fila de matrícula duplicada')
    claves.add(clave)
    anios.add(fila.anio)
    const provincia = datos.provincia[fila.anio] ??= resumen()
    const porAnioDepartamento = datos.departamentos[departamento] ??= {}
    const porDepartamento = porAnioDepartamento[fila.anio] ??= resumen()
    const porAnioEscuela = datos.escuelas[fila.cueAnexo] ??= {}
    const escuela = porAnioEscuela[fila.anio] ??= { ...resumen(), cursos: [] }
    for (const agregado of [provincia, porDepartamento, escuela]) sumar(agregado, fila)
    escuela.cursos.push({ nivel: fila.nivel, curso: fila.curso, matricula: fila.matricula, secciones: fila.secciones })
  }
  datos.meta.anios = [...anios].sort((a, b) => a - b)
  const cues = Object.keys(datos.escuelas).sort()
  datos.meta.establecimientos = cues.length
  datos.meta.cueSinCoincidencia = cuesMapa ? cues.filter((cue) => !cuesMapa.has(cue)) : []
  return datos
}
