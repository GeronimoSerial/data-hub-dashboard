// Seguro para el cliente: sin dependencias de exceljs ni de la DB.
export type EstadoComedor = 'desayuno_almuerzo' | 'solo_desayuno' | 'solo_almuerzo' | 'sin_servicio'

export interface ServicioComedor {
  desayuno: boolean
  almuerzo: boolean
}

const ETIQUETAS: Record<EstadoComedor, string> = {
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
  return { estado, etiqueta: ETIQUETAS[estado] }
}

export function tieneComedor(estado: EstadoComedor | null | undefined): boolean {
  return estado !== undefined && estado !== null && estado !== 'sin_servicio'
}
