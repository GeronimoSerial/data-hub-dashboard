import type { EscuelaMapaEnriquecida, FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

function coincideApoyo(escuela: EscuelaMapaEnriquecida, opcion: FiltrosMapa['apoyo'][number]): boolean {
  switch (opcion) {
    case 'brinda':
      return escuela.apoyo === 'virtual' || escuela.apoyo === 'cuadernillo' || escuela.apoyo === 'ambos' || escuela.apoyo === 'brinda'
    case 'no':
      return escuela.apoyo === 'no'
    case 'sin_dato':
      return escuela.apoyo === 'sin_dato'
  }
}

export function filtrarEscuelas<T extends EscuelaMapaEnriquecida>(escuelas: T[], f: FiltrosMapa): T[] {
  const q = normalizar(f.q)
  const qCue = q.replace(/-/g, '')

  return escuelas.filter((escuela) => {
    if (f.departamentos.length > 0 && !f.departamentos.includes(escuela.departamento)) return false
    if (f.direcciones.length > 0 && (typeof escuela.nivelJurisdiccionalId !== 'number' || !f.direcciones.includes(escuela.nivelJurisdiccionalId))) return false
    if (f.gravedades.length > 0 && !f.gravedades.includes(escuela.gravedad)) return false
    if (f.clases.length > 0 && !f.clases.includes(escuela.clases)) return false
    if (f.apoyo.length > 0 && !f.apoyo.some((opcion) => coincideApoyo(escuela, opcion))) return false
    if (f.sinActualizar && !escuela.sinActualizar) return false
    if (f.solucionadasRecientes && escuela.solucionadasRecientes <= 0) return false
    if (q && !normalizar(escuela.nombre).includes(q)) {
      const cue = normalizar(escuela.cueAnexo).replace(/-/g, '')
      if (!qCue || !cue.includes(qCue)) return false
    }
    return true
  })
}

export function contarOpciones(
  escuelas: EscuelaMapaEnriquecida[],
  clave: keyof Omit<FiltrosMapa, 'q' | 'sinActualizar'>,
): Map<string, number> {
  const conteos = new Map<string, number>()

  function sumar(opcion: string): void {
    conteos.set(opcion, (conteos.get(opcion) ?? 0) + 1)
  }

  for (const escuela of escuelas) {
    switch (clave) {
      case 'departamentos':
        sumar(escuela.departamento)
        break
      case 'direcciones':
        if (typeof escuela.nivelJurisdiccionalId === 'number') sumar(String(escuela.nivelJurisdiccionalId))
        break
      case 'gravedades':
        sumar(String(escuela.gravedad))
        break
      case 'clases':
        sumar(escuela.clases)
        break
      case 'apoyo':
        for (const opcion of ['brinda', 'no', 'sin_dato'] as const) {
          if (coincideApoyo(escuela, opcion)) sumar(opcion)
        }
        break
    }
  }

  return conteos
}

export function opcionesDisponibles(escuelas: EscuelaMapaEnriquecida[]): { departamentos: string[] } {
  const departamentos = new Set<string>()

  for (const escuela of escuelas) departamentos.add(escuela.departamento)

  return {
    departamentos: [...departamentos].sort((a, b) => a.localeCompare(b, 'es')),
  }
}

// Opciones del filtro "Nivel": los niveles jurisdiccionales presentes en las
// escuelas recibidas. El servidor ya limita esas escuelas al alcance del rol
// (director_nivel sólo recibe las de sus niveles), así que las opciones también.
export function opcionesDireccion(
  escuelas: EscuelaMapaEnriquecida[],
): Array<{ id: number; nombre: string }> {
  const porId = new Map<number, string>()
  for (const escuela of escuelas) {
    if (typeof escuela.nivelJurisdiccionalId === 'number' && escuela.nivelJurisdiccionalNombre) {
      porId.set(escuela.nivelJurisdiccionalId, escuela.nivelJurisdiccionalNombre)
    }
  }
  return [...porId]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
