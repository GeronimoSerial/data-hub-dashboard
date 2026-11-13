import type { DeepStringify } from '../tipos'
import type { shellHubEs } from './shellHub.es'

// Brazilian Portuguese texts of the `shellHub` group; must mirror shellHub.es.ts key for key.
export const shellHubPt: DeepStringify<typeof shellHubEs> = {
  shell: {
    producto: 'Hub de Dados',
    saltarContenido: 'Ir ao conteúdo',
    ariaInicio: 'Hub de Datos, início',
    navInicio: 'Início',
    ariaNavegacion: 'Navegação principal',
    ariaBuscarRecursos: 'Pesquisar recursos',
    buscar: 'Pesquisar',
    ariaTemaOscuro: 'Usar tema escuro',
    ariaTemaClaro: 'Usar o tema claro',
    ariaMenuCuenta: 'Menu da conta',
    cuentaSinNombre: 'Conta',
    administracion: 'Administração',
    centroSituacion: 'Centro de Situação',
    cambiarContrasena: 'Alterar senha',
    cerrarSesion: 'Encerrar sessão',
    iniciarSesion: 'Iniciar sessão',
    ariaAbrirNavegacion: 'Abrir navegação',
    ariaOcultarDetalles: 'Ocultar detalhes do recurso',
    ariaMostrarDetalles: 'Mostrar detalhes do recurso',
  },
  login: {
    titulo: 'Iniciar sessão',
    intro: 'Entre com a conta atribuída pela administração.',
    errorCredenciales: 'Não foi possível iniciar sessão. Verifique o e-mail e a senha e tente novamente.',
    correo: 'E-mail',
    contrasena: 'Senha',
    ingresar: 'Iniciar sessão',
  },
  meta: {
    organismo: (region: string) => `Ministério de Educação de ${region}`,
    descripcionCorrientes:
      'Relatórios, painéis e mapas do sistema educacional da Província de Corrientes, publicados pelo Ministério de Educação para análise e tomada de decisões.',
    descripcionSocialCorrientes:
      'Relatórios, painéis e mapas do sistema educacional da Província de Corrientes.',
    descripcionRegion: (region: string) =>
      `Relatórios, painéis e mapas do sistema educacional de ${region}, publicados pelo Ministério de Educação para análise e tomada de decisões.`,
    tituloVeredicto: (lugar: string) => `Veredito diário de inundações — ${lugar}`,
    descripcionSocialRegion: (region: string) =>
      `Relatórios, painéis e mapas do sistema educacional de ${region}.`,
  },
  home: {
    titulo: 'Análise educacional',
    intro: 'Relatórios, painéis e mapas publicados pelas áreas responsáveis. Alguns exigem entrar com uma conta.',
    buscarEtiqueta: 'Pesquisar informações',
    buscarPlaceholder: 'Matrícula, trajetórias, ensino médio…',
    buscar: 'Pesquisar',
    recursosPublicados: 'Recursos publicados',
    temas: 'Temas',
    nivelesEducativos: 'Níveis educacionais',
    recurso: 'recurso',
    recursos: 'recursos',
    registrarTitulo: 'Registrar uma ocorrência',
    cargarParte: 'Lançar o relatório de uma escola',
    cargarParteNota: 'Busque a escola pelo código INEP e informe o que está acontecendo. Se já houver um relatório aberto, a tela leva a atualizá-lo.',
    recientes: 'Atualizações recentes',
    verCatalogo: 'Ver o catálogo',
    porTema: 'Explorar por tema',
    notaTema: 'Ver os recursos publicados sobre este tema.',
    porFormato: 'Explorar por formato',
    porNivel: 'Explorar por nível educacional',
  },
  catalogo: {
    formatos: {
      reporte: { label: 'Relatório', plural: 'Relatórios', descripcion: 'Documentos, relatórios e indicadores produzidos pelas áreas. Podem ser consultados e baixados.' },
      tablero: { label: 'Painel', plural: 'Painéis', descripcion: 'Painéis interativos de acompanhamento e monitoramento com dados atualizados.' },
      mapa: { label: 'Mapa', plural: 'Mapas', descripcion: 'Visualizações territoriais e georreferenciadas do sistema educacional.' },
    },
    requiereIngreso: 'Exige login',
    restringido: 'Restrito',
    accesoRestringido: 'Acesso restrito',
  },
  escuela: {
    titulo: 'Estabelecimento indisponível',
    detalle: 'Não foi encontrado o estabelecimento solicitado ou ele não está disponível para o seu alcance.',
    volverMapa: (region: string) => `Voltar a ENOS ${region}`,
  },
  verificacion: {
    titulo: 'Verificação escolar',
    sinCredencial: 'Este link não inclui a credencial de acesso.',
  },
}
