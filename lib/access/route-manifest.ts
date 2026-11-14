import type { Capability } from './capabilities'

// Links has its own session; this inventory-only label is not granted to hub roles.
export type RouteCapability = Capability | 'links.admin'

/**
 * Capacidad que exige cada página (page.tsx) y API (route.ts) de app/.
 * Clave: ruta del archivo relativa a la raíz del repo. Un array significa
 * "cualquiera de". La cobertura la vigila lib/access/route-manifest.test.ts:
 * toda ruta nueva debe declararse acá.
 *
 * Esta tabla documenta la intención actual de cada guarda. Las rutas con
 * `TODO(T3)` mezclan guardas o tienen un método más restrictivo que el
 * declarado; T3 las lleva a capacidades exactas.
 * Que la ruta referencie su guarda lo verifica lib/access/route-enforcement.test.ts.
 */
export const ROUTE_MANIFEST: Record<string, RouteCapability | readonly RouteCapability[]> = {
  // --- Pages (app/(hub)) ---
  'app/(hub)/page.tsx': 'hub.landing',
  'app/(hub)/explorar/page.tsx': 'hub.explore',
  'app/(hub)/reportes/page.tsx': 'hub.section.reports',
  'app/(hub)/mapas/page.tsx': 'hub.section.maps',
  'app/(hub)/mapas/matricula/page.tsx': 'hub.recursos',
  'app/(hub)/mapas/natalidad/page.tsx': 'hub.recursos',
  'app/(hub)/mapas/reorganizacion/page.tsx': 'hub.recursos',
  'app/(hub)/mapas/infraestructura/page.tsx': 'infra.map.read',
  'app/(hub)/mapas/infraestructura/escuelas/[cue]/page.tsx': 'infra.map.read',
  'app/(hub)/tableros/page.tsx': 'hub.section.dashboards',
  'app/(hub)/cuadernillos/page.tsx': 'hub.section.cuadernillos',
  // Also reachable by operador_establecimiento with a CUE: lib/access/hub-confinement.ts opens this exact path for that role only (parte.access alone is also held by director_nivel).
  'app/(hub)/cuadernillos/recepcion/page.tsx': ['hub.section.cuadernillos', 'parte.access'],
  'app/(hub)/recursos/[id]/page.tsx': 'hub.recursos',
  // Gated by adminPageGate (staff); the section capability hub.section.situation does not enforce it.
  'app/(hub)/situacion/page.tsx': 'staff',
  'app/(hub)/infraestructura/cargar/page.tsx': 'infra.cargar',
  'app/(hub)/admin/page.tsx': 'staff',
  'app/(hub)/admin/[seccion]/page.tsx': 'staff',
  'app/(hub)/admin/operacion/page.tsx': 'staff',
  'app/(hub)/admin/riesgo/page.tsx': 'staff',
  'app/(hub)/admin/riesgo/[snapshotId]/page.tsx': 'staff',
  'app/(hub)/admin/episodios-derivados/page.tsx': 'staff',
  'app/(hub)/admin/episodios-derivados/[id]/page.tsx': 'staff',
  'app/(hub)/admin/verificaciones/page.tsx': 'staff',
  'app/(hub)/admin/auditoria/page.tsx': 'admin',
  'app/(hub)/call-center/page.tsx': 'callcenter.access',

  // --- Pages (otras) ---
  'app/(landing)/materiales/page.tsx': 'public',
  'app/(mockups)/intranet/page.tsx': 'public',
  'app/(publico)/login/page.tsx': 'public',
  'app/(publico)/login/continue/page.tsx': 'public',
  'app/(publico)/forbidden/page.tsx': 'public',
  'app/(publico)/cuenta/page.tsx': 'authenticated',
  'app/(publico)/veredicto/compartido/[token]/page.tsx': 'public',
  'app/problematicas/parte/page.tsx': 'parte.access',
  'app/problematicas/parte/actualizar/page.tsx': 'parte.access',
  'app/problematicas/parte/historial/page.tsx': 'parte.access',
  'app/problematicas/parte/nuevo/page.tsx': 'parte.access',
  // Cáscara estática sin datos: los datos del parte los lee el cliente de IndexedDB y sus APIs exigen parte.access.
  'app/problematicas/parte/offline/page.tsx': 'public',
  // Pública a propósito: el enlace con PIN/token es la credencial.
  'app/problematicas/verificaciones/[id]/page.tsx': 'public',

  // Links login is public; the admin page exposes its editor only after esAdmin.
  'app/(miniapps)/(links)/links/page.tsx': 'public',
  'app/(miniapps)/(links)/links/admin/page.tsx': 'links.admin',
  'app/(miniapps)/(links)/links/api/sesion/route.ts': 'public',
  'app/(miniapps)/(links)/links/api/contenido/route.ts': 'links.admin',

  // --- API: auth, gate, hub, recursos ---
  'app/api/health/route.ts': 'public',
  'app/api/mapas/reorganizacion/datos/route.ts': 'hub.recursos',
  'app/api/mapas/reorganizacion/ruta/route.ts': 'hub.recursos',
  'app/api/mapas/infraestructura/accesos/[cueAnexo]/centro-evacuados/route.ts': 'infra.map.read',
  'app/api/auth/[...all]/route.ts': 'public',
  'app/api/auth/ge-login/route.ts': 'public',
  'app/auth/ge-callback/route.ts': 'public',
  'app/api/gate/[...path]/route.ts': 'hub.recursos',
  'app/api/hub/route.ts': 'hub.explore',
  'app/api/cuadernillos/assignments/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/overview/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/schools/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/cabeceras/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/memberships/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/memberships/[id]/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/quotas/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/recommendations/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/requests/[id]/approve/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/requests/[id]/reject/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/requests/[id]/remainder/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/requests/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/stock/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/remitos/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/remitos/[id]/observaciones/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/remitos/[id]/recibir/route.ts': 'hub.section.cuadernillos',
  'app/api/cuadernillos/control/route.ts': 'hub.section.cuadernillos',
  // Also reachable by operador_establecimiento with a CUE: lib/access/hub-confinement.ts opens these exact paths for that role only (parte.access alone is also held by director_nivel).
  'app/api/cuadernillos/recepciones/route.ts': ['hub.section.cuadernillos', 'parte.access'],
  'app/api/cuadernillos/remito-lineas/[id]/recibir/route.ts': ['hub.section.cuadernillos', 'parte.access'],
  'app/api/hub/admin/route.ts': 'staff',
  // TODO(T3): archivo GET uses the resource ACL; POST requires staff.
  'app/api/recursos/[id]/archivo/route.ts': ['hub.recursos', 'staff'],
  'app/api/recursos/[id]/explain/route.ts': 'hub.recursos',
  'app/api/recursos/[id]/route.ts': 'staff',
  'app/api/recursos/route.ts': 'staff',
  'app/api/taxonomia/[kind]/route.ts': 'admin',
  'app/api/infraestructura/auditoria/route.ts': 'admin',
  'app/api/usuario/idioma/route.ts': 'authenticated',
  // TODO(T3): GET requires staff (listUsuariosDenied); PUT/DELETE require admin.
  'app/api/usuarios/[id]/route.ts': 'staff',
  // TODO(T3): write path requires admin (mutateUsuariosDenied).
  'app/api/usuarios/route.ts': 'staff',
  // TODO(T3): confirm the read scope of opciones; write path uses mutateUsuariosDenied.
  'app/api/usuarios/opciones/route.ts': 'staff',
  'app/api/veredicto/compartido/[token]/pdf/route.ts': 'public',

  // --- API: materiales ---
  'app/api/materiales/[id]/descargar/route.ts': 'public',
  'app/api/materiales/[id]/video/route.ts': 'public',

  // --- API: call center ---
  'app/api/call-center/escuelas/route.ts': 'callcenter.access',
  'app/api/call-center/llamadas/route.ts': 'callcenter.access',

  // --- API: problematicas (parte) ---
  'app/api/problematicas/acceso/route.ts': 'public',
  'app/api/problematicas/contexto/route.ts': 'parte.access',
  'app/api/problematicas/parte/route.ts': 'parte.access',
  'app/api/problematicas/parte/historial/route.ts': 'parte.access',
  'app/api/problematicas/parte/matricula/route.ts': 'parte.access',
  'app/api/problematicas/parte/borradores/route.ts': 'parte.access',
  'app/api/problematicas/parte/borradores/config/route.ts': 'public',
  'app/api/problematicas/parte/borradores/[draftId]/route.ts': 'parte.access',
  'app/api/problematicas/parte/borradores/[draftId]/descarte/route.ts': 'parte.access',
  'app/api/problematicas/parte/adjuntos/autorizaciones/route.ts': 'parte.access',
  'app/api/problematicas/parte/adjuntos/[attachmentId]/confirmacion/route.ts': 'parte.access',
  // Guarda delegada: crearEvidenciaFotografica llama tieneAccesoAlParteParaCue (ver DELEGATED_ENFORCEMENT).
  'app/api/problematicas/parte/evidencia/route.ts': 'parte.access',
  // Credencial por enlace (token/PIN), sin sesión de parte.
  'app/api/problematicas/verificaciones/[id]/canjear-sesion/route.ts': 'public',
  'app/api/problematicas/verificaciones/[id]/responder/route.ts': 'public',
  'app/api/problematicas/verificaciones/[id]/validar-token/route.ts': 'public',
  'app/api/problematicas/verificaciones/[id]/vincular-movimiento/route.ts': 'public',

  // --- API: infraestructura (staff) ---
  // TODO(T3): reads with verificarAccesoLectura and also requires staffGuard.
  'app/api/infraestructura/accesos/[cueAnexo]/route.ts': 'staff',
  'app/api/infraestructura/motivos/route.ts': 'staff',
  'app/api/infraestructura/nominal/permisos/route.ts': 'staff',
  'app/api/infraestructura/operacion/salud/route.ts': 'staff',
  'app/api/infraestructura/situacion/route.ts': 'staff',
  'app/api/infraestructura/situacion/cambios/route.ts': 'staff',
  'app/api/infraestructura/situacion/export/route.ts': 'staff',
  'app/api/infraestructura/situacion/latidos/route.ts': 'staff',
  'app/api/infraestructura/situacion/escuelas/route.ts': 'staff',
  'app/api/infraestructura/tendencia-estacional/route.ts': 'staff',
  'app/api/infraestructura/veredictos/route.ts': 'staff',
  'app/api/infraestructura/veredictos/enlaces/route.ts': 'staff',
  'app/api/infraestructura/veredictos/eventos/route.ts': 'staff',
  'app/api/infraestructura/veredictos/historial/route.ts': 'staff',
  'app/api/infraestructura/veredictos/pdf/route.ts': 'staff',
  'app/api/infraestructura/verificaciones/route.ts': 'staff',
  'app/api/infraestructura/verificaciones/[id]/cancelar/route.ts': 'staff',
  'app/api/infraestructura/verificaciones/[id]/responder-asistida/route.ts': 'staff',

  // --- API: infraestructura (lectura del mapa) ---
  'app/api/infraestructura/adjuntos/route.ts': 'infra.map.read',
  'app/api/infraestructura/borradores/conteos/route.ts': 'infra.map.read',
  'app/api/infraestructura/borradores/[cueAnexo]/route.ts': 'infra.map.read',
  'app/api/infraestructura/episodios-derivados/route.ts': 'infra.map.read',
  'app/api/infraestructura/episodios-derivados/[id]/route.ts': 'infra.map.read',
  'app/api/infraestructura/exportar/route.ts': 'infra.map.read',
  'app/api/infraestructura/fuentes/route.ts': 'infra.map.read',
  'app/api/infraestructura/geo-perfiles/[cueAnexo]/route.ts': 'infra.map.read',
  'app/api/infraestructura/hidrometria/estado/route.ts': 'infra.map.read',
  'app/api/infraestructura/hidrometria/estaciones/route.ts': 'infra.map.read',
  'app/api/infraestructura/hidrometria/estaciones/[id]/lecturas/route.ts': 'infra.map.read',
  'app/api/infraestructura/peligro/route.ts': 'infra.map.read',
  'app/api/infraestructura/peligro/observado-grilla/route.ts': 'infra.map.read',
  'app/api/infraestructura/radar/route.ts': 'infra.map.read',
  'app/api/infraestructura/radar-meteo/route.ts': 'infra.map.read',
  'app/api/infraestructura/radar-meteo/alertas/route.ts': 'infra.map.read',
  'app/api/infraestructura/radar-meteo/resumen/route.ts': 'infra.map.read',
  'app/api/infraestructura/radar-meteo/escuela/[cueAnexo]/route.ts': 'infra.map.read',
  'app/api/infraestructura/riesgo/route.ts': 'infra.map.read',
  'app/api/infraestructura/riesgo/[snapshotId]/route.ts': 'infra.map.read',
  'app/api/infraestructura/riesgo/escuela/[cueAnexo]/route.ts': 'infra.map.read',

  // --- API: mapas de infraestructura (lo que consumen las páginas del mapa y la carga) ---
  'app/api/mapas/infraestructura/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/escuelas/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/totales/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/evolucion/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/historial/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/nominal/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/parte/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/referencias/eventos/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/territorio/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/datasets/[dataset]/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/accesos/[cueAnexo]/geometria/route.ts': 'infra.map.read',
  'app/api/mapas/infraestructura/accesos/[cueAnexo]/exposicion-inundacion/route.ts': 'infra.map.read',
}
