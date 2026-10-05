// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { infraVerificacion } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { crearVerificacion, responderPorEnlace } from '@/lib/infraestructura/verificaciones'

const CLAVE = claveDePrueba()

const cookiesGetMock = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookiesGetMock }),
}))
// Sin sesión: 'sin cookie de acceso' tiene que seguir mostrando el ingreso.
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const { default: HistorialPartePage } = await import('./page')
const { crearTokenSesion } = await import('@/lib/infraestructura/acceso-publico')
const { NOMBRE_COOKIE_SESION_VERIFICACION, crearSesionVerificacion } = await import(
  '@/lib/infraestructura/verificacion-sesion'
)

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined

// Base Hub (getDb() cachea el cliente) en un único tmpdir para todo el archivo
// — mismo patrón que app/problematicas/parte/page.test.tsx. getDb() no se puede
// reapuntar entre tests, así que borrar el directorio por test dejaría el
// cliente apuntando a un archivo movido (SQLITE_READONLY_DBMOVED) en cuanto un
// caso necesite escribir una verificación.
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'parte-historial-page-'))
  prevDataDir = process.env.DATA_DIR
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.DATA_DIR = dir
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  cookiesGetMock.mockReset()
  // La página sólo resuelve la guarda en el servidor y delega el historial al
  // componente cliente, que pide el endpoint al montar: con una promesa
  // pendiente se queda en la fase de carga y el test no depende de la API.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function conAcceso() {
  const { token } = crearTokenSesion()
  cookiesGetMock.mockReturnValue({ value: token })
}

// La página sólo distingue la cookie de acceso público de la de sesión de
// verificación por su nombre, así que el mock devuelve la sesión acotada sólo
// cuando se la piden por ese nombre.
function conCookieDeSesionVerificacion(valorCookie: string) {
  cookiesGetMock.mockImplementation((nombre: string) =>
    nombre === NOMBRE_COOKIE_SESION_VERIFICACION ? { value: valorCookie } : undefined,
  )
}

// Verificación pendiente real + la cookie que emitiría el canje del token,
// mismo mecanismo que app/problematicas/parte/page.test.tsx. La hub vive en un
// tmpdir (ver beforeAll), por eso ensureSeeded() corre antes de tocar la base.
async function sesionDeVerificacionParaCue(cueAnexo: string) {
  await ensureSeeded()
  const creada = await crearVerificacion({
    cueAnexo,
    solicitadaPorUserId: 'user-director',
  })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  const { valorCookie } = crearSesionVerificacion(creada.verificacion.id, cueAnexo)
  return { token: creada.token, verificacion: creada.verificacion, valorCookie }
}

// El historial no resuelve la escuela en el servidor; alcanza con que el
// componente cliente renderice su estado inicial de carga y la salida al parte.
function esperaHistorial() {
  expect(screen.getByText('Buscando los movimientos del parte…')).toBeInTheDocument()
  const volver = screen.getByRole('link', { name: /volver al parte/i })
  expect(volver).toBeInTheDocument()
  expect(volver).toHaveAttribute('href', '/problematicas/parte?cue=1801605-04')
  const estado = screen.getByText('Buscando los movimientos del parte…')
  expect(volver.compareDocumentPosition(estado) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getAllByRole('link', { name: /volver al parte/i })).toHaveLength(1)
  expect(volver.parentElement).toHaveClass('historial-contenido')
  expect(screen.getByRole('heading', { level: 1 }).parentElement?.parentElement).toHaveClass('historial-contenido')
}

describe('HistorialPartePage', () => {
  it('sin cookie de acceso, muestra la pantalla de ingreso en vez del historial', async () => {
    cookiesGetMock.mockReturnValue(undefined)

    const jsx = await HistorialPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /volver al parte/i })).toBeNull()
  })

  it('regresión: con la contraseña compartida vigente, abre el historial', async () => {
    conAcceso()

    const jsx = await HistorialPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Registro de Incidencias ENOS 2026/2027' })).toBeInTheDocument()
    esperaHistorial()
  })
})

describe('HistorialPartePage — acceso por sesión de verificación', () => {
  it('sesión canjeada válida para el CUE de la query: renderiza el historial, no el ingreso', async () => {
    const { valorCookie } = await sesionDeVerificacionParaCue('1801605-04')
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await HistorialPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
    esperaHistorial()
  })

  it('la misma sesión con OTRO CUE: no abre el CUE ajeno, muestra el ingreso', async () => {
    const { valorCookie } = await sesionDeVerificacionParaCue('1801605-04')
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await HistorialPartePage({ searchParams: Promise.resolve({ cue: '1801605-99' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /volver al parte/i })).toBeNull()
  })

  it('sesión cuya verificación fue revocada: muestra el ingreso', async () => {
    const { valorCookie, verificacion } = await sesionDeVerificacionParaCue('1801605-04')
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await HistorialPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /volver al parte/i })).toBeNull()
  })

  it('sesión cuya verificación ya fue respondida: muestra el ingreso', async () => {
    const { valorCookie, token, verificacion } = await sesionDeVerificacionParaCue('1801605-04')
    const respuesta = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(respuesta.ok).toBe(true)
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await HistorialPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /volver al parte/i })).toBeNull()
  })
})
