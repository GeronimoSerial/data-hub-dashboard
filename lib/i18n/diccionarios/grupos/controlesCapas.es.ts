// Spanish (Corrientes) texts of the `controlesCapas` group. Values stay byte-for-byte as shipped.
export const controlesCapasEs = {
  capas: 'Capas',
  capasRadar: 'Capas del radar (pronóstico)',
  capasTerritoriales: 'Capas territoriales',
  mapaBase: 'Mapa base',
  radar: {
    peligro: 'Peligro por clima estimado (por departamento)',
    riesgo: 'Riesgo pronosticado por escuela',
    'riesgo-acceso': 'Riesgo pronosticado de llegar a la escuela',
  },
  accesoAislamiento: (titulo: string) => `${titulo} (0 a 3)`,
  pestanas: {
    actual: 'Situación actual',
    planificacion: 'Planificación',
  },
  estadoAltura: {
    evacuacion: 'Evacuación',
    sinDato: 'Sin dato',
  },
} as const
