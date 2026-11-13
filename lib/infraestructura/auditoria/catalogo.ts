// Acciones auditadas por las rutas (conAuditoria). Cada ruta mutadora del alcance
// debe usar una de estas, con literal. Los jobs y comandos CLI componen su nombre
// (`job.<nombre>`, `dataset.<comando>`) en servidor.ts y no pasan por este catálogo.
export const ACCIONES_AUDITORIA = [
  // Partes, borradores, fotos y evidencia
  'parte.consultar', 'parte.guardar', 'parte.historial',
  'borrador.crear', 'borrador.sincronizar', 'borrador.descartar',
  'foto.autorizar_carga', 'foto.confirmar', 'foto.autorizar_lectura',
  'evidencia.crear',
  // Motivos y permisos nominales
  'motivo.guardar', 'motivo.eliminar',
  'permiso_nominal.otorgar', 'permiso_nominal.revocar',
  // Verificaciones y enlaces
  'verificacion.crear', 'verificacion.canjear_sesion', 'verificacion.validar_token',
  'verificacion.responder', 'verificacion.responder_asistida', 'verificacion.vincular_movimiento',
  'verificacion.cancelar',
  'enlace.consultar', 'enlace.crear', 'enlace.revocar', 'enlace.pdf',
  'enlace_veredicto.crear', 'enlace_veredicto.revocar',
  // ENOS, veredicto, Centro de Situación, mapa y lecturas sensibles
  'veredicto.pdf', 'situacion.exportar', 'mapa.exportar', 'contexto.consultar', 'nominal.consultar',
  // Administración de usuarios y acceso
  'usuario.crear', 'usuario.modificar', 'usuario.eliminar',
  'acceso.ingresar', 'session.login_exito', 'session.login_fallo', 'session.logout_exito', 'session.logout_fallo',
  // Cuadernillos, recursos, taxonomías, call center, idioma y miniapp de enlaces
  'cuadernillo.asignacion_guardar', 'cuadernillo.cabecera_guardar', 'cuadernillo.cuota_guardar', 'cuadernillo.stock_guardar',
  'cuadernillo.solicitud_crear', 'cuadernillo.solicitud_aprobar', 'cuadernillo.solicitud_rechazar', 'cuadernillo.solicitud_remanente',
  'recurso.crear', 'recurso.modificar', 'recurso.eliminar', 'recurso.archivo', 'recurso.explicar',
  'taxonomia.crear', 'taxonomia.modificar', 'taxonomia.eliminar',
  'call_center.llamada_crear', 'call_center.llamada_modificar', 'call_center.llamada_eliminar',
  'usuario.idioma',
  'links.contenido_crear', 'links.contenido_modificar', 'links.contenido_eliminar', 'links.sesion_iniciar', 'links.sesion_cerrar',
  // Cuentas de cuadernillos y operaciones de cuenta de better-auth no clasificadas
  'cuadernillo.membresia_otorgar', 'cuadernillo.membresia_revocar', 'cuenta.operacion',
] as const

export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number]
