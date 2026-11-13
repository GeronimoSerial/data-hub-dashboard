import type { DeepStringify } from '../tipos'
import type { parteCamposEs } from './parteCampos.es'

// Brazilian Portuguese texts of the `parteCampos` group; must mirror parteCampos.es.ts key for key.
export const parteCamposPt: DeepStringify<typeof parteCamposEs> = {
  comun: {
    describaQuePasa: 'Descreva o que acontece',
    porQueCritica: 'Por que é crítica?',
    descripcionObligatoria: 'Descrição (obrigatória)',
    descripcionOpcional: 'Descrição (opcional)',
    alumnosAfectados: 'Alunos afetados',
    revisar: 'Conferir',
    estaBienAsi: 'Está tudo bem assim',
  },
  campoVigente: {
    vaAQuedar: (valor: string) => `Vai ficar: ${valor}`,
    dejarComoEsta: 'Manter como está',
    cambiar: 'Alterar',
  },
  gravedad: {
    pregunta: 'Quão grave é?',
  },
  categoria: {
    confirmarEstablecimiento:
      'Vai marcar as seções onde a escola não pode funcionar normalmente. Se forem alunos específicos que não conseguem chegar, escolha "Inacessibilidade de alunos".',
    confirmarAlumnos:
      'Vai marcar somente os alunos que não conseguem chegar à escola. Se a situação afetar o prédio ou a escola, escolha "Afeta o estabelecimento".',
  },
  quePaso: {
    tipoSituacion: 'Qual é o tipo de situação?',
    yaInformado: 'Já informado',
    yaHayUna: 'Já existe uma situação por este mesmo motivo. Pode continuar igual.',
    motivo: 'Qual é o motivo?',
    elijaTipo: 'Escolha primeiro o tipo de situação.',
    continuar: 'Prosseguir',
    elegirOtra: 'Escolher outra',
  },
  aQuienAfecta: {
    aQuienes: 'A quem afeta?',
    seccionesAfectadas: 'Seções afetadas',
    ninguna: 'Nenhuma seção selecionada',
    una: '1 seção selecionada',
    varias: (cantidad: number) => `${cantidad} seções selecionadas`,
    seleccionadas: (secciones: number, total: number, alumnos: number, matricula: number) =>
      `Selecionadas: ${secciones} de ${total} seções · ${alumnos} de ${matricula} alunos`,
    resumen: (secciones: number, total: number, alumnos: number, matricula: number) =>
      `${secciones} de ${total} seções · ${alumnos} de ${matricula} alunos`,
    recomendacionTitulo: 'Recomendamos aumentar a gravidade',
    cambiarA: (severidad: string) => `Mudar para ${severidad}`,
    mantener: (severidad: string) => `Manter ${severidad}`,
    sugerimos: (sugerida: string, porMotivo: string) =>
      `Sugerimos ${sugerida} em vez de ${porMotivo} porque afeta a toda a escola.`,
    volver: 'Voltar',
  },
  clases: {
    hayClases: 'Há aulas?',
    comoEstaEdificio: 'Como está o prédio?',
    edificioEvacuado: 'O prédio está evacuado',
    edificioSinClases: 'O prédio está sem aulas',
    algunasSecciones: 'As aulas são suspensas somente nas seções selecionadas',
    hojaHabitualTitulo: 'O que aconteceu com as afetações ativas?',
    hojaHabitualAntes: 'Antes de constar como habitual, indique o que acontece com cada afetação ativa.',
    solucionada: 'Resolvida',
    sigueActiva: 'Continua ativa',
    alcanceInstitutoTitulo: 'Estendemos o alcance a todo o instituto?',
    alcanceEscuelaTitulo: 'Estendemos o alcance a toda a escola?',
    alcanceInstitutoConfirmar: 'Sim, todo o instituto',
    alcanceEscuelaConfirmar: 'Sim, toda a escola',
    alcanceInstitutoCuerpo: 'Isto interrompe todo o instituto, mas você marcou apenas alguns cursos.',
    alcanceEscuelaCuerpo: 'Isto interrompe toda a escola, mas você marcou apenas algumas seções.',
  },
  instituto: {
    sinConexion: 'Sem conexão: pode informar cursos completos e adicionar alunos depois.',
    errorBusqueda: 'Não foi possível buscar alunos. Tente novamente.',
    limitada: 'Muitas buscas seguidas. Aguarde alguns segundos e tente novamente.',
    sinResultados: 'Não encontramos alunos com essa busca nos cursos escolhidos.',
    truncado: 'Há mais resultados. Digite mais letras ou o DNI completo para restringir a lista.',
    dniIncompleto: 'Digite o DNI completo',
    ayudaPredeterminada: 'Escolha pelo menos um aluno de cada curso.',
    sinCarrera: 'Escolha primeiro um curso para buscar alunos.',
    buscando: 'Buscando alunos…',
    encontrados: (cantidad: number) => (cantidad === 1 ? '1 aluno encontrado' : `${cantidad} alunos encontrados`),
    buscarPlaceholder: 'Buscar por sobrenome, nome ou DNI completo',
    reintentar: 'Tentar novamente',
    ninguna: 'Nenhum curso selecionado',
    carrerasAfectadas: 'Cursos afetados',
    seleccionePlaceholder: 'Selecione um ou mais cursos',
    resumenCarreras: (cantidad: number) => (cantidad === 1 ? '1 curso' : `${cantidad} cursos selecionados`),
    alumno: 'aluno',
    alumnos: 'alunos',
    todaLaCarrera: (conteo: string) => `Curso inteiro (${conteo})`,
    alumnosDeCarrera: (elegidos: number, total: number) => `${elegidos} de ${total} alunos`,
    quitarA: (nombre: string) => `Remover ${nombre}`,
  },
}
