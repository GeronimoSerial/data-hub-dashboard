import type { EscuelaMapaPadron } from '@/lib/infraestructura/parte-mapa'

export interface TotalesEscuelasFiltradas {
  totalEscuelas: number
  escuelasAfectadas: number
  porcentajeAfectadas: number
}

export function calcularTotalesEscuelasFiltradas(
  escuelas: Pick<EscuelaMapaPadron, 'estado'>[],
): TotalesEscuelasFiltradas {
  const totalEscuelas = escuelas.length
  const escuelasAfectadas = escuelas.filter((escuela) => escuela.estado === 'afectada').length

  return {
    totalEscuelas,
    escuelasAfectadas,
    porcentajeAfectadas: totalEscuelas === 0
      ? 0
      : Math.round((escuelasAfectadas / totalEscuelas) * 1000) / 10,
  }
}
