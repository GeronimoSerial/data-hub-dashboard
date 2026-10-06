import type { EscuelaMapaEnriquecida, FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

function coincideApoyo(escuela: EscuelaMapaEnriquecida, opcion: FiltrosMapa['apoyo'][number]): boolean {
  switch (opcion) {
    case 'brinda':
      return escuela.apoyo === 'virtual' || escuela.apoyo === 'cuadernillo' || escuela.apoyo === 'ambos'
    case 'no':
      return escuela.apoyo === 'no'
    case 'virtual':
      return escuela.apoyo === 'virtual' || escuela.apoyo === 'ambos'
    case 'cuadernillo':
      return escuela.apoyo === 'cuadernillo' || escuela.apoyo === 'ambos'
  }
}

export function filtrarEscuelas<T extends EscuelaMapaEnriquecida>(escuelas: T[], f: FiltrosMapa): T[] {
  const q = normalizar(f.q)
  const qCue = q.replace(/-/g, '')

  return escuelas.filter((escuela) => {
    if (f.departamentos.length > 0 && !f.departamentos.includes(escuela.departamento)) return false
    if (f.niveles.length > 0 && !escuela.niveles.some((nivel) => f.niveles.includes(nivel))) return false
    if (f.gravedades.length > 0 && !f.gravedades.includes(escuela.gravedad)) return false
    if (f.clases.length > 0 && !f.clases.includes(escuela.clases)) return false
    if (f.apoyo.length > 0 && !f.apoyo.some((opcion) => coincideApoyo(escuela, opcion))) return false
    if (f.sinActualizar && !escuela.sinActualizar) return false
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
      case 'niveles':
        for (const nivel of new Set(escuela.niveles)) sumar(nivel)
        break
      case 'gravedades':
        sumar(String(escuela.gravedad))
        break
      case 'clases':
        sumar(escuela.clases)
        break
      case 'apoyo':
        for (const opcion of ['brinda', 'no', 'virtual', 'cuadernillo'] as const) {
          if (coincideApoyo(escuela, opcion)) sumar(opcion)
        }
        break
    }
  }

  return conteos
}

export function opcionesDisponibles(escuelas: EscuelaMapaEnriquecida[]): { departamentos: string[]; niveles: string[] } {
  const departamentos = new Set<string>()
  const niveles = new Set<string>()

  for (const escuela of escuelas) {
    departamentos.add(escuela.departamento)
    for (const nivel of escuela.niveles) niveles.add(nivel)
  }

  const ordenar = (a: string, b: string) => a.localeCompare(b, 'es')
  return {
    departamentos: [...departamentos].sort(ordenar),
    niveles: [...niveles].sort(ordenar),
  }
}
