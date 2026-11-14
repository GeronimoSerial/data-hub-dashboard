import { describe, expect, it, vi } from 'vitest'
import { crearAdapterRioPrefectura, type DatosRio } from '../motor/adaptadores/rio-prefectura'
import { crearRegistroProveedoresRio } from '../motor/proveedores-rio'
import { PROVEEDORES_RIO } from './compartido-riesgo'

const datosVacios: DatosRio = {
  localidadPorCue: new Map(),
  susceptibilidadPorCue: new Map(),
  distanciaRioKmPorCue: new Map(),
  lecturas: [],
}

const parametros = { cueAnexo: '90000001', asOf: '2026-06-01T12:00:00.000Z' }

describe('proveedores de río en el punto de armado', () => {
  it('registra prefectura como proveedor implementado', () => {
    expect(PROVEEDORES_RIO.obtener('prefectura').id).toBe('prefectura')
  })

  it('arma para Corrientes (prefectura, ina) el mismo puerto que el adaptador directo', async () => {
    const cargarDatos = vi.fn(async () => datosVacios)
    const deps = { cargarDatos }

    const puerto = PROVEEDORES_RIO.construirPuerto(['prefectura', 'ina'], deps)
    const directo = crearAdapterRioPrefectura(deps)

    expect(puerto).toBeDefined()
    expect(Object.keys(puerto!)).toEqual(Object.keys(directo))
    expect(await puerto!.obtenerEvidencia(parametros)).toEqual(await directo.obtenerEvidencia(parametros))
    expect(cargarDatos).toHaveBeenCalled()
  })

  it('ana y sgb están implementadas desde B12.2', () => {
    expect(PROVEEDORES_RIO.obtener('ana').id).toBe('ana')
    expect(PROVEEDORES_RIO.obtener('sgb').id).toBe('sgb')
  })

  it('un id planificado que no se registró sigue lanzando "no implementado"', () => {
    const sinRegistrar = crearRegistroProveedoresRio<unknown>([])
    expect(() => sinRegistrar.obtener('ana')).toThrow('proveedor de río no implementado: ana')
    expect(() => sinRegistrar.obtener('sgb')).toThrow('proveedor de río no implementado: sgb')
  })
})
