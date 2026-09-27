// Módulo de dominio del batch E8 (briefing narrativo asistido por IA).
// Este puerto aísla a E8 de la tabla infra_situacion_corte que produce el batch
// E5 de forma paralela: E8 sólo consume el contrato de tipos, nunca la tabla ni
// su esquema de persistencia. Mientras E5 no mergee la tabla real, E8 trabaja
// contra el adaptador "no disponible" que devuelve null, y N1 conectará luego
// el adaptador real que consulta la tabla.

export interface CorteSituacion {
  id: string
  generadoEn: string
  riskRunId: string | null
  cobertura: Record<string, number> | null
  conteosPorNivelRiesgo: Record<string, number>
  kpis: {
    escuelasAfectacionConfirmadaVigente: number
    escuelasRiesgoAlto24h: number
    fuentesVencidas: number
  }
  fuentesSalud: Array<{
    provider: string
    estado: string
    frescuraMinutos: number | null
    vencida: boolean
  }>
  episodiosAbiertos: number
  episodiosCerradosDesdeAnterior: number
  generadoPorJobRunId: string | null
  creadaEn: string
}

export interface PuertoCorteSituacion {
  obtenerUltimoCorte(): Promise<CorteSituacion | null>
  obtenerCortePorId(id: string): Promise<CorteSituacion | null>
}

// Adaptador temporal: E8 debe poder montarse y testearse sin la tabla real de
// E5. Devuelve siempre null en lugar de fallar, para que el pipeline trate la
// ausencia de corte como un estado normal y no como un error.
export function crearPuertoCorteSituacionNoDisponible(): PuertoCorteSituacion {
  return {
    async obtenerUltimoCorte(): Promise<CorteSituacion | null> {
      return null
    },
    async obtenerCortePorId(_id: string): Promise<CorteSituacion | null> {
      return null
    },
  }
}
