import type { DeepStringify } from '../tipos'
import type { etiquetasEs } from './etiquetas.es'

// Brazilian Portuguese texts of the `etiquetas` group; must mirror etiquetas.es.ts key for key.
export const etiquetasPt: DeepStringify<typeof etiquetasEs> = {
  estadoClases: {
    normal: 'Funcionamento habitual',
    parcial: 'Funcionamento parcialmente interrompido',
    sin: 'Funcionamento interrompido',
    centro: 'Utilizado como centro de evacuados',
  },
  nivelRiesgo: {
    muy_alto: 'Muito alto',
    bajo: 'Baixo',
  },
  gravedad: {
    0: 'Sem situações',
    1: 'Baixa',
    2: 'Média',
  },
  apoyo: {
    brinda: 'Oferecido',
    no: 'Não oferecido',
    sin_dato: 'Sem dado',
  },
  apoyoEtiqueta: {
    sin_dato: 'Assistência pedagógica sem dado',
    no: 'Não é oferecida assistência pedagógica',
    brinda: 'É oferecida assistência pedagógica',
    virtual: 'Assistência pedagógica: aula virtual',
    cuadernillo: 'Assistência pedagógica: apostila',
    ambos: 'Assistência pedagógica: aula virtual e apostila',
  },
  instituto: {
    carreras: (cantidad: number) => `${cantidad} ${cantidad === 1 ? 'carreira' : 'carreiras'}`,
    alumnosMatriculados: (cantidad: number, numero: string) => `${numero} ${cantidad === 1 ? 'aluno matriculado' : 'alunos matriculados'}`,
  },
  nivelPlan: {
    1: 'Baixo',
    2: 'Médio',
  },
  tituloVista: {
    aisladas: 'Isolamento',
    historial: 'Vezes com situações',
  },
  basemapas: {
    osm: 'Rotas e caminhos',
    voyager: 'Mapa viário alternativo',
  },
  vecesSituaciones: (cantidad: number) => `${cantidad} ${cantidad === 1 ? 'situação' : 'situações'}`,
}
