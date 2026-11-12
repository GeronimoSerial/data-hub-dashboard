import { createHash } from 'node:crypto'
import type { Role } from '@/lib/acl'
import type { HubSection } from '@/lib/hub-sections'

// Cuentas QA fijas (plan de pruebas, seccion 4.2). Solo existen en la base
// efimera de la corrida: las contrasenas son de prueba y no se usan afuera.

// Contrasena derivada por corrida: MAPA_E2E_QA_SAL (fijada por run.mjs) hace
// que seed, setup y specs coincidan. Sin sal (vitest, ejecucion manual) usa 'local'.
function derivarClave(clave: ClaveCuentaQa): string {
  const sal = process.env.MAPA_E2E_QA_SAL ?? 'local'
  const digest = createHash('sha256').update(`${sal}:${clave}`).digest('base64url')
  return `${digest.slice(0, 18)}Aa9!`
}

// Nivel jurisdiccional con escuelas en el seed (id de niveles_jurisdiccionales,
// "Direccion de Nivel Secundario").
export const NIVEL_CON_ESCUELAS = 1

// CUE-anexo del establecimiento asignado a la cuenta operador (formato 7 + "-" + 2).
export const CUE_ANEXO_OPERADOR = '1800554-00'

export type ClaveCuentaQa =
  | 'admin'
  | 'admin-ge'
  | 'director-nivel'
  | 'director-sin-alcance'
  | 'consulta-infra'
  | 'consulta-sin-infra'
  | 'operador'

export type CuentaQa = {
  clave: ClaveCuentaQa
  email: string
  password: string
  nombre: string
  rol: Role
  alcance: string
  nivelesJurIds: readonly number[]
  hubSecciones: readonly HubSection[] | null
  hubLanding: boolean | null
  hubDestino: string | null
  geCueAnexo: string | null
  storageStatePath: string
}

function cuenta(
  clave: ClaveCuentaQa,
  datos: Pick<CuentaQa, 'nombre' | 'rol' | 'alcance'> &
    Partial<Pick<CuentaQa, 'nivelesJurIds' | 'hubSecciones' | 'hubLanding' | 'hubDestino' | 'geCueAnexo'>>,
): CuentaQa {
  return {
    clave,
    email: `qa-${clave}@e2e.local`,
    password: derivarClave(clave),
    nivelesJurIds: [],
    hubSecciones: null,
    hubLanding: null,
    hubDestino: null,
    geCueAnexo: null,
    ...datos,
    storageStatePath: `e2e/mapa-enos/.auth/${clave}.json`,
  }
}

export const CUENTAS_QA: readonly CuentaQa[] = [
  cuenta('admin', { nombre: 'QA Admin', rol: 'admin', alcance: 'Total' }),
  cuenta('admin-ge', { nombre: 'QA Admin GE', rol: 'admin_ge', alcance: 'Total' }),
  cuenta('director-nivel', {
    nombre: 'QA Director de nivel',
    rol: 'director_nivel',
    alcance: 'Un nivel con escuelas en el seed',
    nivelesJurIds: [NIVEL_CON_ESCUELAS],
  }),
  // Zero user_niveles_jur rows: alcanceMapa returns 'ninguno', so the map
  // denies access (lib/infraestructura/alcance-mapa.ts, lib/access/capabilities.ts).
  cuenta('director-sin-alcance', {
    nombre: 'QA Director sin alcance',
    rol: 'director_nivel',
    alcance: 'Sin niveles jurisdiccionales (acceso denegado)',
  }),
  cuenta('consulta-infra', {
    nombre: 'QA Consulta infraestructura',
    rol: 'consulta',
    alcance: 'Seccion infraestructura',
    hubSecciones: ['infrastructure'],
    hubLanding: false,
    hubDestino: '/mapas/infraestructura',
  }),
  cuenta('consulta-sin-infra', {
    nombre: 'QA Consulta sin infraestructura',
    rol: 'consulta',
    alcance: 'Sin seccion infraestructura',
    hubSecciones: ['reports'],
    hubLanding: false,
    hubDestino: '/reportes',
  }),
  cuenta('operador', {
    nombre: 'QA Operador',
    rol: 'operador_establecimiento',
    alcance: 'Una escuela',
    geCueAnexo: CUE_ANEXO_OPERADOR,
  }),
]

export function cuentaPorClave(clave: ClaveCuentaQa): CuentaQa {
  const encontrada = CUENTAS_QA.find((item) => item.clave === clave)
  if (!encontrada) throw new Error(`Cuenta QA desconocida: ${clave}`)
  return encontrada
}
