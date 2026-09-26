// @vitest-environment jsdom
//
// Test de la resolución server-side del nombre de escuela de la página pública
// del enlace de verificación (batch E1). Lo que se prueba NO es el componente
// cliente: `VerificacionResponder` se reemplaza por un stub que expone la prop
// `escuelaNombre` recibida, porque el objeto bajo test es la página async, que
// resuelve el nombre desde GE y cae silenciosamente al CUE si no puede.
//
// Igual que app/problematicas/parte/nuevo/page.test.tsx: DATA_DIR a un tmpdir,
// GE de test aislada con openGeDb/ensureGeSchema, hub real sembrado con
// ensureSeeded() y filas de verificación creadas con la propia máquina de
// estados (crearVerificacion), no con INSERTs inventados.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

// Stub: en vez del componente cliente completo, sólo interesa qué
// `escuelaNombre` (posiblemente undefined) recibe desde el servidor.
vi.mock('@/components/infraestructura/verificacion-responder', () => ({
  VerificacionResponder: (props: {
    verificacionId: string
    token: string
    escuelaNombre?: string
  }) => <div data-testid="responder-nombre">{props.escuelaNombre ?? '__SIN_NOMBRE__'}</div>,
}))

const { default: VerificacionPage } = await import('./page')
const { ensureSeeded } = await import('@/lib/db/seed')
const { ensureGeSchema, openGeDb } = await import('@/lib/infraestructura/ge-db')
const { crearVerificacion } = await import('@/lib/infraestructura/verificaciones')

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'verificacion-page-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
  await ensureSeeded()

  // ensureSeeded() siembra ge_localizacion desde el JSON versionado (miles de
  // escuelas reales). Para que estos tests controlen exactamente qué CUE
  // existe, se vacía y se siembra sólo lo que cada caso necesita.
  const client = openGeDb()
  try {
    await ensureGeSchema(client)
    await client.execute('DELETE FROM ge_localizacion')
  } finally {
    client.close()
  }
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

async function seedGe(cueAnexo: string, nombre: string): Promise<void> {
  const client = openGeDb()
  try {
    await ensureGeSchema(client)
    await client.execute({
      sql: "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES (?, NULL, ?, 'Entre Rios', 'Parana')",
      args: [cueAnexo, nombre],
    })
  } finally {
    client.close()
  }
}

// Mismo mecanismo que los helpers de lib/infraestructura/verificaciones.test.ts:
// crearVerificacion (ancla al período vigente sembrado) para obtener una fila real.
async function verificacionDePrueba(cueAnexo: string): Promise<{ id: string }> {
  const creada = await crearVerificacion({
    cueAnexo,
    solicitadaPorUserId: 'user-director',
  })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada.verificacion
}

async function renderPagina(
  verificacionId: string,
  searchParams: { token?: string } = { token: 'token-de-prueba' },
) {
  const jsx = await VerificacionPage({
    params: Promise.resolve({ id: verificacionId }),
    searchParams: Promise.resolve(searchParams),
  })
  render(jsx)
}

describe('VerificacionPage — nombre de escuela desde GE', () => {
  it('con GE sembrada para el CUE de la verificación, llega el nombre como escuelaNombre', async () => {
    const cue = '1801605-01'
    await seedGe(cue, 'Escuela Primaria N° 1')
    const verificacion = await verificacionDePrueba(cue)

    await renderPagina(verificacion.id)

    expect(screen.getByTestId('responder-nombre')).toHaveTextContent('Escuela Primaria N° 1')
  })

  it('sin GE para ese CUE, la página renderiza igual y escuelaNombre queda undefined', async () => {
    const cue = '1801605-02'
    // No se siembra ninguna fila de ge_localizacion para este CUE.
    const verificacion = await verificacionDePrueba(cue)

    await renderPagina(verificacion.id)

    const responder = screen.getByTestId('responder-nombre')
    expect(responder).toHaveTextContent('__SIN_NOMBRE__')
    // No se inventa un nombre: el fallback al CUE lo maneja el cliente.
    expect(responder).not.toHaveTextContent(cue)
  })

  it('resuelve SÓLO el CUE de esta verificación: la escuela de otro CUE nunca aparece', async () => {
    const cuePropio = '1801605-03'
    const cueAjeno = '1801605-99'
    await seedGe(cuePropio, 'Escuela Propia')
    await seedGe(cueAjeno, 'Escuela Ajena')
    const verificacion = await verificacionDePrueba(cuePropio)

    await renderPagina(verificacion.id)

    const responder = screen.getByTestId('responder-nombre')
    expect(responder).toHaveTextContent('Escuela Propia')
    expect(responder).not.toHaveTextContent('Escuela Ajena')
  })

  it('sin token muestra el aviso y no renderiza el responder', async () => {
    const cue = '1801605-04'
    await seedGe(cue, 'Escuela Sin Token')
    const verificacion = await verificacionDePrueba(cue)

    await renderPagina(verificacion.id, {})

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Este enlace no incluye la credencial de acceso.',
    )
    expect(screen.queryByTestId('responder-nombre')).toBeNull()
  })
})
