// Padrón oficial de departamentos de Corrientes importado de la API Georef
// Argentina. Versionado en public/data para que la comparación con
// infra_geo_profile.departamento no dependa de la red.
//
// IMPORTANTE (hallazgo N2, docs/ejecucion-enos/E3a/registro.md §1.2): este
// endpoint de Georef sólo devuelve id + nombre (centroides), nunca polígonos
// reales de departamento — verificado con `campos=completo` y por id. Por eso
// este módulo sólo versiona/valida NOMBRES; la geometría poligonal queda fuera
// de alcance (documentado para E4).

import georefDepartamentos from '@/public/data/georef-departamentos-corrientes.json'
// Implementación compartida en lib/mapas/normalizar-departamento.ts (usada
// también por lib/mapas/departamentos.ts y
// lib/infraestructura/riesgo/geo-perfil.ts). Se re-exporta acá para no tocar
// ningún import existente de este módulo.
import { normalizarNombreDepartamento } from './normalizar-departamento'
export { normalizarNombreDepartamento }

export interface DepartamentoGeoref {
  id: string
  nombre: string
}

export const GEOREF_DEPARTAMENTOS_CORRIENTES: ReadonlyArray<DepartamentoGeoref> =
  georefDepartamentos.departamentos

export interface ComparacionDepartamentos {
  /** Nombres normalizados presentes tanto en Georef como en el padrón. */
  coinciden: string[]
  /** Departamento oficial de Georef sin aparición en el padrón (p. ej. sin escuelas). */
  soloEnGeoref: string[]
  /** Nombre del padrón que no matchea ningún departamento oficial (posible typo). */
  soloEnPadron: string[]
}

// Compara los nombres de departamento del padrón (infra_geo_profile.departamento)
// contra el padrón oficial de Georef. Normaliza ambos lados antes de comparar:
// no se asume que la entrada ya venga normalizada.
export function compararDepartamentosConGeoref(
  departamentosDelPadron: string[],
): ComparacionDepartamentos {
  const georefNormalizados = new Set(
    GEOREF_DEPARTAMENTOS_CORRIENTES.map((departamento) =>
      normalizarNombreDepartamento(departamento.nombre),
    ),
  )

  const padronVistos = new Set<string>()
  const coinciden = new Set<string>()
  const soloEnPadron = new Set<string>()

  for (const departamento of departamentosDelPadron) {
    const normalizado = normalizarNombreDepartamento(departamento)
    padronVistos.add(normalizado)
    if (georefNormalizados.has(normalizado)) {
      coinciden.add(normalizado)
    } else {
      soloEnPadron.add(normalizado)
    }
  }

  const soloEnGeoref: string[] = []
  for (const normalizado of georefNormalizados) {
    if (!padronVistos.has(normalizado)) soloEnGeoref.push(normalizado)
  }

  return {
    coinciden: [...coinciden],
    soloEnGeoref,
    soloEnPadron: [...soloEnPadron],
  }
}
