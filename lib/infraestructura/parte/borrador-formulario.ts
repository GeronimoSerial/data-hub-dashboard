import { CONTRATO_VERSION } from '../reportes-offline-contratos'
import { abrirAlmacenParte, type RegistroBorradorLocal } from './almacen-indexeddb'
import { crearColaTrabajosEnvio } from './cola-trabajos-envio'

export interface BorradorFormulario<T> {
  registro: RegistroBorradorLocal
  datos: T
}

/** Finds a durable B2 submission confirmation for one form draft. */
export async function leerConfirmacionFormulario(draftId: string) {
  const almacen = await abrirAlmacenParte()
  const contexto = await almacen.obtenerContexto<{ idempotencyKey?: unknown }>(draftId)
  const trabajos = await almacen.obtenerTrabajosEnvio()
  const cola = crearColaTrabajosEnvio(almacen)
  if (typeof contexto?.idempotencyKey === 'string' && contexto.idempotencyKey) {
    const confirmacion = await cola.obtenerConfirmacion(contexto.idempotencyKey)
    if (confirmacion) return confirmacion
  }
  for (const trabajo of trabajos) {
    if (trabajo.draftId !== draftId || trabajo.tipo !== 'reporte_final') continue
    const confirmacion = await cola.obtenerConfirmacion(trabajo.idempotencyKey)
    if (confirmacion) return confirmacion
  }
  return null
}

/** Persists the draft-to-key link before the form starts its network request. */
export async function guardarClaveEnvioFormulario(draftId: string, idempotencyKey: string): Promise<void> {
  const almacen = await abrirAlmacenParte()
  const contexto = await almacen.obtenerContexto<Record<string, unknown>>(draftId)
  await almacen.guardarContexto({ ...contexto, draftId, idempotencyKey })
}

export async function olvidarClaveEnvioFormulario(draftId: string): Promise<void> {
  const almacen = await abrirAlmacenParte()
  const contexto = await almacen.obtenerContexto<Record<string, unknown>>(draftId)
  if (contexto) {
    const actualizado: Record<string, unknown> & { draftId: string; idempotencyKey?: string } = {
      ...contexto,
      draftId,
    }
    delete actualizado.idempotencyKey
    await almacen.guardarContexto(actualizado)
  }
}

export async function confirmarFormulario(
  draftId: string,
  movimientoId: string,
): Promise<void> {
  const almacen = await abrirAlmacenParte()
  const contexto = await almacen.obtenerContexto<{ idempotencyKey?: unknown }>(draftId)
  if (typeof contexto?.idempotencyKey !== 'string' || !contexto.idempotencyKey) return
  await crearColaTrabajosEnvio(almacen).confirmar(contexto.idempotencyKey, {
    movimientoId,
    rigeDesde: new Date().toISOString(),
    cierreDraft: 'enviado',
  })
}

/** Clears only the answered form draft; queued attachment work stays durable. */
export async function limpiarFormularioConfirmado(draftId: string, claveLegacy: string): Promise<void> {
  const almacen = await abrirAlmacenParte()
  const borrador = await almacen.obtenerBorrador(draftId)
  if (borrador) await almacen.eliminarBorradorSiGeneracion(draftId, borrador.generacion)
  if (typeof localStorage !== 'undefined') localStorage.removeItem(claveLegacy)
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
