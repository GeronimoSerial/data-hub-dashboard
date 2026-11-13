// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { moduloDeRutaHabilitado } from './modulos'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarRegionPublicaCliente } from './publica'
import { regionPublica } from './esquema'
import { cargarRegion } from './registro'
import { shellNavAllowed, shellUserFor } from '@/lib/access/shell-nav'

afterEach(() => {
  vi.unstubAllEnvs()
  __reiniciarRegionPublicaClienteParaPruebas()
})

const SOLO_CORRIENTES = ['/cuadernillos', '/cuadernillos/x', '/links', '/mapas/matricula', '/mapas/natalidad', '/mapas/reorganizacion', '/api/cuadernillos/stock']
const COMUNES = ['/', '/explorar', '/situacion', '/mapas/infraestructura', '/mapas/infraestructura/escuelas/1', '/mapas', '/admin/usuarios', '/problematicas/parte/nuevo']

describe('módulos exclusivos de Corrientes', () => {
  it('Corrientes habilita todas las rutas', () => {
    for (const ruta of [...SOLO_CORRIENTES, ...COMUNES]) expect(moduloDeRutaHabilitado(ruta), ruta).toBe(true)
  })

  it('Manaos deshabilita los módulos de Corrientes y deja el resto', () => {
    fijarRegionPublicaCliente(regionPublica(cargarRegion('manaos')))
    for (const ruta of SOLO_CORRIENTES) expect(moduloDeRutaHabilitado(ruta), ruta).toBe(false)
    for (const ruta of COMUNES) expect(moduloDeRutaHabilitado(ruta), ruta).toBe(true)
  })

  it('la navegación del shell no lista /cuadernillos en Manaos y sí en Corrientes', () => {
    const admin = shellUserFor('admin', undefined)
    expect(shellNavAllowed(admin, '/cuadernillos')).toBe(true)
    fijarRegionPublicaCliente(regionPublica(cargarRegion('manaos')))
    expect(shellNavAllowed(admin, '/cuadernillos')).toBe(false)
    expect(shellNavAllowed(admin, '/explorar')).toBe(true)
  })
})
