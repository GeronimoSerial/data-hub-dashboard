import type { DeepStringify } from '../tipos'
import type { radarRestoEs } from './radarResto.es'

// Brazilian Portuguese texts of the `radarResto` group; must mirror radarResto.es.ts key for key.
export const radarRestoPt: DeepStringify<typeof radarRestoEs> = {
  pronostico: {
    cargando: 'Carregando previsão…',
    reintentar: 'Tentar a previsão novamente',
    error: 'Não foi possível carregar a previsão. Tente novamente mais tarde.',
    vacio: 'Ainda não há previsão disponível. Consulte novamente mais tarde.',
    actualizado: (antiguedad: string) => `Atualizado ${antiguedad}`,
  },
  escuela: {
    aria: (nombre: string, cue: string) => `Previsão de ${nombre}, CUE ${cue}`,
    titulo: (nombre: string) => `${nombre} · abrir previsão`,
  },
  linea: {
    retroceder: 'Voltar um quadro',
    avanzar: 'Avançar um quadro',
    reproducir: 'Reproduzir',
    paso: 'Passo',
    cuadro: 'Quadro da previsão',
  },
  horizonte: {
    sinDatos: 'Sem dados para este horizonte',
  },
  panel: {
    variable: 'Variável meteorológica',
    lluvia: 'Chuva (mm)',
    probabilidad: 'Chuva (prob)',
  },
  lluvia: {
    titulo: 'Chuva observada',
    acumulado: (horas: number) => `Acumulado das últimas ${horas} h`,
    masDe150: '150 mm ou mais',
    satelite: (cobertura: number) => `Faltam passagens do satélite nesta janela (${cobertura} % coberto): a chuva real pode ser maior.`,
    bajaConfianza: 'Estimativa de satélite de baixa confiança: pode ser causada por nebulosidade ou umidade, não necessariamente chuva.',
    constelacion: 'Constelação de satélites NASA · JAXA',
  },
}
