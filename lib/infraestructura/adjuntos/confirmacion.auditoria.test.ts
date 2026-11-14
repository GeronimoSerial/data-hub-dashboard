import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, infraAdjunto, infraMovimiento, infraParte, infraPeriodo } from '@/lib/db/schema'
import { cambioAuditado } from '@/lib/infraestructura/auditoria/servidor'
import { contextoAuditoria, type ContextoAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { headAttachmentObject } from './obs'
import { confirmarAdjunto } from './confirmacion'

vi.mock('./obs', () => ({
  getObsBucket: () => 'bucket',
  headAttachmentObject: vi.fn(),
  ObsObjectMissingError: class ObsObjectMissingError extends Error {},
}))

const FECHA = '2026-10-15T12:00:00.000Z'
const CUE = '060000400'
const MOVIMIENTO = '11111111-1111-4111-8111-111111111111'
const ADJUNTO = '22222222-2222-4222-8222-222222222222'
const ETAG_O = 'abc123'
const ETAG_M = 'def456'

usarDbTemporal('confirmacion-auditoria', { seed: false })

function contexto(): ContextoAuditoria {
  return {
    id: randomUUID(), requestId: randomUUID(), ocurridoEn: new Date(), inicio: performance.now(),
    accion: 'foto.confirmar', metodo: 'POST', rutaPlantilla: '/prueba', actorTipo: 'anonimo', actorId: null,
    actorRol: null, viaAcceso: 'prueba', persistido: false, fallo: false,
  }
}

const entrada = { attachmentId: ADJUNTO, movimientoId: MOVIMIENTO, optimizadaEtag: ETAG_O, miniaturaEtag: ETAG_M }

async function estado() {
  const [fila] = await getDb().select().from(infraAdjunto).where(eq(infraAdjunto.id, ADJUNTO))
  return fila.estado
}

beforeAll(async () => {
  await migrarDb()
  const db = getDb()
  await db.insert(infraPeriodo).values({ id: 'periodo-confirmacion-lib', nombre: 'Periodo', inicioEn: FECHA, estado: 'vigente', creadaEn: FECHA })
  await db.insert(infraParte).values({
    id: 'parte-confirmacion-lib', periodoId: 'periodo-confirmacion-lib', cueAnexo: CUE, estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: FECHA, corteId: 1, creadaEn: FECHA, actualizadaEn: FECHA,
  })
  await db.insert(infraMovimiento).values({
    id: MOVIMIENTO, parteId: 'parte-confirmacion-lib', tipo: 'evidencia_fotografica', rol: 'director',
    resumen: {}, rigeDesde: FECHA, creadaEn: FECHA,
  })
  await db.insert(infraAdjunto).values({
    id: ADJUNTO, movimientoId: MOVIMIENTO,
    optimizadaObsKey: 'k/optimizada.jpg', optimizadaSize: 1024, optimizadaContentType: 'image/jpeg', optimizadaEtag: null,
    miniaturaObsKey: 'k/miniatura.jpg', miniaturaSize: 256, miniaturaContentType: 'image/jpeg', miniaturaEtag: null,
    estado: 'pending', creadaPor: 'public-parte',
  })
})

beforeEach(async () => {
  await getDb().update(infraAdjunto).set({ estado: 'pending', optimizadaEtag: null, miniaturaEtag: null }).where(eq(infraAdjunto.id, ADJUNTO))
  vi.mocked(headAttachmentObject).mockImplementation(async (_bucket, key) => key === 'k/optimizada.jpg'
    ? { size: 1024, contentType: 'image/jpeg', etag: ETAG_O }
    : { size: 256, contentType: 'image/jpeg', etag: ETAG_M })
})

describe('confirmación de adjuntos y auditoría', () => {
  it('verifica los objetos OBS antes de abrir la transacción de escritura', async () => {
    const orden: string[] = []
    vi.mocked(headAttachmentObject).mockImplementation(async (_bucket, key) => {
      orden.push('head')
      return key === 'k/optimizada.jpg'
        ? { size: 1024, contentType: 'image/jpeg', etag: ETAG_O }
        : { size: 256, contentType: 'image/jpeg', etag: ETAG_M }
    })
    const resultado = await confirmarAdjunto(entrada, async (ejecutar) => {
      orden.push('transaccion')
      return ejecutar()
    })
    expect(resultado.ok).toBe(true)
    expect(orden).toEqual(['head', 'head', 'transaccion'])
  })

  it('si el evento no se guarda, la confirmación se revierte y el adjunto queda pendiente', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(contextoAuditoria.run(contexto(), () => conFalloAuditoria(() => confirmarAdjunto(entrada, cambioAuditado))))
      .rejects.toThrow('auditoria_no_disponible')
    expect(await estado()).toBe('pending')
  })

  it('con evento guardado, la confirmación y el evento quedan juntos', async () => {
    const ctx = contexto()
    const resultado = await contextoAuditoria.run(ctx, () => confirmarAdjunto(entrada, cambioAuditado))
    expect(resultado).toMatchObject({ ok: true, repetido: false })
    expect(await estado()).toBe('confirmed')
    const [evento] = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, ctx.requestId))
    expect(evento).toBeDefined()
  })
})
