// Helpers puros del parte para institutos superiores (carreras y alumnos).
//
// Sin React ni red: el selector, el formulario y las pantallas de estado usan
// estas funciones para que la regla de alcance se pruebe sin montar nada. La
// regla espeja la del servidor (instituto-alcance.ts): una carrera sin alumnos
// elegidos es la carrera completa; con alumnos elegidos, sólo esos.

export interface CarreraElegible {
  id: number
  nombre: string
  tipo: string
  totalAlumnos: number
  /** Resolución ministerial de la carrera; sólo sirve para distinguir homónimas. */
  rm?: string
}

// Alumno elegido con lo necesario para mostrarlo sin volver a consultar. El
// DNI nunca viaja hasta acá: la búsqueda no lo devuelve.
export interface AlumnoElegido {
  id: number
  apellido: string
  nombre: string
  carreraId: number
}

export interface SeleccionInstituto {
  carreras: number[]
  alumnos: number[]
  alumnosElegidos: AlumnoElegido[]
}

export function contar(cantidad: number, singular: string, plural: string): string {
  return cantidad === 1 ? `1 ${singular}` : `${cantidad} ${plural}`
}

/** Cantidad de carreras y alumnos alcanzados, con la regla de carrera completa. */
export function alcanceInstituto(
  carreras: number[],
  alumnosElegidos: AlumnoElegido[],
  catalogo: CarreraElegible[],
): { carreras: number; alumnos: number } {
  let alumnos = 0
  for (const carreraId of carreras) {
    const explicitos = alumnosElegidos.filter((alumno) => alumno.carreraId === carreraId).length
    alumnos += explicitos > 0 ? explicitos : (catalogo.find((carrera) => carrera.id === carreraId)?.totalAlumnos ?? 0)
  }
  return { carreras: carreras.length, alumnos }
}

/** "Alcanza a 2 carreras: A, B (15 alumnos)". Para el historial y el resumen con nombres. */
export function textoAlcanceInstitutoConNombres(nombres: string[], alumnos: number): string {
  const base = `Alcanza a ${contar(nombres.length, 'carrera', 'carreras')}: ${nombres.join(', ')}`
  return alumnos > 0 ? `${base} (${contar(alumnos, 'alumno', 'alumnos')})` : base
}

/** "Alcanza a 2 carreras (15 alumnos)". Sin alumnos calculados, sólo la cantidad de carreras. */
export function textoAlcanceInstituto(carreras: number, alumnos: number): string {
  const base = `Alcanza a ${contar(carreras, 'carrera', 'carreras')}`
  return alumnos > 0 ? `${base} (${contar(alumnos, 'alumno', 'alumnos')})` : base
}

/** "RM 4658/15", "R.M. 690/12" o "RM: 4658/15" → "4658/15". Sin prefijo, lo deja igual. */
export function numeroRm(rm: string): string {
  return rm.trim().replace(/^R\.?\s*M\.?\s*:?\s*/i, '').trim()
}

/**
 * Etiqueta de cada carrera del CUE. Un nombre repetido dentro del CUE (p. ej.
 * "Matemática" dos veces) se distingue con tipo y RM: "Matemática — Profesorado (RM 1464/14)".
 */
export function etiquetasDeCarreras(catalogo: CarreraElegible[]): Map<number, string> {
  const cantidadPorNombre = new Map<string, number>()
  for (const carrera of catalogo) cantidadPorNombre.set(carrera.nombre, (cantidadPorNombre.get(carrera.nombre) ?? 0) + 1)
  const etiquetas = new Map<number, string>()
  for (const carrera of catalogo) {
    const repetida = (cantidadPorNombre.get(carrera.nombre) ?? 0) > 1
    if (!repetida) {
      etiquetas.set(carrera.id, carrera.nombre)
      continue
    }
    const numero = numeroRm(carrera.rm ?? '')
    const rm = numero ? ` (RM ${numero})` : ''
    etiquetas.set(carrera.id, `${carrera.nombre} — ${carrera.tipo}${rm}`)
  }
  return etiquetas
}

/** Etiquetas de las carreras elegidas, en el orden del catálogo. */
export function nombresDeCarreras(carreras: number[], catalogo: CarreraElegible[]): string[] {
  const etiquetas = etiquetasDeCarreras(catalogo)
  return catalogo.filter((carrera) => carreras.includes(carrera.id)).map((carrera) => etiquetas.get(carrera.id) ?? carrera.nombre)
}

/** Deja sólo los alumnos que siguen dentro de las carreras elegidas. */
export function ajustarAlumnosA(carreras: number[], alumnosElegidos: AlumnoElegido[]): AlumnoElegido[] {
  return alumnosElegidos.filter((alumno) => carreras.includes(alumno.carreraId))
}

/** Cambia la lista de carreras y descarta los alumnos que quedaron fuera. */
export function conCarrerasElegidas(seleccion: SeleccionInstituto, carreras: number[]): SeleccionInstituto {
  const alumnosElegidos = ajustarAlumnosA(carreras, seleccion.alumnosElegidos)
  return { carreras, alumnosElegidos, alumnos: alumnosElegidos.map((alumno) => alumno.id) }
}

/** Agrega el alumno si no estaba, o lo quita si ya estaba elegido. */
export function conAlumnoAlternado(seleccion: SeleccionInstituto, alumno: AlumnoElegido): SeleccionInstituto {
  const yaElegido = seleccion.alumnosElegidos.some((elegido) => elegido.id === alumno.id)
  const alumnosElegidos = yaElegido
    ? seleccion.alumnosElegidos.filter((elegido) => elegido.id !== alumno.id)
    : [...seleccion.alumnosElegidos, alumno]
  return { ...seleccion, alumnosElegidos, alumnos: alumnosElegidos.map((elegido) => elegido.id) }
}

/** Valida la forma de un alumno elegido leído de un borrador guardado. */
export function esAlumnoElegido(valor: unknown): valor is AlumnoElegido {
  if (typeof valor !== 'object' || valor === null) return false
  const a = valor as Record<string, unknown>
  return (
    typeof a.id === 'number' &&
    typeof a.apellido === 'string' &&
    typeof a.nombre === 'string' &&
    typeof a.carreraId === 'number'
  )
}

export function esListaDeNumeros(valor: unknown): valor is number[] {
  return Array.isArray(valor) && valor.every((n) => typeof n === 'number')
}

export function esListaAlumnosElegidos(valor: unknown): valor is AlumnoElegido[] {
  return Array.isArray(valor) && valor.every(esAlumnoElegido)
}

/**
 * Selección limitada a las carreras que siguen en el catálogo vigente. Un
 * borrador restaurado o encolado sin conexión puede traer ids de un corte
 * anterior: se descartan antes de mostrarlos o enviarlos.
 */
export function seleccionVigente(seleccion: SeleccionInstituto, catalogo: CarreraElegible[]): SeleccionInstituto {
  const vigentes = new Set(catalogo.map((carrera) => carrera.id))
  return conCarrerasElegidas(seleccion, seleccion.carreras.filter((id) => vigentes.has(id)))
}
