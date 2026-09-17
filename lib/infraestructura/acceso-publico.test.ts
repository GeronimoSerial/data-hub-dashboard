import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NOMBRE_COOKIE,
  crearTokenSesion,
  tieneAccesoPublico,
  tieneAccesoPublicoDesdeValorCookie,
  tokenSesionValido,
  verificarPassword,
} from './acceso-publico'
import { claveDePrueba } from './claves-de-prueba'

const CLAVE = claveDePrueba()
const OTRA_CLAVE = claveDePrueba()

let prevPassword: string | undefined

beforeEach(() => {
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
})

afterEach(() => {
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
})

describe('verificarPassword', () => {
  it('acepta la contraseña configurada', () => {
    expect(verificarPassword(CLAVE)).toBe(true)
  })

  it('rechaza una contraseña incorrecta', () => {
    expect(verificarPassword(OTRA_CLAVE)).toBe(false)
  })

  it('rechaza cuando la variable de entorno no está configurada, sin distinguir el motivo', () => {
    delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
    expect(verificarPassword(CLAVE)).toBe(false)
  })

  it('rechaza una contraseña de largo distinto sin lanzar', () => {
    expect(verificarPassword('x')).toBe(false)
    expect(verificarPassword(`${CLAVE}-mucho-mas-larga`)).toBe(false)
  })
})

describe('crearTokenSesion / tokenSesionValido', () => {
  it('el token recién creado es válido', () => {
    const { token } = crearTokenSesion()
    expect(tokenSesionValido(token)).toBe(true)
  })

  it('un token vencido deja de ser válido', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const { token } = crearTokenSesion(ahora)
    const muchoDespues = new Date('2026-01-02T00:00:00Z')
    expect(tokenSesionValido(token, muchoDespues)).toBe(false)
  })

  it('un token con firma adulterada no es válido', () => {
    const { token } = crearTokenSesion()
    const [payload] = token.split('.')
    expect(tokenSesionValido(`${payload}.firma-inventada`)).toBe(false)
  })

  it('un token vacío o ausente no es válido', () => {
    expect(tokenSesionValido(undefined)).toBe(false)
    expect(tokenSesionValido(null)).toBe(false)
    expect(tokenSesionValido('')).toBe(false)
  })

  it('un token firmado con una contraseña distinta deja de ser válido si la contraseña cambia', () => {
    const { token } = crearTokenSesion()
    process.env.PROBLEMATICAS_ACCESO_PASSWORD = OTRA_CLAVE
    expect(tokenSesionValido(token)).toBe(false)
  })
})

describe('tieneAccesoPublico', () => {
  it('true cuando el Request trae la cookie de sesión vigente', () => {
    const { token } = crearTokenSesion()
    const request = new Request('http://localhost/api/problematicas/contexto', {
      headers: { cookie: `${NOMBRE_COOKIE}=${token}` },
    })
    expect(tieneAccesoPublico(request)).toBe(true)
  })

  it('false sin cookie', () => {
    const request = new Request('http://localhost/api/problematicas/contexto')
    expect(tieneAccesoPublico(request)).toBe(false)
  })

  it('false con una cookie de otro nombre', () => {
    const request = new Request('http://localhost/api/problematicas/contexto', {
      headers: { cookie: 'otra_cookie=algo' },
    })
    expect(tieneAccesoPublico(request)).toBe(false)
  })

  it('encuentra la cookie entre varias', () => {
    const { token } = crearTokenSesion()
    const request = new Request('http://localhost/api/problematicas/contexto', {
      headers: { cookie: `otra=1; ${NOMBRE_COOKIE}=${token}; mas=2` },
    })
    expect(tieneAccesoPublico(request)).toBe(true)
  })
})

describe('tieneAccesoPublicoDesdeValorCookie', () => {
  it('mismo resultado que tokenSesionValido para Server Components', () => {
    const { token } = crearTokenSesion()
    expect(tieneAccesoPublicoDesdeValorCookie(token)).toBe(true)
    expect(tieneAccesoPublicoDesdeValorCookie(undefined)).toBe(false)
  })
})
