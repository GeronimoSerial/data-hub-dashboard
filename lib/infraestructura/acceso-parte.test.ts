import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { getDb } from '@/lib/db'
import { infraVerificacion } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import {
  cancelarVerificacion,
  crearVerificacion,
  responderPorEnlace,
} from '@/lib/infraestructura/verificaciones'

const getSessionUserMock = vi.fn()
const cookiesGetMock = vi.fn()

vi.mock('@/lib/session', () => ({
  getSessionUser: () => getSessionUserMock(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookiesGetMock }),
}))

const {
  tieneAccesoAlParte,
  tieneAccesoAlParteDesdeCookies,
  tieneAccesoAlParteParaCue,
  tieneAccesoAlParteParaCueDesdeCookies,
  codigoSinAccesoParte,
  resolverAccesoParteDesdeCookies,
} = await import('@/lib/infraestructura/acceso-parte')
const { NOMBRE_COOKIE, crearTokenSesion } = await import('@/lib/infraestructura/acceso-publico')
const { NOMBRE_COOKIE_SESION_VERIFICACION, crearSesionVerificacion } = await import(
  '@/lib/infraestructura/verificacion-sesion'
)

// Base real en un tmpdir (mismo patrón que lib/infraestructura/verificaciones.test.ts)
// para los tests de re-chequeo contra la fila de la verificación. El resto del
// archivo sigue sin tocar la base: contraseña pública y rol admin no la consultan.
usarDbTemporal('acceso-parte-', { seed: false })

beforeAll(async () => {
  await ensureSeeded()
})

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
  return { id: 'u1', role, banned, nivelJurIds: [] }
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

// CUE único por test: infra_parte tiene índice único (cueAnexo, periodoId) y
// todos los tests comparten el período sembrado.
let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801604-${String(contadorCue).padStart(3, '0')}`
}

// Construye una verificación pendiente real y la cookie que emitiría el canje
// del token, para ejercitar el re-chequeo contra la fila sin pasar por la
// ruta HTTP.
async function verificacionConSesion() {
  const creada = await crearVerificacion({
    cueAnexo: cueUnico(),
    solicitadaPorUserId: 'user-director',
  })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  const { valorCookie } = crearSesionVerificacion(
    creada.verificacion.id,
    creada.verificacion.cueAnexo,
  )
  return {
    token: creada.token,
    verificacion: creada.verificacion,
    cueAnexo: creada.verificacion.cueAnexo,
    valorCookie,
  }
}

function requestConSesionVerificacion(valorCookie: string) {
  return new Request('https://ejemplo.test/api', {
    headers: { cookie: `${NOMBRE_COOKIE_SESION_VERIFICACION}=${valorCookie}` },
  })
}

describe('tieneAccesoAlParteParaCue (re-chequeo de la fila)', () => {
  it('sesión canjeada de una verificación pendiente: true', async () => {
    const { cueAnexo, valorCookie } = await verificacionConSesion()
    await expect(
      tieneAccesoAlParteParaCue(requestConSesionVerificacion(valorCookie), cueAnexo),
    ).resolves.toBe(true)
  })

  // Regla de N1: la MISMA cookie deja de servir apenas la fila cambia de estado.
  it('la misma sesión con la verificación cancelada: false', async () => {
    const { cueAnexo, valorCookie, verificacion } = await verificacionConSesion()
    await cancelarVerificacion({ verificacionId: verificacion.id, actorUserId: 'user-admin' })

    await expect(
      tieneAccesoAlParteParaCue(requestConSesionVerificacion(valorCookie), cueAnexo),
    ).resolves.toBe(false)
  })

  it('la misma sesión con el token revocado: false', async () => {
    const { cueAnexo, valorCookie, verificacion } = await verificacionConSesion()
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))

    await expect(
      tieneAccesoAlParteParaCue(requestConSesionVerificacion(valorCookie), cueAnexo),
    ).resolves.toBe(false)
  })

  it('la misma sesión con la verificación respondida: false', async () => {
    const { cueAnexo, valorCookie, token, verificacion } = await verificacionConSesion()
    const respuesta = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(respuesta.ok).toBe(true)

    await expect(
      tieneAccesoAlParteParaCue(requestConSesionVerificacion(valorCookie), cueAnexo),
    ).resolves.toBe(false)
  })

  // Regresión: el atajo de la contraseña compartida sigue funcionando sin
  // mirar la base de verificaciones.
  it('la contraseña compartida sigue dando true sin sesión de verificación', async () => {
    const { token } = crearTokenSesion()
    await expect(
      tieneAccesoAlParteParaCue(requestConCookie(token), '140000000'),
    ).resolves.toBe(true)
  })

  // Regresión: un admin sigue entrando sin sesión de verificación.
  it('un administrador sigue dando true sin sesión de verificación', async () => {
    getSessionUserMock.mockResolvedValue(usuario('admin'))
    await expect(
      tieneAccesoAlParteParaCue(requestConCookie(), '140000000'),
    ).resolves.toBe(true)
  })
})

// Misma lógica de re-chequeo, sólo cambia de dónde lee la cookie: un
// subconjunto alcanza (pendiente → true, cancelada → false, regresión admin).
describe('tieneAccesoAlParteParaCueDesdeCookies (re-chequeo, subconjunto)', () => {
  it('sesión canjeada de una verificación pendiente: true', async () => {
    const { cueAnexo, valorCookie } = await verificacionConSesion()
    cookiesGetMock.mockImplementation((nombre: string) =>
      nombre === NOMBRE_COOKIE_SESION_VERIFICACION ? { value: valorCookie } : undefined,
    )

    await expect(tieneAccesoAlParteParaCueDesdeCookies(cueAnexo)).resolves.toBe(true)
  })

  it('la misma sesión con la verificación cancelada: false', async () => {
    const { cueAnexo, valorCookie, verificacion } = await verificacionConSesion()
    await cancelarVerificacion({ verificacionId: verificacion.id, actorUserId: 'user-admin' })
    cookiesGetMock.mockImplementation((nombre: string) =>
      nombre === NOMBRE_COOKIE_SESION_VERIFICACION ? { value: valorCookie } : undefined,
    )

    await expect(tieneAccesoAlParteParaCueDesdeCookies(cueAnexo)).resolves.toBe(false)
  })

  it('un administrador sigue dando true sin sesión de verificación', async () => {
    getSessionUserMock.mockResolvedValue(usuario('admin'))
    await expect(tieneAccesoAlParteParaCueDesdeCookies('140000000')).resolves.toBe(true)
  })
})

// Sesión por rol: el operador sólo entra a su CUE (sin ?cue usa el de su sesión)
// y un director sólo a CUE de sus niveles. La pantalla y la API comparten esta guarda.
describe('acceso por sesión de operador de establecimiento', () => {
  const CUE_PROPIO = '1801605-04'
  const CUE_AJENO = '1800001-00'
  const operadorSesion = { ...usuario('operador_establecimiento'), cueAnexo: CUE_PROPIO }

  it('sin ?cue la página usa el CUE de la sesión', async () => {
    getSessionUserMock.mockResolvedValue(operadorSesion)
    await expect(resolverAccesoParteDesdeCookies(null)).resolves.toEqual({ permitido: true, cue: CUE_PROPIO })
  })

  it('un CUE ajeno en la página queda sin acceso', async () => {
    getSessionUserMock.mockResolvedValue(operadorSesion)
    await expect(tieneAccesoAlParteParaCueDesdeCookies(CUE_AJENO)).resolves.toBe(false)
    await expect(resolverAccesoParteDesdeCookies(CUE_AJENO)).resolves.toEqual({ permitido: false, cue: CUE_AJENO })
  })

  it('la API con su CUE entra y con un CUE ajeno responde 403', async () => {
    getSessionUserMock.mockResolvedValue(operadorSesion)
    await expect(tieneAccesoAlParteParaCue(requestConCookie(), CUE_PROPIO)).resolves.toBe(true)
    await expect(tieneAccesoAlParteParaCue(requestConCookie(), CUE_AJENO)).resolves.toBe(false)
    await expect(codigoSinAccesoParte()).resolves.toBe(403)
  })

  it('sin sesión de rol por CUE la denegación sigue siendo 401', async () => {
    await expect(codigoSinAccesoParte()).resolves.toBe(401)
  })

  it('un director sin niveles asignados no entra a ningún CUE', async () => {
    getSessionUserMock.mockResolvedValue({ ...usuario('director_nivel'), cueAnexo: null })
    await expect(tieneAccesoAlParteParaCueDesdeCookies(CUE_AJENO)).resolves.toBe(false)
  })
})
