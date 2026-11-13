import type { DeepStringify } from '../tipos'
import type { fichaPanoramaEs } from './fichaPanorama.es'

// Brazilian Portuguese texts of the `fichaPanorama` group; must mirror fichaPanorama.es.ts key for key.
export const fichaPanoramaPt: DeepStringify<typeof fichaPanoramaEs> = {
  afectacion: {
    verCarreras: 'Ver cursos atingidos',
    verAlumnos: 'Ver alunos atingidos',
    todaLaCarrera: ' (todo o curso)',
    alumnosDeCarrera: (cantidad: number) => ` (${cantidad === 1 ? '1 aluno' : `${cantidad} alunos`})`,
  },
  alcance: {
    secciones: (cantidad: number) => (cantidad === 1 ? '1 seção' : `${cantidad} seções`),
    alumnos: (cantidad: number) => (cantidad === 1 ? '1 aluno' : `${cantidad} alunos`),
    sinSecciones: 'Sem seções nem alunos informados',
  },
  impacto: {
    sinDatos: 'Sem dados para calcular a prioridade',
  },
  severidad: {
    gravedad: (nombre: string) => `Gravidade ${nombre}`,
    sugerido: 'Sugerida',
    actual: 'Atual',
    nombres: { Baja: 'Baixa', Media: 'Média' },
  },
  vigencia: {
    ahora: 'Agora',
    hoy: 'Hoje, mais cedo',
    otro: 'Outro dia',
    fecha: 'Data',
  },
  parte: {
    buscando: 'Buscando o estado atual do estabelecimento…',
    reintentar: 'Tentar novamente',
    volverContrasena: 'Digitar a senha novamente',
    funcionamiento: 'Funcionamento',
    clases: 'Aulas',
    edificio: 'Prédio',
    rigeDesde: (fecha: string) => `Vigente desde ${fecha}`,
    enSeguimiento: 'Em acompanhamento',
    cargarSituacion: 'Registrar uma situação',
    actualizarParte: 'Atualizar o relatório',
    verHistorial: 'Ver histórico',
    historial: 'Histórico',
    ultimaActualizacion: (fecha: string) => `Última atualização: ${fecha}`,
    sinSituacion: 'Não há uma situação hidrometeorológica em acompanhamento para este estabelecimento.',
    errorLectura: 'Não foi possível mostrar o estado atual do estabelecimento. Tente novamente.',
    accesoVencido: 'Seu acesso não está mais válido. Digite a senha novamente para ver o estado atual.',
    sinCorte: 'Não há dados das escolas disponíveis neste momento. Tente novamente mais tarde.',
  },
  establecimiento: {
    habitual: 'Sem danos / em uso normal',
    parcial: 'Utilização parcial',
    evacuado: 'Evacuada',
    centro_evacuados: 'Usado como abrigo de evacuados',
    sin_clases: 'Sem aulas',
  },
  riesgo: {
    region: 'Risco da escola',
    titulo: 'Risco por clima',
    horizonte: (etiqueta: string) => `Próximas ${etiqueta}`,
    explicacion:
      'Estimativa automática com a previsão de chuva e a altura dos rios. Indica o que poderia acontecer, não o que a escola já informou.',
    cargando: 'Carregando risco atual…',
    error: 'Não foi possível carregar o risco atual.',
    nivelEstimado: 'Nível estimado',
    situacionActual: 'Situação atual',
    zonaExpuesta: 'Área exposta a cheias',
    detalleTecnico: 'Ver detalhe técnico',
    planificacionTitulo: 'Prioridade para obras e prevenção',
    planificacionExplicacion:
      'Quão exposta está a escola por sua localização e seus antecedentes. Depende da localização e dos antecedentes, não do clima de hoje: serve para planejar.',
    ayudaVista: {
      Aislamiento: 'Se um corte de estrada pode deixá-la sem acesso',
      'Exposición a inundación': 'Proximidade de rios e áreas que alagam',
      'Veces con situaciones': 'Situações registradas em ciclos anteriores',
    },
  },
  pronostico: {
    cargando: 'Carregando previsão…',
    error: 'Não foi possível carregar a previsão',
    proximas24: 'Nas próximas 24 horas',
    sinDatos: 'Sem dados',
    sinLluvia: 'Sem chuva',
    hoy: 'Hoje',
    manana: 'Amanhã',
    masHoras: (horas: number) => `+${horas} h`,
  },
}
