export const CLAVE_VINCULO_VERIFICACION = 'e1-verificacion-vinculo'

export interface VinculoVerificacion {
  id: string
  token: string
}

export function leerVinculoVerificacion(): VinculoVerificacion | null {
  if (typeof window === 'undefined') return null

  try {
    const contenido = window.sessionStorage.getItem(CLAVE_VINCULO_VERIFICACION)
    if (!contenido) return null

    const valor: unknown = JSON.parse(contenido)
    if (typeof valor !== 'object' || valor === null) return null

    const vinculo = valor as Partial<VinculoVerificacion>
    if (
      typeof vinculo.id !== 'string' ||
      vinculo.id.trim().length === 0 ||
      typeof vinculo.token !== 'string' ||
      vinculo.token.trim().length === 0
    ) {
      return null
    }

    return { id: vinculo.id, token: vinculo.token }
  } catch {
    return null
  }
}

export function limpiarVinculoVerificacion(): void {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(CLAVE_VINCULO_VERIFICACION)
  } catch {
    // El almacenamiento puede estar deshabilitado por el navegador.
  }
}
