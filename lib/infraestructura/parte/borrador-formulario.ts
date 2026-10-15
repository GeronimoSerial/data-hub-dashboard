import { CONTRATO_VERSION } from '../reportes-offline-contratos'
import { abrirAlmacenParte, type RegistroBorradorLocal } from './almacen-indexeddb'

export interface BorradorFormulario<T> {
  registro: RegistroBorradorLocal
  datos: T
}

export async function leerBorradorFormulario<T>(
  draftId: string,
  claveLegacy: string,
  esBorrador: (valor: unknown) => valor is T,
): Promise<BorradorFormulario<T> | null> {
  const almacen = await abrirAlmacenParte()
  const guardado = await almacen.obtenerBorrador(draftId)
  if (guardado) {
    if (guardado.version !== CONTRATO_VERSION || !esBorrador(guardado.datos)) {
      throw new Error('El borrador guardado usa un formato incompatible y se conservó en este dispositivo.')
    }
    return { registro: guardado, datos: guardado.datos }
  }

  const crudo = typeof localStorage === 'undefined' ? null : localStorage.getItem(claveLegacy)
  if (crudo === null) return null
  let datos: unknown
  try {
    datos = JSON.parse(crudo)
  } catch {
    throw new Error('El borrador anterior no se pudo leer y se conservó en este dispositivo.')
  }
  if (!esBorrador(datos)) {
    throw new Error('El borrador anterior usa un formato incompatible y se conservó en este dispositivo.')
  }

  const registro: RegistroBorradorLocal = {
    draftId,
    generacion: 1,
    version: CONTRATO_VERSION,
    datos,
    actualizadoEn: new Date().toISOString(),
  }
  await almacen.guardarBorrador(registro)
  localStorage.removeItem(claveLegacy)
  return { registro, datos }
}

export async function guardarBorradorFormulario<T>(
  borrador: BorradorFormulario<T>,
  datos: T,
): Promise<BorradorFormulario<T>> {
  const siguiente: BorradorFormulario<T> = {
    registro: {
      ...borrador.registro,
      datos,
      actualizadoEn: new Date().toISOString(),
    },
    datos,
  }
  await (await abrirAlmacenParte()).guardarBorrador(siguiente.registro)
  return siguiente
}

export async function eliminarBorradorFormulario(borrador: BorradorFormulario<unknown>): Promise<boolean> {
  return (await abrirAlmacenParte()).eliminarBorradorSiGeneracion(
    borrador.registro.draftId,
    borrador.registro.generacion,
  )
}
