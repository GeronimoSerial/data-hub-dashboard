import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NOMBRE_COOKIE_SESION_VERIFICACION,
  crearSesionVerificacion,
  extraerCookieVerificacionSesion,
  sesionVerificacionValidaParaCue,
  verificacionIdDeSesionValida,
} from './verificacion-sesion'
import { claveDePrueba } from './claves-de-prueba'

const CLAVE = claveDePrueba()
const VERIFICACION_ID = '3f1a9c2e-0b7d-4a51-9e88-2c6f5d4b1a70'
const CUE = '140123400'

let prevPassword: string | undefined

beforeEach(() => {
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
})

afterEach(() => {
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
})

describe('crearSesionVerificacion / sesionVerificacionValidaParaCue', () => {
  it('la sesión recién creada es válida para el mismo CUE', () => {
    const { valorCookie } = crearSesionVerificacion(VERIFICACION_ID, CUE)
    expect(sesionVerificacionValidaParaCue(valorCookie, CUE)).toBe(true)
  })

  it('no es válida para otro CUE aunque la firma sea correcta', () => {
    const { valorCookie } = crearSesionVerificacion(VERIFICACION_ID, CUE)
    expect(sesionVerificacionValidaParaCue(valorCookie, '140999999')).toBe(false)
  })

  it('una sesión vencida deja de ser válida', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const { valorCookie, expiraEn } = crearSesionVerificacion(VERIFICACION_ID, CUE, ahora)
    // La expiración es ahora + 30 minutos.
    expect(expiraEn.getTime()).toBe(ahora.getTime() + 1000 * 60 * 30)
    const despuesDelVencimiento = new Date(expiraEn.getTime() + 1)
    expect(sesionVerificacionValidaParaCue(valorCookie, CUE, despuesDelVencimiento)).toBe(false)
  })

  it('una cookie con la firma alterada no es válida', () => {
    const { valorCookie } = crearSesionVerificacion(VERIFICACION_ID, CUE)
    const alterada = `${valorCookie.slice(0, -1)}${valorCookie.endsWith('A') ? 'B' : 'A'}`
    expect(sesionVerificacionValidaParaCue(alterada, CUE)).toBe(false)
  })

  it('una cookie vacía o ausente no es válida', () => {
    expect(sesionVerificacionValidaParaCue(undefined, CUE)).toBe(false)
    expect(sesionVerificacionValidaParaCue(null, CUE)).toBe(false)
    expect(sesionVerificacionValidaParaCue('', CUE)).toBe(false)
  })

  it('sin PROBLEMATICAS_ACCESO_PASSWORD devuelve false sin lanzar', () => {
    const { valorCookie } = crearSesionVerificacion(VERIFICACION_ID, CUE)
    delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
    expect(() => sesionVerificacionValidaParaCue(valorCookie, CUE)).not.toThrow()
    expect(sesionVerificacionValidaParaCue(valorCookie, CUE)).toBe(false)
  })
})

describe('verificacionIdDeSesionValida', () => {
  it('devuelve el verificacionId para el CUE correcto', () => {
    const { valorCookie } = crearSesionVerificacion(VERIFICACION_ID, CUE)
    expect(verificacionIdDeSesionValida(valorCookie, CUE)).toBe(VERIFICACION_ID)
  })

  it('devuelve null para otro CUE aunque la firma sea correcta', () => {
    const { valorCookie } = crearSesionVerificacion(VERIFICACION_ID, CUE)
    expect(verificacionIdDeSesionValida(valorCookie, '140999999')).toBeNull()
  })

  it('devuelve null con la firma alterada', () => {
    const { valorCookie } = crearSesionVerificacion(VERIFICACION_ID, CUE)
    const alterada = `${valorCookie.slice(0, -1)}${valorCookie.endsWith('A') ? 'B' : 'A'}`
    expect(verificacionIdDeSesionValida(alterada, CUE)).toBeNull()
  })

  it('devuelve null con una sesión vencida', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const { valorCookie, expiraEn } = crearSesionVerificacion(VERIFICACION_ID, CUE, ahora)
    const despuesDelVencimiento = new Date(expiraEn.getTime() + 1)
    expect(verificacionIdDeSesionValida(valorCookie, CUE, despuesDelVencimiento)).toBeNull()
  })

  it('devuelve null con una cookie vacía o ausente', () => {
    expect(verificacionIdDeSesionValida(undefined, CUE)).toBeNull()
    expect(verificacionIdDeSesionValida(null, CUE)).toBeNull()
    expect(verificacionIdDeSesionValida('', CUE)).toBeNull()
  })
})

describe('extraerCookieVerificacionSesion', () => {
  it('encuentra el valor correcto entre varias cookies', () => {
    const header = `otra=1; ${NOMBRE_COOKIE_SESION_VERIFICACION}=valor-buscado; mas=2`
    expect(extraerCookieVerificacionSesion(header)).toBe('valor-buscado')
  })

  it('devuelve undefined si la cookie no está', () => {
    expect(extraerCookieVerificacionSesion('otra=1; mas=2')).toBeUndefined()
    expect(extraerCookieVerificacionSesion(undefined)).toBeUndefined()
    expect(extraerCookieVerificacionSesion(null)).toBeUndefined()
  })
})
