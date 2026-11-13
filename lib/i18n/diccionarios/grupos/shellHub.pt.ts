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
