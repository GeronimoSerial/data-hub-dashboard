import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { infraAdjunto, infraMovimiento, infraParte, infraPeriodo } from '@/lib/db/schema'
import { cambioAuditado } from '@/lib/infraestructura/auditoria/servidor'
import { contextoAuditoria, type ContextoAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { crearEvidenciaFotografica } from './evidencia-fotografica'

vi.mock('@/lib/infraestructura/acceso-parte', () => ({
  tieneAccesoAlParteParaCue: vi.fn(async () => true),
}))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}))

const MOMENTO = '2026-10-15T12:00:00.000Z'
const BASE = 'evidencia-auditoria-base'
const CLAVE = 'evidencia-auditoria-clave'

usarDbTemporal('evidencia-fotografica-auditoria', { seed: false })

function contexto(): ContextoAuditoria {
  return {
    id: randomUUID(), requestId: randomUUID(), ocurridoEn: new Date(), inicio: performance.now(),
    accion: 'foto.confirmar', metodo: 'POST', rutaPlantilla: '/prueba', actorTipo: 'anonimo', actorId: null,
    actorRol: null, viaAcceso: 'prueba', persistido: false, fallo: false,
  }
}

function entrada(clave: string, ids: string[]) {
  return {
    movimientoBaseId: BASE,
    idempotencyKey: clave,
    fotos: ids.map(attachmentId => ({
      attachmentId,
      optimizadaSize: 1000,
      optimizadaContentType: 'image/webp' as const,
      miniaturaSize: 200,
      miniaturaContentType: 'image/webp' as const,
    })),
  }
}

async function contarEvidencias(clave: string) {
  return getDb().select().from(infraMovimiento).where(eq(infraMovimiento.idempotencyKey, clave))
}

beforeAll(async () => {
  await migrarDb()
  const db = getDb()
  await db.insert(infraPeriodo).values({ id: 'periodo-evidencia-auditoria', nombre: 'Periodo', inicioEn: MOMENTO, estado: 'vigente', creadaEn: MOMENTO })
  await db.insert(infraParte).values({
    id: 'parte-evidencia-auditoria', periodoId: 'periodo-evidencia-auditoria', cueAnexo: '060000500',
    estadoEstablecimiento: 'habitual', estadoEstablecimientoRigeDesde: MOMENTO, corteId: 1, creadaEn: MOMENTO, actualizadaEn: MOMENTO,
  })
  await db.insert(infraMovimiento).values({
    id: BASE, parteId: 'parte-evidencia-auditoria', tipo: 'actualizacion', rol: 'director',
    resumen: {}, rigeDesde: MOMENTO, creadaEn: MOMENTO,
  })
})

describe('evidencia fotográfica dentro de la transacción auditada', () => {
  it('si el evento no se guarda, no queda movimiento ni adjuntos de la evidencia', async () => {
    const ids = [randomUUID()]
    await expect(contextoAuditoria.run(contexto(), () => conFalloAuditoria(() =>
      cambioAuditado(() => crearEvidenciaFotografica(new Request('https://example.test'), entrada(CLAVE, ids)))),
    )).rejects.toThrow('auditoria_no_disponible')
    expect(await contarEvidencias(CLAVE)).toHaveLength(0)
    expect(await getDb().select().from(infraAdjunto).where(eq(infraAdjunto.id, ids[0]))).toHaveLength(0)
  })

  it('con evento guardado, la evidencia y sus adjuntos quedan creados', async () => {
    const ids = [randomUUID()]
    const ctx = contexto()
    const resultado = await contextoAuditoria.run(ctx, () => cambioAuditado(
      () => crearEvidenciaFotografica(new Request('https://example.test'), entrada(CLAVE, ids)),
    ))
    expect(resultado.repetido).toBe(false)
    expect(await contarEvidencias(CLAVE)).toHaveLength(1)
    expect(await getDb().select().from(infraAdjunto).where(eq(infraAdjunto.id, ids[0]))).toHaveLength(1)
  })
})
