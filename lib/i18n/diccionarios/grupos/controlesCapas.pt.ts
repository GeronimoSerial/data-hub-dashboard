import type { DeepStringify } from '../tipos'
import type { controlesCapasEs } from './controlesCapas.es'

// Brazilian Portuguese texts of the `controlesCapas` group; must mirror controlesCapas.es.ts key for key.
export const controlesCapasPt: DeepStringify<typeof controlesCapasEs> = {
  capas: 'Camadas',
  capasRadar: 'Camadas do radar (previsão)',
  capasTerritoriales: 'Camadas territoriais',
  mapaBase: 'Mapa de base',
  radar: {
    peligro: 'Perigo por clima estimado (por departamento)',
    riesgo: 'Risco previsto por escola',
    'riesgo-acceso': 'Risco previsto de chegar à escola',
  },
  accesoAislamiento: (titulo: string) => `${titulo} (0 a 3)`,
  pestanas: {
    actual: 'Situação atual',
    planificacion: 'Planejamento',
  },
  estadoAltura: {
    evacuacion: 'Evacuação',
    sinDato: 'Sem dado',
  },
}
