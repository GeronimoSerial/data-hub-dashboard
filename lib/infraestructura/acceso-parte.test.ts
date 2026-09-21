import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'

const getSessionUserMock = vi.fn()
const cookiesGetMock = vi.fn()

vi.mock('@/lib/session', () => ({
  getSessionUser: () => getSessionUserMock(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookiesGetMock }),
}))

const { tieneAccesoAlParte, tieneAccesoAlParteDesdeCookies } = await import(
  '@/lib/infraestructura/acceso-parte'
)
const { NOMBRE_COOKIE, crearTokenSesion } = await import('@/lib/infraestructura/acceso-publico')

const CLAVE = claveDePrueba()

let prevPassword: string | undefined

beforeEach(() => {
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
  getSessionUserMock.mockReset()
  getSessionUserMock.mockResolvedValue(null)
  cookiesGetMock.mockReset()
  cookiesGetMock.mockReturnValue(undefined)
})

afterEach(() => {
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
})

function usuario(role: string, banned = false) {
  return { id: 'u1', role, banned, nivelIds: [] }
}

function requestConCookie(valor?: string) {
  return new Request('https://ejemplo.test/api', {
    headers: valor ? { cookie: `${NOMBRE_COOKIE}=${valor}` } : {},
  })
}

describe('tieneAccesoAlParte (Route Handlers)', () => {
  it('deja pasar con la contraseña del recorrido público', async () => {
    const { token } = crearTokenSesion()
    await expect(tieneAccesoAlParte(requestConCookie(token))).resolves.toBe(true)
  })

  it('no resuelve la sesión cuando la contraseña ya alcanzó', async () => {
    const { token } = crearTokenSesion()
    await tieneAccesoAlParte(requestConCookie(token))
    expect(getSessionUserMock).not.toHaveBeenCalled()
  })

  it('deja pasar a un administrador sin contraseña', async () => {
    getSessionUserMock.mockResolvedValue(usuario('admin'))
    await expect(tieneAccesoAlParte(requestConCookie())).resolves.toBe(true)
  })

  // 'editor' queda afuera a propósito: la contraseña existe porque el contexto
  // del parte incluye identidad de alumnos, y permiso-nominal.ts ya excluye a
  // ese rol de ese mismo dato.
  it('rechaza a un editor sin contraseña', async () => {
    getSessionUserMock.mockResolvedValue(usuario('editor'))
    await expect(tieneAccesoAlParte(requestConCookie())).resolves.toBe(false)
  })

  it('rechaza a un usuario de consulta sin contraseña', async () => {
    getSessionUserMock.mockResolvedValue(usuario('consulta'))
    await expect(tieneAccesoAlParte(requestConCookie())).resolves.toBe(false)
  })

  it('rechaza a un administrador baneado', async () => {
    getSessionUserMock.mockResolvedValue(usuario('admin', true))
    await expect(tieneAccesoAlParte(requestConCookie())).resolves.toBe(false)
  })

  it('rechaza sin contraseña y sin sesión', async () => {
    await expect(tieneAccesoAlParte(requestConCookie())).resolves.toBe(false)
  })

  it('rechaza una cookie de acceso manipulada', async () => {
    getSessionUserMock.mockResolvedValue(null)
    await expect(tieneAccesoAlParte(requestConCookie('no-es-un-token'))).resolves.toBe(false)
  })
})

describe('tieneAccesoAlParteDesdeCookies (páginas)', () => {
  it('deja pasar con la contraseña del recorrido público', async () => {
    const { token } = crearTokenSesion()
    cookiesGetMock.mockReturnValue({ value: token })
    await expect(tieneAccesoAlParteDesdeCookies()).resolves.toBe(true)
  })

  it('deja pasar a un administrador sin contraseña', async () => {
    getSessionUserMock.mockResolvedValue(usuario('admin'))
    await expect(tieneAccesoAlParteDesdeCookies()).resolves.toBe(true)
  })

  it('rechaza a un editor sin contraseña', async () => {
    getSessionUserMock.mockResolvedValue(usuario('editor'))
    await expect(tieneAccesoAlParteDesdeCookies()).resolves.toBe(false)
  })

  it('rechaza sin contraseña y sin sesión', async () => {
    await expect(tieneAccesoAlParteDesdeCookies()).resolves.toBe(false)
  })
})
