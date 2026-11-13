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
  'veredicto.pdf', 'situacion.exportar', 'mapa.exportar', 'contexto.consultar',
  // Administración de usuarios y acceso
  'usuario.crear', 'usuario.modificar', 'usuario.eliminar',
  'acceso.ingresar', 'session.login_exito', 'session.login_fallo', 'session.logout_exito', 'session.logout_fallo',
] as const

export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number]
