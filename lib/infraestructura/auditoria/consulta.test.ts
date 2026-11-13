import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { migrarDb, getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { consultaAuditoriaSchema, consultarAuditoria } from './consulta'

usarDbTemporal('consulta-auditoria-', { seed: false })
beforeAll(() => migrarDb())

const T0 = new Date('2026-10-19T12:00:00.000Z')
const T1 = new Date('2026-10-19T12:00:01.000Z')
const T2 = new Date('2026-10-19T12:00:02.000Z')

// La tabla es de solo inserción (trigger): cada prueba aísla sus filas con un actorId propio.
const actor = () => `actor-${randomUUID()}`

function fila(datos: Partial<typeof auditoriaEvento.$inferInsert> & { actorId: string }) {
  return {
    id: randomUUID(),
    requestId: randomUUID(),
    ocurridoEn: T0,
    actorTipo: 'usuario',
    viaAcceso: 'sesion',
    accion: 'parte.guardar',
    metodo: 'POST',
    rutaPlantilla: '/api/prueba',
    resultado: 'exito',
    duracionMs: 1,
    ...datos,
  }
}

async function insertar(filas: ReturnType<typeof fila>[]) {
  await getDb().insert(auditoriaEvento).values(filas)
}

async function recorrer(filtros: Record<string, unknown>) {
  const ids: string[] = []
  let cursor: string | null | undefined
  do {
    const pagina = await consultarAuditoria(consultaAuditoriaSchema.parse({ ...filtros, cursor: cursor ?? undefined }))
    ids.push(...pagina.items.map(e => e.id))
    cursor = pagina.nextCursor
  } while (cursor)
  return ids
}

describe('consultarAuditoria', () => {
  it('ordena por fecha y luego por id, ambos descendentes', async () => {
    const a = actor()
    const viejo = fila({ actorId: a, ocurridoEn: T0 })
    const nuevo = fila({ actorId: a, ocurridoEn: T2 })
    const medio = fila({ actorId: a, ocurridoEn: T1 })
    await insertar([viejo, nuevo, medio])

    const { items } = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: a }))
    expect(items.map(e => e.id)).toEqual([nuevo.id, medio.id, viejo.id])
  })

  it('pagina filas con la misma fecha sin repetir ni omitir ninguna', async () => {
    const a = actor()
    const enT0 = Array.from({ length: 7 }, () => fila({ actorId: a, ocurridoEn: T0 }))
    const enT1 = [fila({ actorId: a, ocurridoEn: T1 }), fila({ actorId: a, ocurridoEn: T1 })]
    await insertar([...enT0, ...enT1, fila({ actorId: actor(), ocurridoEn: T0 })])

    const ids = await recorrer({ actorId: a, limite: 3 })
    const desc = (filas: { id: string }[]) => filas.map(f => f.id).sort().reverse()
    expect(ids).toEqual([...desc(enT1), ...desc(enT0)])
    expect(new Set(ids).size).toBe(9)
  })

  it('nextCursor es null cuando la página no tiene más filas', async () => {
    const a = actor()
    await insertar([fila({ actorId: a }), fila({ actorId: a }), fila({ actorId: a })])

    const exacta = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: a, limite: 3 }))
    expect(exacta.items).toHaveLength(3)
    expect(exacta.nextCursor).toBeNull()

    const parcial = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: a, limite: 2 }))
    expect(parcial.items).toHaveLength(2)
    expect(parcial.nextCursor).not.toBeNull()
  })

  it('aplica cada filtro de igualdad sin mezclar filas de otros valores', async () => {
    const a = actor()
    const objeto = `obj-${randomUUID()}`
    const cue = '1234567-01'
    const buscada = fila({ actorId: a, accion: 'motivo.guardar', resultado: 'rechazado', cueAnexo: cue, objetoId: objeto })
    await insertar([
      buscada,
      fila({ actorId: a, accion: 'motivo.eliminar', resultado: 'exito', cueAnexo: '7654321-00', objetoId: 'otro' }),
    ])

    const porAccion = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: a, accion: 'motivo.guardar' }))
    const porResultado = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: a, resultado: 'rechazado' }))
    const porCue = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: a, cueAnexo: cue }))
    const porObjeto = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: a, objetoId: objeto }))
    for (const pagina of [porAccion, porResultado, porCue, porObjeto]) {
      expect(pagina.items.map(e => e.id)).toEqual([buscada.id])
    }
  })

  it('desde incluye su instante y hasta lo excluye', async () => {
    const a = actor()
    const en0 = fila({ actorId: a, ocurridoEn: T0 })
    const en1 = fila({ actorId: a, ocurridoEn: T1 })
    await insertar([en0, en1])

    const pagina = await consultarAuditoria(consultaAuditoriaSchema.parse({
      actorId: a,
      desde: T0.toISOString(),
      hasta: T1.toISOString(),
    }))
    expect(pagina.items.map(e => e.id)).toEqual([en0.id])
  })

  it('el cursor es opaco y no se puede forjar con una fecha inválida', () => {
    const forjado = Buffer.from(JSON.stringify({ fecha: '2026-10-19T12:00:00.000Z', id: randomUUID(), extra: 1 })).toString('base64url')
    expect(consultaAuditoriaSchema.safeParse({ cursor: forjado }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ cursor: 'invalid' }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ cursor: '' }).success).toBe(false)
  })
})

describe('consultaAuditoriaSchema', () => {
  it('usa 50 como límite por defecto y acota el límite a 1..100', () => {
    expect(consultaAuditoriaSchema.parse({}).limite).toBe(50)
    expect(consultaAuditoriaSchema.safeParse({ limite: 0 }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ limite: 101 }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ limite: 100 }).success).toBe(true)
  })

  it('rechaza fechas sin zona horaria, fechas solo día y rangos vacíos', () => {
    expect(consultaAuditoriaSchema.safeParse({ desde: '2026-10-19T12:00:00' }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ desde: '2026-10-19' }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ hasta: '2026-10-19' }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({
      desde: '2026-10-19T09:00:00-03:00',
      hasta: '2026-10-19T13:00:00Z',
    }).success).toBe(true)
    expect(consultaAuditoriaSchema.safeParse({
      desde: '2026-10-19T12:00:00Z',
      hasta: '2026-10-19T12:00:00Z',
    }).success).toBe(false)
  })

  it('valida los filtros con las mismas reglas de referencia que el escritor', () => {
    expect(consultaAuditoriaSchema.safeParse({ resultado: 'otro' }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ cueAnexo: 'con espacio' }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ actorId: '   ' }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ objetoId: 'con espacio' }).success).toBe(false)
    expect(consultaAuditoriaSchema.safeParse({ accion: 'job.enos-diario' }).success).toBe(true)
    expect(consultaAuditoriaSchema.safeParse({ objetoId: 'x'.repeat(129) }).success).toBe(false)
  })

  it('rechaza parámetros desconocidos', () => {
    expect(consultaAuditoriaSchema.safeParse({ usuario: 'x' }).success).toBe(false)
  })
})
