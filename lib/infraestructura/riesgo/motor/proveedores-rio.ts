// Registro genérico de proveedores de nivel de río, por id. Vive en motor/ sin
// importar ningún adaptador (CA1: el motor no nombra Prefectura). La lista de
// proveedores implementados la arma el punto de composición fuera de motor/
// (jobs/compartido-riesgo.ts), que sí puede importar el adaptador.
//
// `FUENTES_RIO_FUERA_DEL_MOTOR`: fuentes de `fuentesRio` que NO son un proveedor
// de río del motor. 'ina' alimenta otros jobs (no el nivel de río que consume
// calculo.ts), así que se omite sin error. Cualquier otro id sin proveedor
// registrado lanza al armar: nunca se ignora en silencio.
//
// 'ana' y 'sgb' están planificadas (B12): lanzan "no implementado" hasta entonces.
import type { PuertoNivelRio } from './puertos'

export type ProveedorRio<Deps> = {
  id: string
  crearPuerto(deps: Deps): PuertoNivelRio
}

export type RegistroProveedoresRio<Deps> = {
  obtener(id: string): ProveedorRio<Deps>
  // Proveedor de motor de la región, o null si no tiene fuente de río para el motor.
  seleccionar(fuentesRio: readonly string[]): ProveedorRio<Deps> | null
  // Puerto de río de la región, o undefined si no hay proveedor de motor.
  construirPuerto(fuentesRio: readonly string[], deps: Deps): PuertoNivelRio | undefined
}

export const FUENTES_RIO_FUERA_DEL_MOTOR: readonly string[] = ['ina']

const PROVEEDORES_RIO_PLANIFICADOS: readonly string[] = ['ana', 'sgb']

export type OpcionesRegistroProveedoresRio<Deps> = {
  // Une varios proveedores de motor de una misma región en uno. Sin esta opción,
  // más de un proveedor de motor sigue siendo un error.
  combinar?: (proveedores: readonly ProveedorRio<Deps>[]) => ProveedorRio<Deps>
}

export function crearRegistroProveedoresRio<Deps>(
  implementados: readonly ProveedorRio<Deps>[],
  opciones: OpcionesRegistroProveedoresRio<Deps> = {},
): RegistroProveedoresRio<Deps> {
  function obtener(id: string): ProveedorRio<Deps> {
    const proveedor = implementados.find((registrado) => registrado.id === id)
    if (proveedor) return proveedor
    if (PROVEEDORES_RIO_PLANIFICADOS.includes(id)) {
      throw new Error(`proveedor de río no implementado: ${id}`)
    }
    throw new Error(`proveedor de río desconocido: ${id}`)
  }

  function seleccionar(fuentesRio: readonly string[]): ProveedorRio<Deps> | null {
    const delMotor = fuentesRio.filter((fuente) => !FUENTES_RIO_FUERA_DEL_MOTOR.includes(fuente))
    const proveedores = delMotor.map(obtener)
    if (proveedores.length > 1) {
      if (opciones.combinar) return opciones.combinar(proveedores)
      throw new Error(`varios proveedores de río no soportados todavía: ${delMotor.join(', ')}`)
    }
    return proveedores[0] ?? null
  }

  return {
    obtener,
    seleccionar,
    // Sin proveedor de motor, undefined: calculo.ts lo trata como "sin evidencia
    // de río" (rio = null, sin factor visible y sin faltante), igual que una
    // escuela no vinculada a un río.
    construirPuerto: (fuentesRio, deps) => seleccionar(fuentesRio)?.crearPuerto(deps),
  }
}
