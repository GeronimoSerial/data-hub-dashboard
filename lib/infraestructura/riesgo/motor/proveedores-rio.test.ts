import { describe, expect, it, vi } from 'vitest'
import type { PuertoNivelRio } from './puertos'
import { FUENTES_RIO_FUERA_DEL_MOTOR, crearRegistroProveedoresRio } from './proveedores-rio'

const puertoFalso: PuertoNivelRio = { obtenerEvidencia: vi.fn(async () => null) }
const crearPuertoFalso = vi.fn(() => puertoFalso)

const registro = crearRegistroProveedoresRio<{ marca: string }>([{ id: 'alfa', crearPuerto: crearPuertoFalso }])

describe('registro genérico de proveedores de río', () => {
  it('obtiene el proveedor registrado por id', () => {
    expect(registro.obtener('alfa').id).toBe('alfa')
  })

  it('selecciona el proveedor de motor ignorando las fuentes fuera del motor', () => {
    expect(registro.seleccionar(['alfa', 'ina'])?.id).toBe('alfa')
  })

  it('construye el puerto con las dependencias recibidas', () => {
    const deps = { marca: 'x' }
    expect(registro.construirPuerto(['alfa', 'ina'], deps)).toBe(puertoFalso)
    expect(crearPuertoFalso).toHaveBeenCalledWith(deps)
  })

  it('declara ina como fuente fuera del motor de riesgo', () => {
    expect(FUENTES_RIO_FUERA_DEL_MOTOR).toEqual(['ina'])
  })

  it('lanza un error claro para un id desconocido', () => {
    expect(() => registro.seleccionar(['zzz'])).toThrow('proveedor de río desconocido: zzz')
  })

  it('lanza un error claro para ana, todavía no implementado', () => {
    expect(() => registro.seleccionar(['ana'])).toThrow('proveedor de río no implementado: ana')
  })

  it('lanza un error claro para sgb, todavía no implementado', () => {
    expect(() => registro.construirPuerto(['sgb'], { marca: 'x' })).toThrow('proveedor de río no implementado: sgb')
  })

  it('rechaza más de un proveedor de río de motor en una misma región', () => {
    expect(() => registro.seleccionar(['alfa', 'alfa'])).toThrow('varios proveedores de río no soportados todavía')
  })

  it('una región con fuentesRio vacío no arma puerto de río', () => {
    expect(registro.construirPuerto([], { marca: 'x' })).toBeUndefined()
  })

  it('una región que sólo declara ina no arma puerto de río en el motor', () => {
    expect(registro.construirPuerto(['ina'], { marca: 'x' })).toBeUndefined()
  })
})
