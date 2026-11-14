import type { DeepStringify } from '../tipos'
import type { parteVerificacionesEs } from './parteVerificaciones.es'

// Brazilian Portuguese texts of the `parteVerificaciones` group; must mirror parteVerificaciones.es.ts key for key.
export const parteVerificacionesPt: DeepStringify<typeof parteVerificacionesEs> = {
  responder: {
    verificando: 'Verificando o link…',
    registrandoRespuesta: 'Registrando a resposta…',
    abriendoFormulario: 'Abrindo o formulário…',
    noSePudoValidar: 'Não foi possível validar o link.',
    noSePudoRegistrar: 'Não foi possível registrar a resposta.',
    errorSinSalida: 'Se acredita que isto é um erro, entre em contato com quem lhe compartilhou o link.',
    pregunta: 'Sua escola tem atualmente alguma afetação pela situação hidrometeorológica?',
    sinAfectacion: 'Sem afetação',
    hayAfectacion: 'Há afetação',
    confirmacionSinAfectacion: 'Confirma que a escola NÃO tem afetação neste momento?',
    volver: 'Voltar',
    comprobanteTitulo: 'Resposta registrada',
    cancelada: 'Esta solicitação foi cancelada.',
    respondidaEl: (fecha: string) => `Respondida em ${fecha}`,
    notaDiscrepancia:
      "Foi registrado como 'sem afetação', mas o sistema tinha uma afetação vigente para esta escola. Um operador vai revisar esta diferença.",
    escuelaConNombre: (nombre: string, cue: string) => `${nombre} (CUE ${cue})`,
    escuelaSinNombre: (cue: string) => `Escola ${cue}`,
    resultado: {
      sinAfectacion: 'Sem afetação',
      conAfectacion: 'Com afetação',
      noDisponible: 'Indisponível',
      sinRespuesta: 'Sem resposta',
    },
  },
  cola: {
    titulo: 'Verificações',
    crear: 'Criar solicitação',
    enlaceUnaVez: 'Link público (é exibido uma única vez; copie-o agora):',
    copiarEnlace: 'Copiar link',
    enlaceCopiado: 'Link copiado.',
    sinSolicitudes: 'Ainda não há solicitações de verificação.',
    columnas: {
      acciones: 'Ações',
    },
    estados: {
      pendiente: 'Pendente',
      enlace_vencido: 'Link vencido',
      respondida_sin_afectacion: 'Sem afetação',
      respondida_con_afectacion: 'Com afetação',
      respondida_no_disponible: 'Indisponível',
    },
    discrepancia: '⚠ Discrepância: havia afetação vigente',
    confirmarCancelacion: 'Cancelar esta solicitação de verificação?',
    ocultarAsistida: 'Ocultar resposta assistida',
    registrarAsistida: 'Registrar resposta assistida',
    errorCrear: 'Não foi possível criar a solicitação.',
    errorCancelar: 'Não foi possível cancelar a solicitação.',
  },
  asistida: {
    canales: {
      telefono: 'Telefone',
      otro: 'Outro',
    },
    sinAfectacion: 'Sem afetação',
    noDisponible: 'Indisponível',
    observacion: 'Observação',
    registrar: 'Registrar resposta',
  },
  borradores: {
    titulo: 'Rascunhos não enviados',
    ariaCantidad: (cantidad: number) => `${cantidad} rascunhos não enviados`,
    aviso: 'Avanços salvos no servidor. Não fazem parte das situações confirmadas.',
    cargando: 'Carregando rascunhos…',
    error: 'Não foi possível carregar os rascunhos.',
    sinBorradores: 'Não há rascunhos pendentes para esta escola.',
    paginaSiguienteError: 'Não foi possível carregar a página seguinte.',
    cargarMas: 'Carregar mais rascunhos',
    cargandoMas: 'Carregando…',
    actualizacion: 'Atualização pendente',
    inicial: 'Relatório inicial pendente',
    progreso: 'Progresso',
    progresoResumen: (cantidad: number, paso: string) =>
      cantidad === 1
        ? `${cantidad} passo concluído · Em ${paso}`
        : `${cantidad} passos concluídos · Em ${paso}`,
    completados: 'Concluídos',
    ultimaActividad: 'Última atividade',
    respuestasPermitidas: 'Respostas permitidas',
    sinRespuesta: 'Sem resposta',
    sinRespuestas: 'Sem respostas',
  },
}
