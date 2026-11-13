import type { DeepStringify } from '../tipos'
import type { parteComunTextosEs } from './parteComunTextos.es'

// Brazilian Portuguese texts of the `parteComunTextos` group; must mirror parteComunTextos.es.ts key for key.
export const parteComunTextosPt: DeepStringify<typeof parteComunTextosEs> = {
  etiquetaServicio: {
    normal: 'Funcionamento habitual',
    parcial: 'Funcionamento parcialmente interrompido',
    suspendido: 'Funcionamento interrompido',
  },
  etiquetaClases: {
    normal: 'Sim, normalmente',
    suspendido: 'Não, foram suspensas',
  },
  envio: {
    'guardado-local': 'Salvo neste dispositivo',
    'pendiente-envio': 'Sem conexão. Seu parte fica salvo e é enviado sozinho quando a conexão voltar.',
    'error-servidor': 'Não conseguimos enviar. Tentaremos de novo em alguns segundos.',
    enviando: 'Enviando seus dados…',
    enviado: 'Enviado com sucesso',
    'sesion-vencida': 'A sessão expirou. Entre de novo com o link da sua escola; o que foi preenchido fica salvo.',
    error: 'Não foi possível enviar',
  },
  almacenOcupado: 'O armazenamento local está ocupado. Tente salvar de novo.',
  tiempoAgotado: 'O servidor não respondeu. Tentaremos de novo sozinhos; seu parte fica salvo.',
  categoriaAfectacion: {
    establecimiento: {
      etiqueta: 'Afeta o estabelecimento',
      descripcion: 'A escola, ou parte dela, deixa de funcionar normalmente.',
    },
    alumnos: {
      etiqueta: 'Inacessibilidade de alunos',
      descripcion: 'A escola funciona, mas há alunos que não conseguem chegar.',
    },
  },
  guardadoInstituto: 'Já consta no estado atual da sua instituição.',
  vigencia: {
    fueraDeRango: 'A data deve estar entre 12 meses atrás e o momento atual.',
    horaFutura: 'Essa hora ainda não passou. Escolha um horário anterior ao atual.',
    elijaHora: 'Escolha o horário.',
    elijaFechaYHora: 'Escolha a data e o horário.',
    hora: 'Horário',
  },
  institutoCategoria: {
    confirmar: {
      establecimiento:
        'Vai marcar os cursos em que o instituto não pode funcionar normalmente. Se forem alunos específicos que não conseguem chegar, escolha "Inacessibilidade de alunos".',
      alumnos:
        'Vai marcar apenas os alunos que não conseguem chegar ao instituto. Se a situação afetar o prédio ou o instituto, escolha "Afeta o estabelecimento".',
    },
    descripcion: {
      establecimiento: 'O instituto, ou parte dele, deixa de funcionar normalmente.',
      alumnos: 'O instituto funciona, mas há alunos que não conseguem chegar.',
    },
  },
  criterioSeveridad: {
    establecimiento: {
      Baja: 'Incomoda, mas as aulas acontecem normalmente.',
      Media: 'Condiciona as aulas: algumas turmas ou turnos funcionam pela metade.',
      Alta: 'Impede as aulas em parte do estabelecimento.',
      Crítica: 'Impede o funcionamento ou há risco para as pessoas.',
    },
    alumnos: {
      Baja: 'Chegam com atraso ou dificuldade, mas comparecem.',
      Media: 'Alguns alunos faltam alguns dias por causa do acesso.',
      Alta: 'Os alunos afetados não conseguem chegar de forma contínua.',
      Crítica: 'Chegar implica risco para os alunos (atravessar um arroio cheio, um caminho alagado).',
    },
  },
  criterioSeveridadInstituto: {
    establecimiento: {
      Baja: 'Incomoda, mas as aulas acontecem normalmente.',
      Media: 'Condiciona as aulas: alguns cursos funcionam pela metade.',
      Alta: 'Impede as aulas em parte do instituto.',
      Crítica: 'Impede o funcionamento ou há risco para as pessoas.',
    },
    alumnos: {
      Baja: 'Chegam com atraso ou dificuldade, mas comparecem.',
      Media: 'Alguns alunos faltam alguns dias por causa do acesso.',
      Alta: 'Os alunos afetados não conseguem chegar de forma contínua.',
      Crítica: 'Chegar implica risco para os alunos (atravessar um arroio cheio, um caminho alagado).',
    },
  },
  justificacionCritica: {
    mas_personas: 'Afeta mais pessoas ou turmas do que o habitual',
    riesgo_fisico: 'Há risco elétrico, estrutural ou sanitário',
    se_prolonga: 'Se prolonga no tempo ou não tem data de solução',
    combinado: 'Se combina com outra situação ativa',
    otro: 'Outro motivo',
  },
  consistencia: {
    mensajes: {
      evacuacionHabitual: 'Com uma evacuação preventiva, o prédio não pode constar como habitual.',
      evacuacionCentroEvacuados: 'Com uma evacuação preventiva, o prédio não pode constar como centro de evacuados.',
      inundacionCentroEvacuados: 'Com uma inundação, o prédio não pode constar como centro de evacuados.',
      inaccesibilidadEvacuado: 'Se os docentes não conseguem acessar, o prédio não pode constar como evacuado.',
      evacuadoClasesNormales: 'Com o prédio evacuado, as aulas não podem acontecer normalmente.',
      otroSinDescripcion: 'Descreva a situação: ao escolher "Outro", a descrição é obrigatória.',
      inundacionHabitual: 'Uma inundação costuma afetar o prédio. Verifique se ele continua constando como habitual.',
      tormentaCentroEvacuados: 'Uma tempestade severa raramente obriga a um centro de evacuados. Verifique o estado do prédio.',
      sinEnergiaEvacuado: 'Sem energia ou água, o prédio raramente fica evacuado. Verifique o estado do prédio.',
      sinEnergiaCentroEvacuados: 'Sem energia ou água, o prédio raramente se torna centro de evacuados. Verifique o estado do prédio.',
      inaccesibilidadParcial: 'Se o problema é só o acesso dos docentes, o prédio costuma estar em uso normal. Verifique o estado do prédio.',
      inaccesibilidadCentroEvacuados: 'Se os docentes não conseguem acessar, raramente o prédio é um centro de evacuados. Verifique o estado do prédio.',
      habitualClasesSuspendidas: 'O prédio consta como habitual, mas as aulas estão suspensas. Verifique as duas respostas.',
      habitualClasesSuspendidasSinEnergia: 'O prédio consta como habitual, mas as aulas estão suspensas. Se falta energia ou água em toda a escola, indique que o prédio está sem aulas.',
      sinClasesClasesNormales: 'Com o prédio sem aulas, as aulas não podem ser normais. Verifique a resposta.',
      centroClasesNormales: 'Com o prédio como centro de evacuados, é pouco provável que as aulas sejam normais. Verifique a resposta.',
      clasesNormalesConAsistencia: 'Se as aulas são normais, costuma não haver apoio pedagógico. Verifique a resposta.',
      evacuacionSeveridadBaja: 'Uma evacuação preventiva costuma ter gravidade maior que Baixa. Verifique a gravidade.',
      inundacionParcialClasesNormales: 'Com uma inundação e o prédio parcial, dificilmente as aulas serão normais. Verifique a resposta.',
      criticaSeccionUnica: 'Uma gravidade Crítica com uma só turma afetada é pouco frequente. Verifique o alcance.',
      masPersonasSeccionUnica: 'A justificativa "afeta mais pessoas" não corresponde a uma só turma. Verifique a justificativa.',
      seProlongaAhora: 'A situação "se prolonga" costuma não começar neste momento. Verifique a data de início.',
      evacuacionVigenciaAntigua: 'Uma evacuação preventiva iniciada há mais de uma semana é pouco frequente. Verifique a data de início.',
      habitualConAfectacionesActivas: 'Antes de constar como habitual, indique o que acontece com cada afetação ativa: resolvida ou segue ativa.',
      habitualConServicioSuspendido: 'O serviço segue suspenso. Para constar como habitual, indique que as aulas voltam a acontecer.',
      habitualConAfectacionActiva: 'Segue uma afetação ativa com o prédio constando como habitual. Verifique a situação.',
    },
    sugerencias: {
      usoParcial: 'Mudar para Utilização parcial',
      sinDanos: 'Mudar para Sem danos / em uso normal',
      sinClases: 'Mudar para Sem aulas',
      clasesSuspendidas: 'Mudar para Aulas suspensas',
      clasesNormales: 'Mudar para Aulas normais',
    },
  },
}
