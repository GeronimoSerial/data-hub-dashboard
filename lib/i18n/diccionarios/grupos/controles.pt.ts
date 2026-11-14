import type { DeepStringify } from '../tipos'
import type { controlesEs } from './controles.es'

// Brazilian Portuguese texts of the `controles` group; must mirror controles.es.ts key for key.
export const controlesPt: DeepStringify<typeof controlesEs> = {
  zoom: {
    grupo: 'Zoom do mapa',
    acercar: 'Aproximar',
    alejar: 'Afastar',
    verProvincia: 'Ver província',
    verToda: 'Ver toda a província',
  },
  pantalla: {
    salir: 'Sair da tela cheia',
    entrar: 'Tela cheia',
  },
  observacion: {
    registrada: 'Observação registrada no relatório:',
  },
  buscador: {
    titulo: 'Pesquisar',
    placeholder: 'Nome ou CUE…',
    etiqueta: 'Pesquisar estabelecimento',
    sinNombre: 'Estabelecimento',
  },
  planificacion: {
    vista: 'Visão',
    titulo: 'Planejamento',
    sinPronostico: 'Ainda não há um prognóstico disponível. Consulte novamente mais tarde.',
    cargando: 'Carregando dados…',
    errorDatos: 'Não foi possível carregar os dados desta visão. Tente novamente mais tarde.',
    sinDatos: 'Ainda não há dados para esta visão.',
    prioridadEstructural: 'Prioridade de planejamento (exposição estrutural)',
    historialVacio: 'Ainda não há situações registradas para estes filtros.',
    sinPrioridad: 'Nenhuma escola com prioridade para estes filtros.',
  },
  aisladas: {
    titulo: 'Escolas isoladas',
    resumen: 'Resumo de isolamento',
    ordenar: 'Classificar por',
    escuelas: 'Escolas',
    alumnos: 'Alunos',
    lejanas: 'A mais de 30 km de uma localidade urbana',
    sinAlternativa: 'Sem caminho alternativo',
    vacio: 'Nenhuma escola isolada para estes filtros.',
    comoFunciona: 'Como funciona?',
    explicacion: 'Distância por caminho até a localidade urbana mais próxima (2.000 habitantes ou mais), segundo a rede de caminhos do OpenStreetMap.',
    verMetodologia: 'Ver metodologia',
  },
  riesgo: {
    titulo: 'Risco calculado (probabilístico)',
    calculando: 'Calculando risco…',
    error: 'Não foi possível carregar a previsão. Tente novamente mais tarde.',
    resumen: 'Resumo de risco',
    escuelas: 'Escolas em risco',
    alumnos: 'Alunos nessas escolas',
    nivel: (etiqueta: string) => `Risco ${etiqueta}`,
    vulnerabilidad: (etiqueta: string) => `Vulnerabilidade: ${etiqueta}`,
    verMas: (restantes: number) => `Ver mais (${restantes})`,
    verMenos: 'Mostrar menos',
    vacio: 'Nenhuma escola em risco para estes filtros.',
  },
}
