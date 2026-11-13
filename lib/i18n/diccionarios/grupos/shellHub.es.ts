// Spanish (Corrientes) texts of the `shellHub` group. Values stay byte-for-byte as shipped.
export const shellHubEs = {
  shell: {
    producto: 'Hub de Datos',
    saltarContenido: 'Ir al contenido',
    ariaInicio: 'Hub de Datos, inicio',
    navInicio: 'Inicio',
    ariaNavegacion: 'Navegación principal',
    ariaBuscarRecursos: 'Buscar recursos',
    buscar: 'Buscar',
    ariaTemaOscuro: 'Usar tema oscuro',
    ariaTemaClaro: 'Usar tema claro',
    ariaMenuCuenta: 'Menú de cuenta',
    cuentaSinNombre: 'Cuenta',
    administracion: 'Administración',
    centroSituacion: 'Centro de Situación',
    cambiarContrasena: 'Cambiar contraseña',
    cerrarSesion: 'Cerrar sesión',
    iniciarSesion: 'Iniciar sesión',
    ariaAbrirNavegacion: 'Abrir navegación',
    ariaOcultarDetalles: 'Ocultar detalles del recurso',
    ariaMostrarDetalles: 'Mostrar detalles del recurso',
  },
  login: {
    titulo: 'Iniciar sesión',
    intro: 'Ingrese con la cuenta asignada por administración.',
    errorCredenciales: 'No se pudo iniciar sesión. Verifique el correo y la contraseña e intente nuevamente.',
    correo: 'Correo',
    contrasena: 'Contraseña',
    ingresar: 'Iniciar sesión',
  },
  meta: {
    organismo: (region: string) => `Ministerio de Educación de ${region}`,
    descripcionCorrientes:
      'Reportes, tableros y mapas del sistema educativo de la Provincia de Corrientes, publicados por el Ministerio de Educación para el análisis y la toma de decisiones.',
    descripcionSocialCorrientes:
      'Reportes, tableros y mapas del sistema educativo de la Provincia de Corrientes.',
    descripcionRegion: (region: string) =>
      `Reportes, tableros y mapas del sistema educativo de ${region}, publicados por el Ministerio de Educación para el análisis y la toma de decisiones.`,
    descripcionSocialRegion: (region: string) =>
      `Reportes, tableros y mapas del sistema educativo de ${region}.`,
  },
  escuela: {
    titulo: 'Establecimiento no disponible',
    detalle: 'No se encontró el establecimiento solicitado o no está disponible para tu alcance.',
    volverMapa: (region: string) => `Volver a ENOS ${region}`,
  },
  verificacion: {
    titulo: 'Verificación escolar',
    sinCredencial: 'Este enlace no incluye la credencial de acceso.',
  },
} as const
