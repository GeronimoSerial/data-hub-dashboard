import type { Semaforo } from '@/lib/sobreoferta'
import type { Diccionario } from './tipos'

// Brazilian Portuguese dictionary for the Manaos (Amazonas) audience. It must
// mirror es.ts key for key: the Diccionario type makes a missing key a compile error.
export const pt: Diccionario = {
  didactica: {
    title: {
      description:
        'Estabelecimentos e zonas de ~20 km. Clicar mostra a matrícula; em Camadas é possível ativar o Excesso de oferta escolar (demanda vs prédios).',
    },

    legend: {
      evolutionTitle: 'Evolução da matrícula 2023-2026',
      evolutionHint:
        'As cores mostram como a matrícula mudou nas escolas com série completa.',
      comparableLabel: 'Escolas com série completa 2023–2026',
      enrollment2023: 'Matrícula 2023',
      enrollment2026: 'Matrícula 2026',
      variation: 'Variação',
      sobreofertaTitle: 'Excesso de oferta escolar',
      sobreofertaPurpose:
        'Aponta candidatas a revisão (demanda vs prédios). Não decide fechamentos nem fusões.',
      noSobreofertaData: 'Sem dados de excesso de oferta',
      tips: [
        'Os nascidos chegam à pré-escola de 4 anos cerca de 4 anos depois: uma queda da natalidade antecipa menos matrícula neste e nos próximos ciclos.',
        'Nascidos vivos = local de registro (maternidade), nem sempre onde a família mora.',
        '“Natalidade em queda” = pior que a mediana de Corrientes, não qualquer valor negativo.',
      ],
    },

    layers: {
      sobreofertaTip:
        'Observa a demanda atual e futura vs prédios. Não implica fechamentos.',
    },

    popup: {
      enrollmentSection: 'Matrícula',
      enrollmentHint: 'Como mudou a quantidade de alunos',
      costsSection: 'Custos',
      costsHint: 'Salários mensais estimados (indicativo)',
      demandSection: 'Demanda vs prédios',
      demandHint:
        'Os nascidos chegam à pré-escola de 4 anos cerca de 4 anos depois. Se nasceram menos, a matrícula deste e dos próximos ciclos tende a diminuir.',
      signalFuture: 'Demanda futura (natalidade → pré-escola de 4 anos)',
      signalToday: 'Demanda atual (alunos por prédio)',
      contextExtra: 'Contexto adicional',
      tasaAsistencia4: 'Frequência estimada na pré-escola de 4 anos',
      icseQuintil: 'Contexto social ICSE (1 melhor … 5 mais vulnerável)',
      semaforo: 'Leitura',
      cue: 'CUE-Anexo',
      locality: 'Localidade',
      department: 'Departamento',
      zone: 'Zona',
      deptShare: 'A zona abrange vários departamentos (peso pelos prédios)',
      apiSection: 'Matrícula real (API GE)',
      apiHint: 'Início → fim do ano letivo, por ano',
      zoneAllSchools: 'Matrícula de todas as escolas',
      zoneCompleteHistory: 'Somente escolas com histórico completo',
      zoneCompleteCount: 'Com histórico completo',
      diameter: 'Diâmetro',
      establishments: 'Estabelecimentos',
      absChange: 'Variação absoluta 2023–2026',
      pctChange: 'Variação percentual 2023–2026',
      trend: 'Tendência',
      monthlySalary: 'Custo mensal com salários',
      monthlySavings: 'Economia mensal estimada se a oferta fosse revisada',
      upDownFlat: 'Aumentaram / diminuíram / sem alteração',
      sobreedad: 'Sobreidade',
      repitencia: 'Repetência',
      byOffer: 'Por oferta',
      byTurn: 'Por turno',
    },

    semaforoGlosa: {
      rojo: 'Candidata a revisão se sobrarem prédios: pouca matrícula hoje e natalidade em queda relativa.',
      amarillo:
        'Vale observar: a natalidade já cai mais que a média; a relação atual ainda não parece tão fraca.',
      verde:
        'Sem os dois sinais juntos de pressão para baixo; não priorizar revisão por excesso de oferta.',
    } satisfies Record<Semaforo, string>,
  },

  selectorIdioma: {
    label: 'Idioma da interface',
  },
  didacticaTextos: {
    cambio: {
      sinCambio: 'sem variação',
      bajo: (porcentaje) => `caiu ${porcentaje}%`,
      subio: (porcentaje) => `subiu ${porcentaje}%`,
    },
    demandaFutura: {
      dato: (cambio, mediana) =>
        `Nascidos 2014→2023: ${cambio} (mediana da província: ${mediana}).`,
      sinDato: 'SEM DADO DE NATALIDADE PARA PROJETAR A COORTE ESCOLAR.',
      enCaida: {
        lead: 'Essas crianças já entram ou vão entrar na pré-escola de 4 anos (cerca de 4 anos após o nascimento): ',
        emphasis:
          'ESPERA-SE QUE A MATRÍCULA DESTE E DOS PRÓXIMOS CICLOS TENDA A DIMINUIR, MAIS DO QUE NA MÉDIA DA PROVÍNCIA.',
      },
      menorModerada: {
        lead: 'Nasceram menos crianças que em 2014, mas a queda não é pior que a mediana provincial: ',
        emphasis:
          'A PRESSÃO DE BAIXA SOBRE A PRÉ-ESCOLA DE 4 ANOS E OS CICLOS SEGUINTES É MAIS MODERADA QUE NA MÉDIA DA PROVÍNCIA.',
      },
      sinContraccion: {
        lead: 'A natalidade não mostra contração relativa: ',
        emphasis:
          'POR ESTE INDICADOR NÃO SE ANTECIPA UMA QUEDA EXTRA DE MATRÍCULA POR COORTE NA PRÉ-ESCOLA DE 4 ANOS.',
      },
    },
    demandaActual: {
      dato: (alunos, mediana) =>
        `${alunos} alunos por prédio (mediana da província: ${mediana}).`,
      sinDato: 'Sem dado de alunos por prédio.',
      bajoDemanda:
        'Hoje já há poucos alunos por prédio em relação ao restante da província.',
      noBajoDemanda:
        'Hoje a relação de alunos por prédio não está abaixo da mediana provincial.',
    },
  },

  // Map tabs and modes (the tab bar above the map).
  modos: {
    ariaBarra: 'Modos e visualizações de ENOS Corrientes',
    cargandoMapa: 'Carregando mapa…',
    situacionActual: 'Situação atual',
    situacionActualAria: (cantidad) =>
      `Situação atual, ${cantidad} ${cantidad === 1 ? 'escola' : 'escolas'} com situações abertas`,
    radar: 'Radar de risco',
    planificacion: 'Planejamento',
    capas: 'Camadas',
    estadisticas: 'Estatísticas',
    exportar: 'Exportação',
    callCenter: 'Central de chamadas',
    cuadernillos: 'Cadernos',
  },

  // Layers panel (Capas) and the territorial legend of the map.
  capas: {
    ariaPanel: 'Camadas',
    situacionActual: 'Situação atual',
    mapaBase: 'Mapa de base',
    referencias: 'Referências',
    riesgo: 'Risco',
    estacionesRio: 'Estações da Prefectura (altura dos rios)',
    lluviaObservada: 'Chuva observada (satélite IMERG)',
    ventanaLluvia: 'Janela de chuva observada',
    limitesDepartamentos: 'Limites dos departamentos',
    nombresDepartamentos: 'Nomes dos departamentos',
    rutaAcceso: 'Rota de acesso da escola selecionada',
    crucesAgua: 'Travessias de água da rota',
    escuelasEnRiesgo: 'Escolas em risco hoje (moderado ou mais)',
    escuelasAisladas: 'Escolas isoladas',
    seleccionarEscuela: 'Aparece ao selecionar uma escola.',
    datosTerritorialesNo: 'Os dados territoriais não estão disponíveis.',
    escalaRiesgo: 'Escala de risco',
    accesos: {
      ariaDatos: 'Dados territoriais',
      cargando: 'Carregando camadas territoriais…',
      sinDatosCaminos: 'Sem dados de caminhos carregados.',
      sinCobertura: 'Sem dado (escola fora dos dados): ',
    },
  },
  // Map legend (Referências do mapa): sections, scales and notes.
  leyenda: {
    ariaReferencias: 'Referências do mapa',
    situacionActual: 'Situação atual',
    estacionesPrefectura: 'Estações da Prefeitura',
    estacionesNota:
      'Uma leitura de mais de 18 h mantém o último nível; a sua antiguidade está na ficha da estação.',
    alturaRio: {
      evacuacion: 'Evacuação',
      alerta: 'Nível de alerta',
      normal: 'Nível normal',
      sinDato: 'Sem dado',
    },
    lluviaObservada: (horas: number) => `Chuva observada ${horas} h`,
    lluviaActualizada: (fecha: string) => `Atualizado ${fecha}`,
    lluviaSinFecha: 'Sem data de atualização',
    lluviaNota: (parciales: number) =>
      `Estimativa por satélite (NASA IMERG), não medição no solo.${parciales > 0 ? ` ${parciales} células com janela incompleta.` : ''} Clique no mapa para ver o valor.`,
    riesgoHoy: 'Escolas em risco hoje',
    riesgoActual: (horizonte: string) => `Risco atual (hoje) · ${horizonte}`,
    riesgoActualNota:
      'As demais escolas aparecem como pontos cinza suaves ao aproximar o mapa (zoom 9 ou mais); com um clique abre-se a sua ficha.',
    gravedadPrioridad: 'Gravidade / prioridade',
    riesgoGravedad: 'Risco / gravidade',
    simbolos: 'Ícones',
    gravedadActual:
      'A cor indica a gravidade do estabelecimento ou a prioridade calculada de inacessibilidade dos alunos, conforme a situação principal.',
    prioridadAlumnos:
      'A prioridade de alunos combina a porcentagem da matrícula afetada e a quantidade de alunos. Sem matrícula ou seleção vigente, não se atribui um nível.',
    sinSituaciones: 'Sem situações',
    sinActualizar: 'Sem atualização',
    solucionadaRecientemente: 'Resolvida recentemente',
  },

  // School ficha (header, tabs, situations) and the school preview card.
  ficha: {
    volverAlMapa: 'Voltar ao mapa',
    irAlMapa: 'Ir ao mapa',
    navegacionSuperior: 'Navegação superior',
    detalleEstablecimiento: 'Detalhe do estabelecimento',
    seccionesFicha: 'Seções da ficha',
    matriculados: (cantidad: string, etiquetaAlumnos: string) => `${cantidad} ${etiquetaAlumnos} matriculados`,
    sinUbicacion: 'Localização não disponível no mapa',
    actualizarParte: 'Atualizar o registro',
    cargarSituacion: 'Registrar uma situação',
    pestanas: {
      panorama: 'Visão geral',
      situaciones: 'Situações',
      situacionesConteo: (cantidad: number) => `Situações (${cantidad})`,
      territorio: 'Território e clima',
      historial: 'Histórico',
    },
    situacionesSeccion: 'Situações',
    cargandoSituaciones: 'Carregando situações do registro…',
    errorSituaciones: 'Não foi possível carregar as informações operacionais da escola.',
    justificacionGravedad: 'Justificativa de gravidade:',
    vistaPrevia: {
      cerrar: 'Fechar pré-visualização',
      prioridad: 'Prioridade',
      gravedad: 'Gravidade',
      cargandoSituacion: 'Carregando situação…',
      situacionActiva: 'Situação ativa',
      situacionReportada: 'Situação informada',
      situacionesAbiertas: (cantidad: number) =>
        `${cantidad} ${cantidad === 1 ? 'situação aberta' : 'situações abertas'}`,
      desde: (fecha: string) => `desde ${fecha}`,
      sinSituacionesAbiertas: 'Nenhuma situação aberta informada',
      sinReporte: 'Sem registro ativo (a ausência de registro não confirma normalidade)',
      alumnosAfectados: (cantidad: number) => (cantidad === 1 ? 'aluno afetado' : 'alunos afetados'),
      proporcionAfectada: (porcentaje: number) => `${porcentaje}% da matrícula afetada`,
      contextoImpacto: (porcentaje: number, matricula: string, unico: boolean) =>
        `${porcentaje}% de ${matricula} ${unico ? 'aluno' : 'alunos'} da escola`,
      funcionamiento: 'Operação',
      seccionesAfectadas: 'Turmas afetadas',
      clases: 'Aulas',
      sinClases: (cantidad: string) => `${cantidad} sem aulas`,
      asistencia: 'Assistência',
      edificio: 'Prédio',
      ultimoParte: 'Último registro',
      sinActualizar: 'Sem atualização (>72 h)',
      vigente: 'Em vigor',
      comedor: 'Refeitório',
      evacuacion: 'Evacuação',
      aislamiento: 'Isolamento',
      hastaLocalidad: 'Até a localidade',
      porCamino: 'por estrada',
      antecedentes: 'Histórico de ocorrências',
      sinHistoricas: 'Sem ocorrências históricas',
      situacionesHistoricas: (cantidad: string, unica: boolean) =>
        `${cantidad} ${unica ? 'ocorrência histórica' : 'ocorrências históricas'}`,
      solucionadas: (cantidad: string) => `${cantidad} resolvida(s) em 15 dias`,
      abrirFichaCompleta: 'Ver ficha completa',
      quitarSeleccion: 'Remover seleção',
    },
  },
}
