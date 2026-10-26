// @vitest-environment node
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { CONTRATO_VERSION } from '../reportes-offline-contratos'
import { abrirAlmacenParte } from './almacen-indexeddb'
import {
  eliminarBorradorFormulario,
  guardarBorradorFormulario,
  vaciarEscriturasBorrador,
  type BorradorFormulario,
} from './borrador-formulario'

const DRAFT_ID = 'parte-nuevo:draft:cola-test'

function borradorDe(datos: { paso: number }): BorradorFormulario<{ paso: number }> {
  return {
    registro: { draftId: DRAFT_ID, generacion: 1, version: CONTRATO_VERSION, datos, actualizadoEn: '2026-10-25T10:00:00.000Z' },
    datos,
  }
}

beforeEach(async () => {
  await vaciarEscriturasBorrador()
  globalThis.indexedDB = new IDBFactory()
})

describe('cola de escrituras del borrador', () => {
  it('guardar y eliminar sin esperar dejan el borrador eliminado', async () => {
    const datos = { paso: 2 }
    const borrador = borradorDe(datos)
    // Sin esperar: el guardado debe terminar antes que la eliminación, nunca después.
    const guardado = guardarBorradorFormulario(borrador, datos)
    const eliminado = eliminarBorradorFormulario(borrador)
    await Promise.all([guardado, eliminado])
    await vaciarEscriturasBorrador()
    expect(await (await abrirAlmacenParte()).obtenerBorrador(DRAFT_ID)).toBeNull()
  })
})
