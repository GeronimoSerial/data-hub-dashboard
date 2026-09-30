import type { CorteSituacion } from '../puertos'

// Crea un CorteSituacion con valores por defecto razonables, permitiendo
// pisar cualquier campo puntualmente.
export function corteSituacionBase(overrides: Partial<CorteSituacion> = {}): CorteSituacion {
  return {
    id: 'corte-1',
    generadoEn: '2026-09-27T06:00:00Z',
    riskRunId: null,
    cobertura: null,
    conteosPorNivelRiesgo: {},
    kpis: {
      escuelasAfectacionConfirmadaVigente: 0,
      escuelasRiesgoAlto24h: 0,
      fuentesVencidas: 0,
    },
    fuentesSalud: [],
    episodiosAbiertos: 0,
    episodiosCerradosDesdeAnterior: 0,
    generadoPorJobRunId: null,
    creadaEn: '2026-09-27T06:00:00Z',
    ...overrides,
  }
}
