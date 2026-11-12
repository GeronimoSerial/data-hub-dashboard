import type { DeepStringify } from '../tipos'
import type { controlesFiltrosEs } from './controlesFiltros.es'

// Brazilian Portuguese texts of the `controlesFiltros` group; must mirror controlesFiltros.es.ts key for key.
export const controlesFiltrosPt: DeepStringify<typeof controlesFiltrosEs> = {
  filtrosChips: {
    filtrosEscuelas: 'Filtros de escolas',
    buscarEscuela: 'Buscar escola ou CUE',
    escuelasCoincidentes: 'Escolas correspondentes',
    ningunaCoincide: 'Nenhuma escola corresponde',
    masFiltros: 'Mais filtros',
    activosAria: (cantidad: number) => `, ${cantidad} ativos`,
    quitarFiltro: (etiqueta: string) => `Remover filtro ${etiqueta}`,
    elegidos: (cantidad: number) => `${cantidad} selecionados`,
    sinOpciones: 'Não há opções disponíveis.',
    limpiarFiltros: 'Limpar filtros',
    sinActualizar: 'Sem atualização',
    solucionadasRecientes: 'Resolvidas nos últimos 15 dias',
    conComedor: 'Com refeitório',
    gravedad: 'Gravidade',
    clases: 'Aulas',
    apoyo: 'Assistência pedagógica',
    direccion: 'Direção',
  },
}
