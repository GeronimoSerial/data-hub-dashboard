// Combinación de varios puertos de nivel de río de una misma región (Manaos:
// ANA + SGB). Se consultan en orden. Gana la evidencia; si ninguno la tiene, el
// primer "no disponible"; si no hay nada, null.
import type { ProveedorRio } from './proveedores-rio'
import type { EvidenciaRioNoDisponible, EvidenciaRioPrefectura, PuertoNivelRio } from './puertos'

type Resultado = EvidenciaRioPrefectura | EvidenciaRioNoDisponible | null

function esNoDisponible(resultado: Resultado): resultado is EvidenciaRioNoDisponible {
  return resultado !== null && 'disponibilidad' in resultado
}

export function combinarPuertosNivelRio(puertos: readonly PuertoNivelRio[]): PuertoNivelRio {
  return {
    async obtenerEvidencia(params) {
      let evidencia: EvidenciaRioPrefectura | null = null
      let noDisponible: EvidenciaRioNoDisponible | null = null
      for (const puerto of puertos) {
        const resultado = await puerto.obtenerEvidencia(params)
        if (resultado === null) continue
        if (esNoDisponible(resultado)) {
          noDisponible ??= resultado
        } else {
          evidencia ??= resultado
        }
      }
      return evidencia ?? noDisponible
    },
  }
}

export function combinarProveedoresRio<Deps>(proveedores: readonly ProveedorRio<Deps>[]): ProveedorRio<Deps> {
  return {
    id: proveedores.map((proveedor) => proveedor.id).join('+'),
    crearPuerto: (deps) => combinarPuertosNivelRio(proveedores.map((proveedor) => proveedor.crearPuerto(deps))),
  }
}
