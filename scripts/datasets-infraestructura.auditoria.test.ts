import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { comandoAtomicoAuditado } from '@/lib/infraestructura/auditoria/servidor'
import { guardarVersion, leerVersion, listarVersiones, publicarVersion } from '@/lib/infraestructura/datasets/repositorio'
import type { EntradaVersion } from '@/lib/infraestructura/datasets/codec'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'

// El CLI scripts/datasets-infraestructura.mjs exige DATABASE_URL (Postgres): aquí se ejercen
// sus comandos a través de comandoAtomicoAuditado sobre PGlite, con las mismas funciones del repositorio.
usarDbTemporal('datasets-auditoria', { seed: false, env: { DATABASE_URL: undefined, INFRA_AUDIT_OPERATOR: undefined } })
beforeAll(() => migrarDb())

const entrada = (id: string): EntradaVersion => ({
  datasetId: id, nombre: 'Prueba auditada', revision: 'v1', fuente: 'fuente pública', formato: 'array', clave: 'id',
  datos: [{ id: 'uno', valor: 1 }],
})
const eventosDe = (accion: string) => getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.accion, accion))

describe('scripts/datasets-infraestructura.mjs: comandos atómicos auditados', () => {
  it('importar guarda la versión y su evento en la misma transacción, con dataset y versión en metadatos', async () => {
    const id = await comandoAtomicoAuditado('importar', () => guardarVersion(entrada('datos-importados')))

    const [evento] = await eventosDe('dataset.importar')
    expect(evento).toMatchObject({ objetoTipo: 'dataset', objetoId: 'datos-importados', resultado: 'exito',
      actorTipo: 'sistema', actorId: 'infra-datasets', viaAcceso: 'cli', metodo: 'CLI', httpStatus: null })
    expect(evento.metadatos).toMatchObject({ datasetId: 'datos-importados', versionId: id })
  })

  it('si el evento no se puede guardar, la versión no queda: la transacción se revierte', async () => {
    await expect(conFalloAuditoria(() => comandoAtomicoAuditado('importar', () => guardarVersion(entrada('datos-sin-evento')))))
      .rejects.toThrow('auditoria_no_disponible')
    expect(await listarVersiones('datos-sin-evento')).toHaveLength(0)
  })

  it('publicar revierte la publicación si el evento falla y la deja hecha cuando el evento se guarda', async () => {
    const id = await guardarVersion(entrada('datos-publicar'), getDb(), false)

    await expect(conFalloAuditoria(() => comandoAtomicoAuditado('publicar', () => publicarVersion('datos-publicar', id))))
      .rejects.toThrow('auditoria_no_disponible')
    expect(await leerVersion('datos-publicar')).toBeNull()

    await comandoAtomicoAuditado('publicar', () => publicarVersion('datos-publicar', id))
    expect((await leerVersion('datos-publicar'))?.version.id).toBe(id)
    const [evento] = await eventosDe('dataset.publicar')
    expect(evento).toMatchObject({ objetoId: 'datos-publicar', resultado: 'exito' })
    expect(evento.metadatos).toMatchObject({ datasetId: 'datos-publicar', versionId: id })
  })

  it('un comando que falla deja evento de error y relanza el error original', async () => {
    await expect(comandoAtomicoAuditado('publicar', () => publicarVersion('datos-publicar', 'no-existe')))
      .rejects.toThrow('Versión inexistente para el dataset')
    const [evento] = (await eventosDe('dataset.publicar')).filter(fila => fila.resultado === 'error')
    expect(evento).toMatchObject({ objetoId: 'datos-publicar', resultado: 'error' })
  })
})
