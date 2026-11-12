import type { DeepStringify } from '../tipos'
import type { fichaHistorialEs } from './fichaHistorial.es'

// Brazilian Portuguese texts of the `fichaHistorial` group; must mirror fichaHistorial.es.ts key for key.
export const fichaHistorialPt: DeepStringify<typeof fichaHistorialEs> = {
  parte: {
    titulo: 'Histórico do parte',
    cargando: 'Buscando as movimentações do parte…',
    error: 'Não conseguimos mostrar o histórico. Verifique sua conexão e tente novamente.',
    reingresar: 'Digitar a senha novamente',
    reintentar: 'Tentar novamente',
    sinSituacion: 'Não há nenhuma situação hidrometeorológica em acompanhamento para este estabelecimento.',
    cargarSituacion: 'Registrar uma situação',
  },
  rol: {
    director: 'Diretor',
  },
  linea: {
    verAnteriores: (ocultos) => `Ver movimentações anteriores (${ocultos})`,
  },
  formato: {
    hoy: 'Hoje',
    momento: (dia, mes, hora, minuto) => `${dia} de ${mes}, ${hora}:${minuto}`,
    rigeDesde: (dia, mes, hora, minuto) => `Vigente desde o dia ${dia} de ${mes} às ${hora}:${minuto}`,
    fecha: (dia, mes) => `${dia} de ${mes}`,
  },
  evolucion: {
    cargando: 'Carregando…',
    error: {
      http: (estado) => `Não foi possível ler a evolução (HTTP ${estado})`,
      generico: 'Não foi possível ler a evolução',
    },
    pestanas: {
      serie: 'Serviço interrompido',
      acumulado: 'Alunos acumulados',
    },
    vacio: {
      serie: 'Não há escolas com serviço interrompido.',
      ranking: 'Não há escolas afetadas.',
      motivos: 'Não há afetações vigentes.',
      alumnos: 'Não há alunos alcançados.',
    },
    tabla: {
      escuelas: 'Escolas afetadas',
      alumnos: 'Alunos alcançados',
      proporcion: 'Proporção',
    },
    acumuladoNota: 'Conta cada aluno uma única vez em todo o período.',
    escuelas: (cantidad) => `${cantidad} escolas`,
    grafico: {
      serie: 'Série temporal de escolas com serviço interrompido',
      motivos: 'Distribuição de afetações vigentes por motivo',
      acumulados: 'Alunos acumulados alcançados ao longo do período',
    },
    serieEscuelas: 'Escolas com serviço interrompido',
    afectacionesVigentes: 'Afetações vigentes',
    alumnosAcumulados: 'Alunos acumulados',
  },
}
