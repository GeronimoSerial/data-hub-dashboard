import type { DeepStringify } from '../tipos'
import type { panelesMapaEs } from './panelesMapa.es'

// Brazilian Portuguese texts of the `panelesMapa` group; must mirror panelesMapa.es.ts key for key.
export const panelesMapaPt: DeepStringify<typeof panelesMapaEs> = {
  sitAriaPanel: 'Situação atual',
  sitAriaResumen: 'Resumo das escolas',
  sitSinClases: 'Escolas sem aulas',
  sitDeAbiertas: (n) => `De ${n} com situações abertas`,
  sitAlumnosSinClases: 'Alunos sem aulas',
  sitSinClasesPresenciales: 'Sem aulas presenciais',
  sitSinActualizar: 'Sem atualização',
  sitConApoyo: 'Com apoio pedagógico',
  sitSinDato: (n) => `${n} sem dado`,
  sitAfectadas: 'Escolas afetadas',
  sitAbiertas: (n) => `${n} abertas`,
  sitAriaFiltrar: 'Filtrar escolas afetadas',
  sitFiltroSinClases: 'Sem aulas',
  sitVacioFiltro: 'Nenhuma escola afetada corresponde a este filtro.',
  sitVacioAbiertas: 'Nenhuma escola com situações abertas para estes filtros.',
  sitSolucionadas: 'Resolvidas nos últimos 15 dias',
  sitSolucionadaReciente: 'Resolvida recentemente',
  sitHoy: (hora) => `Hoje ${hora}`,
  sitHoyUltimoParte: (hoy, parte) => `Hoje ${hoy} · último relatório ${parte}`,
  sitClases: {
    normal: 'Funcionamento habitual',
    parcial: 'Funcionamento parcialmente interrompido',
    sin: 'Funcionamento interrompido',
    evacuado: 'Evacuada',
    centro: 'Usada como centro de evacuados',
  },
  mapaErrorLimites: 'Não foi possível carregar os limites do mapa.',
  mapaReintentar: 'Tentar novamente',
  mapaCargando: 'Carregando dados do mapa…',
  mapaAvisoSinUbicacion: (nombre) =>
    `A escola "${nombre}" não tem localização carregada: a ficha é exibida, mas não é possível assinalá-la no mapa.`,
  mapaPronostico: 'Previsão',
  mapaVeredicto: 'Veredicto diário',
  mapaAriaVistaPrevia: 'Pré-visualização do departamento',
  mapaAriaFicha: 'Ficha da escola',
  mapaBorradores: (n) => (n === 1 ? `${n} rascunho não enviado` : `${n} rascunhos não enviados`),
}
