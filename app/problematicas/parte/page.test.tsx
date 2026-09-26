// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { getDb } from '@/lib/db'
import { infraVerificacion } from '@/lib/db/schema'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { crearEpisodio } from '@/lib/infraestructura/episodios'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import {
  cancelarVerificacion,
  crearVerificacion,
  responderPorEnlace,
} from '@/lib/infraestructura/verificaciones'

const CLAVE = claveDePrueba()

const cookiesGetMock = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookiesGetMock }),
}))
// El recorrido de verificación no otorga rol: sin contraseña no hay admin.
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const { default: EstadoActualPartePage } = await import('./page')
const { NOMBRE_COOKIE, crearTokenSesion } = await import('@/lib/infraestructura/acceso-publico')
const { NOMBRE_COOKIE_SESION_VERIFICACION, crearSesionVerificacion } = await import(
  '@/lib/infraestructura/verificacion-sesion'
)

// Base Hub (verificaciones) y base GE (contexto de la escuela) aisladas en un
// tmpdir, como el resto de los tests de infraestructura. getDb() cachea el
// cliente, así que el directorio se fija una sola vez para todo el archivo.
let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'parte-page-'))
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
  // La página resuelve la escuela en el servidor y el estado actual lo pide el
  // componente cliente: con una promesa pendiente se queda en la fase de carga
  // y el test no depende de la API.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function conCookieDeAccesoPublico() {
  const { token } = crearTokenSesion()
  cookiesGetMock.mockImplementation((nombre: string) =>
    nombre === NOMBRE_COOKIE ? { value: token } : undefined,
  )
}

function conCookieDeSesionVerificacion(valorCookie: string) {
  cookiesGetMock.mockImplementation((nombre: string) =>
    nombre === NOMBRE_COOKIE_SESION_VERIFICACION ? { value: valorCookie } : undefined,
  )
}

// Cada caso usa un CUE propio: infra_parte tiene índice único (cueAnexo,
// periodoId) y todos los tests comparten el período sembrado.
let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  // Formato real de CUE-anexo (7 dígitos, guion, 2 dígitos): resolverContexto
  // valida el formato del link antes de buscar la escuela.
  return `1801604-${String(contadorCue).padStart(2, '0')}`
}

async function verificacionConSesion() {
  const cueAnexo = cueUnico()
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
  return {
    token: creada.token,
    verificacion: creada.verificacion,
    cueAnexo,
    valorCookie,
  }
}

async function seedEscuela(cueAnexo: string, nombre: string) {
  const client = openGeDb()
  try {
    await ensureGeSchema(client)
    await client.execute(
      "INSERT OR IGNORE INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente')",
    )
    await client.execute({
      sql: `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon, geo_calidad)
            VALUES (?, NULL, ?, 'Entre Rios', 'Parana', NULL, NULL, NULL)
            ON CONFLICT(cue_anexo) DO UPDATE SET nombre = excluded.nombre`,
      args: [cueAnexo, nombre],
    })
  } finally {
    client.close()
  }
}

describe('EstadoActualPartePage — acceso por sesión de verificación', () => {
  it('sesión canjeada válida para el CUE de la query: renderiza el estado, no el ingreso', async () => {
    const { cueAnexo, valorCookie } = await verificacionConSesion()
    await seedEscuela(cueAnexo, 'Escuela Verificada')
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await EstadoActualPartePage({ searchParams: Promise.resolve({ cue: cueAnexo }) })
    render(jsx)

    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
    expect(screen.getByText('Escuela Verificada')).toBeInTheDocument()
  })

  it('la misma sesión con OTRO CUE: no abre el CUE ajeno, muestra el ingreso', async () => {
    const { valorCookie } = await verificacionConSesion()
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await EstadoActualPartePage({
      searchParams: Promise.resolve({ cue: '1801605-99' }),
    })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
  })

  it('sesión cuya verificación fue revocada: muestra el ingreso', async () => {
    const { cueAnexo, valorCookie, verificacion } = await verificacionConSesion()
    await seedEscuela(cueAnexo, 'Escuela Revocada')
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await EstadoActualPartePage({ searchParams: Promise.resolve({ cue: cueAnexo }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela Revocada')).toBeNull()
  })

  it('sesión cuya verificación ya fue respondida: muestra el ingreso', async () => {
    const { cueAnexo, valorCookie, token, verificacion } = await verificacionConSesion()
    await seedEscuela(cueAnexo, 'Escuela Respondida')
    const respuesta = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(respuesta.ok).toBe(true)
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await EstadoActualPartePage({ searchParams: Promise.resolve({ cue: cueAnexo }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela Respondida')).toBeNull()
  })

  it('la verificación cancelada también deniega el acceso', async () => {
    const { cueAnexo, valorCookie, verificacion } = await verificacionConSesion()
    await seedEscuela(cueAnexo, 'Escuela Cancelada')
    await cancelarVerificacion({
      verificacionId: verificacion.id,
      actorUserId: 'user-admin',
    })
    conCookieDeSesionVerificacion(valorCookie)

    const jsx = await EstadoActualPartePage({ searchParams: Promise.resolve({ cue: cueAnexo }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
  })

  it('regresión: la contraseña compartida sigue abriendo la página', async () => {
    await seedEscuela('1801605-04', 'Escuela de Siempre')
    conCookieDeAccesoPublico()

    const jsx = await EstadoActualPartePage({
      searchParams: Promise.resolve({ cue: '1801605-04' }),
    })
    render(jsx)

    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
    expect(screen.getByText('Escuela de Siempre')).toBeInTheDocument()
  })
})
