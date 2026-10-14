// Tests de integración de los enlaces compartidos del veredicto contra la base
// real aislada en un tmpdir (mismo patrón que repositorio.test.ts).
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { infraVeredictoEnlace } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import {
  crearEnlace,
  resolverEnlace,
  revocarEnlacesDelDia,
  venceEnFinDelDiaArt,
} from './enlaces'

usarDbTemporal('veredicto-enlaces')

beforeEach(async () => {
  await getDb().delete(infraVeredictoEnlace)
})

// 2026-10-12 12:00 ART = 15:00Z
const AHORA = new Date('2026-10-12T15:00:00.000Z')

describe('venceEnFinDelDiaArt', () => {
  it('devuelve 23:59:59.999 ART del día civil, es decir 02:59:59.999Z del día siguiente', () => {
    expect(venceEnFinDelDiaArt(AHORA)).toBe('2026-10-13T02:59:59.999Z')
  })

  it('un instante de madrugada ART (00:30 ART) sigue en el mismo día civil', () => {
    expect(venceEnFinDelDiaArt(new Date('2026-10-12T03:30:00.000Z'))).toBe('2026-10-13T02:59:59.999Z')
  })
})

describe('crearEnlace', () => {
  it('devuelve un token base64url de 32 bytes y vence al fin del día ART', async () => {
    const { token, venceEn } = await crearEnlace(getDb(), {
      desde: '2026-10-05',
      hasta: '2026-10-12',
      creadoPor: 'user-1',
      ahora: AHORA,
    })
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(venceEn).toBe('2026-10-13T02:59:59.999Z')
  })

  it('guarda solo el hash sha256 del token, nunca el token en claro', async () => {
    const { token } = await crearEnlace(getDb(), {
      desde: '2026-10-05',
      hasta: '2026-10-12',
      creadoPor: 'user-1',
      ahora: AHORA,
    })
    const filas = await getDb().select().from(infraVeredictoEnlace)
    expect(filas).toHaveLength(1)
    const hashEsperado = createHash('sha256').update(token).digest('hex')
    expect(filas[0]!.tokenHash).toBe(hashEsperado)
    expect(JSON.stringify(filas[0])).not.toContain(token)
    expect(filas[0]!.creadoPor).toBe('user-1')
    expect(filas[0]!.fechaDesde).toBe('2026-10-05')
    expect(filas[0]!.fechaHasta).toBe('2026-10-12')
  })
})

describe('resolverEnlace', () => {
  it('válido dentro de la ventana, con el rango del enlace', async () => {
    const { token, venceEn } = await crearEnlace(getDb(), {
      desde: '2026-10-05',
      hasta: '2026-10-12',
      creadoPor: 'user-1',
      ahora: AHORA,
    })
    expect(await resolverEnlace(getDb(), token, AHORA)).toEqual({
      estado: 'valido',
      desde: '2026-10-05',
      hasta: '2026-10-12',
      venceEn,
    })
  })

  it('sigue válido a 23:59:59 ART (02:59:59Z del día siguiente)', async () => {
    const { token } = await crearEnlace(getDb(), {
      desde: '2026-10-05',
      hasta: '2026-10-12',
      creadoPor: 'user-1',
      ahora: AHORA,
    })
    const estado = await resolverEnlace(getDb(), token, new Date('2026-10-13T02:59:59.000Z'))
    expect(estado.estado).toBe('valido')
  })

  it('vencido a 00:00 ART del día siguiente (03:00Z)', async () => {
    const { token, venceEn } = await crearEnlace(getDb(), {
      desde: '2026-10-05',
      hasta: '2026-10-12',
      creadoPor: 'user-1',
      ahora: AHORA,
    })
    expect(await resolverEnlace(getDb(), token, new Date('2026-10-13T03:00:00.000Z'))).toEqual({
      estado: 'vencido',
      venceEn,
    })
  })

  it('revocado gana sobre vencido', async () => {
    const { token } = await crearEnlace(getDb(), {
      desde: '2026-10-05',
      hasta: '2026-10-12',
      creadoPor: 'user-1',
      ahora: AHORA,
    })
    await revocarEnlacesDelDia(getDb(), { revocadoPor: 'admin-1', ahora: AHORA })
    expect(await resolverEnlace(getDb(), token, new Date('2026-10-14T12:00:00.000Z'))).toEqual({
      estado: 'revocado',
    })
  })

  it('inexistente para un token desconocido', async () => {
    expect(await resolverEnlace(getDb(), 'token-que-no-existe', AHORA)).toEqual({
      estado: 'inexistente',
    })
  })
})

describe('revocarEnlacesDelDia', () => {
  it('revoca solo los enlaces no revocados que vencen al fin del día ART indicado', async () => {
    await crearEnlace(getDb(), { desde: '2026-10-05', hasta: '2026-10-12', creadoPor: 'u', ahora: AHORA })
    await crearEnlace(getDb(), { desde: '2026-10-05', hasta: '2026-10-12', creadoPor: 'u', ahora: AHORA })
    await crearEnlace(getDb(), {
      desde: '2026-10-01',
      hasta: '2026-10-11',
      creadoPor: 'u',
      ahora: new Date('2026-10-11T15:00:00.000Z'),
    })

    expect(await revocarEnlacesDelDia(getDb(), { revocadoPor: 'admin-1', ahora: AHORA })).toBe(2)
    expect(await revocarEnlacesDelDia(getDb(), { revocadoPor: 'admin-1', ahora: AHORA })).toBe(0)

    const filas = await getDb().select().from(infraVeredictoEnlace)
    const revocadas = filas.filter((f) => f.revocadoEn !== null)
    expect(revocadas).toHaveLength(2)
    expect(revocadas.every((f) => f.revocadoPor === 'admin-1')).toBe(true)
  })
})
