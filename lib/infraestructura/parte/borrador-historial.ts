import type { AlmacenClaveValor } from './envio-offline'

export function crearBorradorStore<T>(esBorrador: (valor: unknown) => valor is T) {
  return {
    async leer(almacen: AlmacenClaveValor, clave: string): Promise<T | null> {
      const crudo = await almacen.obtener(clave)
      if (!crudo) return null
      try {
        const dato: unknown = JSON.parse(crudo)
        if (esBorrador(dato)) return dato
        // Un borrador de otra versión del formulario no se restaura a medias.
        await almacen.eliminar(clave)
      } catch {
        return null
      }
      return null
    },
    async guardar(almacen: AlmacenClaveValor, clave: string, borrador: T): Promise<void> {
      await almacen.guardar(clave, JSON.stringify(borrador))
    },
    async limpiar(almacen: AlmacenClaveValor, clave: string): Promise<void> {
      await almacen.eliminar(clave)
    },
  }
}

export function empujarPasoEnHistorial(paso: number, generacion: string): void {
  try {
    window.history.pushState({ partePaso: paso, parteGeneracion: generacion }, '')
  } catch {
    // Without navigable history, the form still advances; only browser back is unavailable.
  }
}

export function colapsarHistorial(profundidad: number): void {
  if (profundidad <= 0) return
  try {
    window.history.go(-profundidad)
  } catch {
    // The saved draft is already cleared even when history cannot be traversed.
  }
}

export function leerPasoBaseHistorial(generacion: string): number {
  try {
    const estado = window.history.state as { partePaso?: number; parteGeneracion?: string } | null
    if (estado && typeof estado.partePaso === 'number' && estado.parteGeneracion === generacion) {
      return estado.partePaso
    }
  } catch {
    // Without usable history, restoration starts at the first step.
  }
  return 1
}
