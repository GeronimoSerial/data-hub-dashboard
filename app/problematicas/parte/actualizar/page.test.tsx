// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { infraAfectacion, infraAfectacionSeccion, infraParte, infraVerificacion } from '@/lib/db/schema'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
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

const { default: ActualizarPartePage } = await import('./page')
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
  dir = mkdtempSync(path.join(tmpdir(), 'parte-actualizar-page-'))
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
  // La página resuelve la escuela en el servidor y el recorrido de
  // actualización pide el estado vigente al montar: con una promesa pendiente
  // se queda en la fase de carga y el test no depende de la API.
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
// tmpdir (ver beforeEach), por eso ensureSeeded() corre antes de tocar la base.
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

async function seedEscuelaConSeccion() {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente') ON CONFLICT DO NOTHING",
  )
  await client.execute({
    sql: `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad)
          VALUES ('1801605-04', NULL, 'Escuela 4', 'Entre Rios', 'Parana')
          ON CONFLICT(cue_anexo) DO UPDATE SET nombre = excluded.nombre`,
    args: [],
  })
  await client.execute(
    "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'Primario', 'Mañana') ON CONFLICT DO NOTHING",
  )
  await client.execute(
    'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 900001) ON CONFLICT DO NOTHING',
  )
}

// La pantalla de actualización se corrige sola si al CUE no le toca actualizar
// (destinoParaParte === 'nuevo' cuando no hay afectación vigente). Para
// ejercitar el render normal hace falta un parte con al menos una afectación
// vigente. INSERT idempotente: el índice único (cueAnexo, periodoId) prohíbe
// sembrarlo dos veces en el mismo archivo.
async function seedParteConAfectacion() {
  const db = getDb()
  await db
    .insert(infraParte)
    .values({
      id: 'parte-actualizar-1801605-04',
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: '1801605-04',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: '2026-03-01T00:00:00Z',
      corteId: 1,
      creadaEn: '2026-03-01T00:00:00Z',
      actualizadaEn: '2026-03-01T00:00:00Z',
    })
    .onConflictDoNothing()
  await db
    .insert(infraAfectacion)
    .values({
      id: 'afectacion-actualizar-1801605-04',
      parteId: 'parte-actualizar-1801605-04',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: null,
      rigeDesde: '2026-03-01T00:00:00Z',
      creadaEn: '2026-03-01T00:00:00Z',
      retiradaEn: null,
    })
    .onConflictDoNothing()
  await db
    .insert(infraAfectacionSeccion)
    .values({ afectacionId: 'afectacion-actualizar-1801605-04', geSectionId: 10 })
    .onConflictDoNothing()
}

describe('ActualizarPartePage', () => {
  it('sin cookie de acceso, muestra la pantalla de ingreso en vez del formulario', async () => {
    await seedEscuelaConSeccion()
    await seedParteConAfectacion()
    cookiesGetMock.mockReturnValue(undefined)

    const jsx = await ActualizarPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela 4')).not.toBeInTheDocument()
  })

  it('regresión: con la contraseña compartida vigente, abre la actualización', async () => {
    await seedEscuelaConSeccion()
    await seedParteConAfectacion()
    conAcceso()

    const jsx = await ActualizarPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
    expect(screen.getByText('Escuela 4')).toBeInTheDocument()
    expect(screen.getByText(/buscando el estado actual/i)).toBeInTheDocument()
  })
})

describe('ActualizarPartePage — acceso por sesión de verificación', () => {
  it('sesión canjeada válida para el CUE de la query: renderiza la actualización, no el ingreso', async () => {
    const { valorCookie } = await sesionDeVerificacionParaCue('1801605-04')
    await seedEscuelaConSeccion()
    await seedParteConAfectacion()
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await ActualizarPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
    expect(screen.getByText('Escuela 4')).toBeInTheDocument()
    expect(screen.getByText(/buscando el estado actual/i)).toBeInTheDocument()
  })

  it('la misma sesión con OTRO CUE: no abre el CUE ajeno, muestra el ingreso', async () => {
    const { valorCookie } = await sesionDeVerificacionParaCue('1801605-04')
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await ActualizarPartePage({ searchParams: Promise.resolve({ cue: '1801605-99' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
  })

  it('sesión cuya verificación fue revocada: muestra el ingreso', async () => {
    const { valorCookie, verificacion } = await sesionDeVerificacionParaCue('1801605-04')
    await seedEscuelaConSeccion()
    await seedParteConAfectacion()
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await ActualizarPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela 4')).toBeNull()
  })

  it('sesión cuya verificación ya fue respondida: muestra el ingreso', async () => {
    const { valorCookie, token, verificacion } = await sesionDeVerificacionParaCue('1801605-04')
    await seedEscuelaConSeccion()
    await seedParteConAfectacion()
    const respuesta = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(respuesta.ok).toBe(true)
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await ActualizarPartePage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela 4')).toBeNull()
  })
})
