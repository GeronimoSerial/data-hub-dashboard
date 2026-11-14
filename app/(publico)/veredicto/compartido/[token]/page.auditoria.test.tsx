import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { crearEnlace } from '@/lib/infraestructura/veredicto/enlaces'
import PaginaVeredictoCompartido from './page'

vi.mock('@/lib/infraestructura/veredicto/eventos-terreno', () => ({ cargarEventosTerreno: vi.fn(async () => []) }))

usarDbTemporal('veredicto-compartido-pagina-auditoria-')

const RUTA = '/veredicto/compartido/[token]'

function pagina(token: string) {
  return PaginaVeredictoCompartido({ params: Promise.resolve({ token }) })
}

async function eventosDeConsulta() {
  return getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.accion, 'enlace.consultar'))
}

/** Ejecuta la página y devuelve solo el evento que dejó esa apertura. */
async function abrirYLeerEvento(token: string) {
  const antes = (await eventosDeConsulta()).length
  await pagina(token)
  const nuevos = (await eventosDeConsulta()).slice(antes)
  expect(nuevos).toHaveLength(1)
  return nuevos[0]!
}

describe('auditoría de la página del veredicto compartido', () => {
  it('abrir un enlace vigente deja un evento enlace.consultar sin token', async () => {
    const { token } = await crearEnlace(getDb(), { id: 'enlace-pagina-1', desde: '2026-10-01', hasta: '2026-10-05', creadoPor: 'admin-1' })

    const evento = await abrirYLeerEvento(token)
    expect(evento).toMatchObject({
      accion: 'enlace.consultar',
      rutaPlantilla: RUTA,
      metodo: 'GET',
      actorTipo: 'enlace',
      actorId: 'enlace-pagina-1',
      viaAcceso: 'enlace',
      objetoTipo: 'enlace_veredicto',
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(JSON.stringify(evento)).not.toContain(token)
  })

  it('un token inexistente deja un rechazo y no muestra datos', async () => {
    const evento = await abrirYLeerEvento('token-que-no-existe')
    expect(evento).toMatchObject({ actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 200 })
    expect(JSON.stringify(evento)).not.toContain('token-que-no-existe')
  })

  it('si no se puede registrar la auditoría no se muestra la página', async () => {
    const { token } = await crearEnlace(getDb(), { desde: '2026-10-01', hasta: '2026-10-05', creadoPor: 'admin-1' })

    const antes = await getDb().select().from(auditoriaEvento)

    await expect(conFalloAuditoria(() => pagina(token))).rejects.toThrow('auditoria_no_disponible')
    expect(await getDb().select().from(auditoriaEvento)).toHaveLength(antes.length)
  })
})
