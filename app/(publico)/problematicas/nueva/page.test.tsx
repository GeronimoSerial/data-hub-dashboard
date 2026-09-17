// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'

const CLAVE = claveDePrueba()

const cookiesGetMock = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookiesGetMock }),
}))
// AccesoForm usa useRouter() para refrescar tras loguearse; fuera de un
// request real de Next no hay router montado, así que se mockea igual que
// cookies() de arriba.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// El import de la página tiene que ir después del vi.mock de arriba: next/headers
// no funciona fuera de un request real de Next, así que este test lo mockea
// como hacen los tests de páginas gateadas por cookie de sesión.
const { default: NuevaProblematicaPage } = await import('./page')
const { crearTokenSesion } = await import('@/lib/infraestructura/acceso-publico')

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'contexto-page-'))
  prevDataDir = process.env.DATA_DIR
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.DATA_DIR = dir
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
  cookiesGetMock.mockReset()
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
  rmSync(dir, { recursive: true, force: true })
  document.body.innerHTML = ''
})

function conAcceso() {
  const { token } = crearTokenSesion()
  cookiesGetMock.mockReturnValue({ value: token })
}

async function seedEscuelaConSeccion() {
  const client = openGeDb()
  try {
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente')",
    )
    await client.execute(
      "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', NULL, 'Escuela 4', 'Entre Rios', 'Parana')",
    )
    await client.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'Primario', 'Mañana')",
    )
    await client.execute('INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 900001)')
  } finally {
    client.close()
  }
}

describe('NuevaProblematicaPage', () => {
  it('sin cookie de acceso, muestra la pantalla de ingreso en vez del formulario', async () => {
    await seedEscuelaConSeccion()
    cookiesGetMock.mockReturnValue(undefined)

    const jsx = await NuevaProblematicaPage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.queryByText('Escuela 4')).not.toBeInTheDocument()
  })

  it('con cookie de acceso vigente, muestra la escuela y sus secciones', async () => {
    await seedEscuelaConSeccion()
    conAcceso()

    const jsx = await NuevaProblematicaPage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByText('Escuela 4')).toBeInTheDocument()
    expect(screen.getByText('Mañana')).toBeInTheDocument()
    expect(screen.getByText('Primario')).toBeInTheDocument()
    expect(screen.getByText(/1 "A" — 1 alumnos/)).toBeInTheDocument()
  })

  it('muestra un error claro sin CUE, sin ofrecer alternativas', async () => {
    await seedEscuelaConSeccion()
    conAcceso()

    const jsx = await NuevaProblematicaPage({ searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByText(/no incluye el CUE/i)).toBeInTheDocument()
    expect(screen.queryByText(/1801605/)).not.toBeInTheDocument()
  })

  it('muestra un error claro para un CUE inexistente', async () => {
    await seedEscuelaConSeccion()
    conAcceso()

    const jsx = await NuevaProblematicaPage({ searchParams: Promise.resolve({ cue: '9999999' }) })
    render(jsx)

    expect(screen.getByText(/no encontramos una escuela/i)).toBeInTheDocument()
  })
})
