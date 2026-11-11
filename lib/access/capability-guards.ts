import type { Capability } from './capabilities'

/**
 * Identificadores de las guardas que hacen cumplir cada capacidad en el código.
 * lib/access/route-enforcement.test.ts exige que el archivo de cada ruta (o el
 * layout que la envuelve dentro de app/(hub)) referencie al menos una de estas
 * guardas para una capacidad declarada en lib/access/route-manifest.ts.
 */
const HUB_GUARDS = [
  'requireServerHubPageAccess',
  'hubApiAccessResponse',
  'serverHubPathAllowedByPolicy',
  'serverHubPathAllowedByExistingAcl',
  'hubConfined',
] as const

export const CAPABILITY_GUARDS: Record<Capability, readonly string[]> = {
  public: [],
  authenticated: ['getSessionUser'],
  staff: ['staffGuard', 'adminPageGate', 'listUsuariosDenied', 'mutateUsuariosDenied'],
  // adminDenied: helper local a taxonomia y motivos (staffGuard + role === 'admin').
  // Pendiente de promover a guarda compartida.
  admin: ['adminPageGate', 'mutateUsuariosDenied', 'adminDenied'],
  'hub.landing': HUB_GUARDS,
  'hub.explore': HUB_GUARDS,
  'hub.section.reports': HUB_GUARDS,
  'hub.section.maps': HUB_GUARDS,
  'hub.section.dashboards': HUB_GUARDS,
  'hub.section.infrastructure': HUB_GUARDS,
  'hub.section.situation': HUB_GUARDS,
  'hub.section.cuadernillos': HUB_GUARDS,
  'hub.recursos': [...HUB_GUARDS, 'puedeVerEnSeccion', 'puedeAbrir'],
  'infra.map.read': [
    'verificarAccesoLectura',
    'crearGetMapaInfraestructura',
    'puedeLeerMapaInfraestructura',
    'puedeAbrirMapaInfraestructura',
  ],
  'infra.cargar': ['requireServerHubPageAccess'],
  'parte.access': [
    'tieneAccesoAlParte',
    'tieneAccesoAlParteParaCue',
    'decisionAccesoParteDeSesion',
    'accesoParteSesion',
    'bloqueoDeAcceso',
  ],
  'callcenter.access': ['callCenterGuard', 'callCenterPageGate'],
}

/**
 * Rutas que delegan la guarda en un módulo de lib/. El archivo de la ruta debe
 * importar ese módulo y el módulo debe referenciar la guarda indicada.
 */
export const DELEGATED_ENFORCEMENT: Record<string, { module: string; guards: readonly string[] }> = {
  'app/api/problematicas/parte/evidencia/route.ts': {
    module: '@/lib/infraestructura/adjuntos/evidencia-fotografica',
    guards: ['tieneAccesoAlParteParaCue'],
  },
}
