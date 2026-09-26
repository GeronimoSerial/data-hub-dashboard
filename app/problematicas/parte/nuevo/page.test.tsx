// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { infraVerificacion } from '@/lib/db/schema'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { crearEpisodio } from '@/lib/infraestructura/episodios'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
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

const { default: NuevoPartePage } = await import('./page')
const { crearTokenSesion } = await import('@/lib/infraestructura/acceso-publico')
const { NOMBRE_COOKIE_SESION_VERIFICACION, crearSesionVerificacion } = await import(
  '@/lib/infraestructura/verificacion-sesion'
)

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined

// Base Hub (getDb() cachea el cliente) y base GE comparten un único tmpdir
// para todo el archivo — mismo patrón que app/problematicas/parte/page.test.tsx.
// getDb() no se puede reapuntar entre tests, así que borrar el directorio por
// test dejaría el cliente apuntando a un archivo movido (SQLITE_READONLY_DBMOVED)
// en cuanto un caso necesite escribir una verificación.
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'parte-nuevo-page-'))
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
// tmpdir (ver beforeEach), por eso ensureSeeded() corre antes de tocar la base.
async function sesionDeVerificacionParaCue(cueAnexo: string) {
  await ensureSeeded()
  const episodio = await crearEpisodio({
    periodoId: PERIODO_ENOS_2026_2027_ID,
    nombre: 'Episodio de prueba',
  })
  const creada = await crearVerificacion({
    episodioId: episodio.id,
    cueAnexo,
    solicitadaPorUserId: 'user-director',
  })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  const { valorCookie } = crearSesionVerificacion(creada.verificacion.id, cueAnexo)
  return { token: creada.token, verificacion: creada.verificacion, valorCookie }
}

async function seedEscuelaConSeccion() {
  const client = openGeDb()
  try {
    await ensureGeSchema(client)
    await client.execute(
      "INSERT OR IGNORE INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente')",
    )
    await client.execute({
      sql: `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad)
            VALUES ('1801605-04', NULL, 'Escuela 4', 'Entre Rios', 'Parana')
            ON CONFLICT(cue_anexo) DO UPDATE SET nombre = excluded.nombre`,
      args: [],
    })
    await client.execute(
      "INSERT OR IGNORE INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'Primario', 'Mañana')",
    )
    await client.execute(
      'INSERT OR IGNORE INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 900001)',
    )
  } finally {
    client.close()
  }
}

describe('NuevoPartePage', () => {
  it('sin cookie de acceso, muestra la pantalla de ingreso en vez del formulario', async () => {
    await seedEscuelaConSeccion()
    cookiesGetMock.mockReturnValue(undefined)

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela 4')).not.toBeInTheDocument()
  })

  it('con cookie de acceso vigente, encabeza con el programa y abre el asistente', async () => {
    await seedEscuelaConSeccion()
    conAcceso()

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    // El título es el del programa; la escuela queda como identidad
    // subordinada, una sola vez y sin encabezar la pantalla.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Registro de Incidencias ENOS 2026/2027' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Escuela 4' })).toBeNull()
    expect(screen.getByText('Escuela 4')).toBeInTheDocument()

    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /agregar afectación/i })).toBeNull()
  })

  it('muestra un error claro sin CUE, sin ofrecer alternativas', async () => {
    await seedEscuelaConSeccion()
    conAcceso()

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByText(/no incluye el CUE/i)).toBeInTheDocument()
    expect(screen.queryByText(/1801605/)).not.toBeInTheDocument()
  })

  it('muestra un error claro para un CUE inexistente', async () => {
    await seedEscuelaConSeccion()
    conAcceso()

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({ cue: '9999999' }) })
    render(jsx)

    expect(screen.getByText(/no se encontró una escuela/i)).toBeInTheDocument()
  })
})

describe('NuevoPartePage — acceso por sesión de verificación', () => {
  it('sesión canjeada válida para el CUE de la query: renderiza el asistente, no el ingreso', async () => {
    const { valorCookie } = await sesionDeVerificacionParaCue('1801605-04')
    await seedEscuelaConSeccion()
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.getByText('Escuela 4')).toBeInTheDocument()
  })

  it('la misma sesión con OTRO CUE: no abre el CUE ajeno, muestra el ingreso', async () => {
    const { valorCookie } = await sesionDeVerificacionParaCue('1801605-04')
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({ cue: '1801605-99' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
  })

  it('sesión cuya verificación fue revocada: muestra el ingreso', async () => {
    const { valorCookie, verificacion } = await sesionDeVerificacionParaCue('1801605-04')
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela 4')).toBeNull()
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

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela 4')).toBeNull()
  })

  it('regresión: la contraseña compartida sigue abriendo el asistente', async () => {
    await seedEscuelaConSeccion()
    conAcceso()

    const jsx = await NuevoPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
  })
})