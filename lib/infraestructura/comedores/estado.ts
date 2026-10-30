// Seguro para el cliente: sin dependencias de exceljs ni de la DB.
export type EstadoComedor = 'desayuno_almuerzo' | 'solo_desayuno' | 'solo_almuerzo' | 'sin_servicio'

export interface ServicioComedor {
  desayuno: boolean
  almuerzo: boolean
}

export const ETIQUETA_COMEDOR: Record<EstadoComedor, string> = {
  desayuno_almuerzo: 'Comedor: desayuno y almuerzo',
  solo_desayuno: 'Comedor: solo desayuno',
  solo_almuerzo: 'Comedor: solo almuerzo',
  sin_servicio: 'Comedor: sin servicio registrado',
}

// Sin fila en la planilla = "sin servicio registrado" (no se afirma que no haya).
export function estadoComedor(servicio: ServicioComedor | null | undefined): { estado: EstadoComedor; etiqueta: string } {
  const estado: EstadoComedor = !servicio || (!servicio.desayuno && !servicio.almuerzo)
    ? 'sin_servicio'
    : servicio.desayuno && servicio.almuerzo
      ? 'desayuno_almuerzo'
      : servicio.desayuno ? 'solo_desayuno' : 'solo_almuerzo'
  return { estado, etiqueta: ETIQUETA_COMEDOR[estado] }
}

// Valor para filas "Comedor / <valor>": la etiqueta sin el prefijo, con mayúscula inicial.
export function valorComedor(estado: EstadoComedor): string {
  const texto = ETIQUETA_COMEDOR[estado].replace(/^Comedor: /, '')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function tieneComedor(estado: EstadoComedor | null | undefined): boolean {
  return estado !== undefined && estado !== null && estado !== 'sin_servicio'
}
