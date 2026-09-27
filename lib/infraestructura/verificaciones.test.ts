// Tests de la máquina de estados de verificaciones (batch E1) contra la base
// de test real, mismo patrón que lib/db/seed.test.ts: DATA_DIR a un tmpdir,
// ensureSeeded() una vez y getDb() memoizado. La base es un archivo por
// worker de vitest, así que cada archivo de test arranca limpio.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { and, count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import {
  infraAfectacion,
  infraMovimiento,
  infraParte,
  infraPeriodo,
  infraVerificacion,
  infraVerificacionEvento,
} from '@/lib/db/schema'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { hashearToken } from '@/lib/infraestructura/verificacion-token'
import {
  cancelarVerificacion,
  crearVerificacion,
  listarVerificaciones,
  obtenerVerificacion,
  registrarIntentoVinculoFallido,
  responderAsistida,
  responderPorEnlace,
  validarCredencial,
  verificacionHabilitaSesionEscritura,
} from './verificaciones'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'verificaciones-e1-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

// CUE único por test: infra_parte tiene índice único (cueAnexo, periodoId) y
// todos los tests comparten el período sembrado.
let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801605-${String(contadorCue).padStart(3, '0')}`
}

// Marca el único período sembrado como 'historico' para ejercitar el camino
// "sin período vigente" y lo restaura al terminar: el resto de los tests del
// archivo comparte la misma base y necesita el período vigente sembrado.
async function sinPeriodoVigente(): Promise<() => Promise<void>> {
  const db = getDb()
  await db
    .update(infraPeriodo)
    .set({ estado: 'historico' })
    .where(eq(infraPeriodo.id, PERIODO_ENOS_2026_2027_ID))
  return async () => {
    await db
      .update(infraPeriodo)
      .set({ estado: 'vigente' })
      .where(eq(infraPeriodo.id, PERIODO_ENOS_2026_2027_ID))
  }
}

// Inserta un parte del período vigente con una afectación vigente (retiradaEn
// null) para el CUE dado: es la condición que dispara discrepancia.
async function parteConAfectacionVigente(cueAnexo: string): Promise<string> {
  const db = getDb()
  const ahora = new Date().toISOString()
  const parteId = randomUUID()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId: 1,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  await db.insert(infraAfectacion).values({
    id: randomUUID(),
    parteId,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    rigeDesde: ahora,
    creadaEn: ahora,
  })
  return parteId
}

async function crearMovimiento(parteId: string): Promise<string> {
  const db = getDb()
  const ahora = new Date().toISOString()
  const id = randomUUID()
  await db.insert(infraMovimiento).values({
    id,
    parteId,
    tipo: 'reporte_inicial',
    rol: 'director',
    resumen: {},
    rigeDesde: ahora,
    creadaEn: ahora,
    idempotencyKey: null,
  })
  return id
}

async function contarEventos(verificacionId: string, tipo?: string): Promise<number> {
  const db = getDb()
  const where = tipo
    ? and(
        eq(infraVerificacionEvento.verificacionId, verificacionId),
        eq(infraVerificacionEvento.tipo, tipo),
      )
    : eq(infraVerificacionEvento.verificacionId, verificacionId)
  const [fila] = await db.select({ n: count() }).from(infraVerificacionEvento).where(where)
  return fila.n
}

async function verificacionPendiente(cueAnexo = cueUnico()) {
  const creada = await crearVerificacion({
    cueAnexo,
    solicitadaPorUserId: 'user-director',
  })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

describe('crearVerificacion', () => {
  it('emite token en claro una sola vez y persiste sólo el hash', async () => {
    const creada = await crearVerificacion({
      cueAnexo: cueUnico(),
      solicitadaPorUserId: 'user-director',
    })

    expect(creada.ok).toBe(true)
    if (!creada.ok) return
    expect(creada.token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(creada.verificacion.estado).toBe('pendiente')
    expect(creada.verificacion.periodoId).toBe(PERIODO_ENOS_2026_2027_ID)
    expect(creada.verificacion.discrepancia).toBe(false)
    expect(creada.verificacion.tokenHash).toBe(hashearToken(creada.token))
    expect(creada.verificacion.tokenHash).not.toBe(creada.token)
    expect(creada.verificacion.tokenConsumidoEn).toBeNull()
    expect(creada.verificacion.vencimientoEn).toBeNull()

    const eventos = await contarEventos(creada.verificacion.id, 'creada')
    expect(eventos).toBe(1)
  })

  it('409 cuando no hay período vigente', async () => {
    const restaurar = await sinPeriodoVigente()
    try {
      const creada = await crearVerificacion({
        cueAnexo: cueUnico(),
        solicitadaPorUserId: 'user-director',
      })
      expect(creada).toEqual({ ok: false, status: 409, motivo: 'sin_periodo_vigente' })
    } finally {
      await restaurar()
    }
  })

  it('no reemplaza verificaciones anteriores del mismo CUE', async () => {
    const cue = cueUnico()
    const primera = await verificacionPendiente(cue)
    const segunda = await verificacionPendiente(cue)

    expect(segunda.verificacion.id).not.toBe(primera.verificacion.id)
    const delCue = await listarVerificaciones({ cueAnexo: cue })
    expect(delCue).toHaveLength(2)
  })
})

describe('responderPorEnlace', () => {
  it('sin afectación vigente: responde, discrepancia 0 y un solo evento respondida', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const resultado = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.verificacion.estado).toBe('respondida')
    expect(resultado.verificacion.resultado).toBe('sin_afectacion')
    expect(resultado.verificacion.discrepancia).toBe(false)
    expect(resultado.verificacion.respondidaCanal).toBe('enlace')
    expect(resultado.verificacion.respondidaPorUserId).toBeNull()
    expect(resultado.verificacion.tokenConsumidoEn).not.toBeNull()
    expect(await contarEventos(verificacion.id, 'respondida')).toBe(1)
    expect(await contarEventos(verificacion.id, 'discrepancia_detectada')).toBe(0)
  })

  it('con afectación vigente: discrepancia 1 y dos eventos (respondida + discrepancia_detectada)', async () => {
    const cue = cueUnico()
    await parteConAfectacionVigente(cue)
    const { token, verificacion } = await verificacionPendiente(cue)

    const resultado = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.verificacion.discrepancia).toBe(true)
    expect(await contarEventos(verificacion.id, 'respondida')).toBe(1)
    expect(await contarEventos(verificacion.id, 'discrepancia_detectada')).toBe(1)
  })

  it('con_afectacion guarda el movimientoId y no marca discrepancia', async () => {
    const cue = cueUnico()
    const parteId = await parteConAfectacionVigente(cue)
    const movimientoId = await crearMovimiento(parteId)
    const { token, verificacion } = await verificacionPendiente(cue)

    const resultado = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'con_afectacion',
      movimientoId,
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.verificacion.movimientoId).toBe(movimientoId)
    expect(resultado.verificacion.discrepancia).toBe(false)
  })

  it('con_afectacion con un movimiento de OTRO CUE: 409 movimiento_cue_no_coincide y no vincula', async () => {
    const cueA = cueUnico()
    const cueB = cueUnico()
    const parteB = await parteConAfectacionVigente(cueB)
    const movimientoAjeno = await crearMovimiento(parteB)
    const { token, verificacion } = await verificacionPendiente(cueA)

    const resultado = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'con_afectacion',
      movimientoId: movimientoAjeno,
    })

    expect(resultado).toEqual({ ok: false, status: 409, motivo: 'movimiento_cue_no_coincide' })
    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.movimientoId).toBeNull()
  })

  it('con_afectacion sin movimientoId es un error de programación del caller', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await expect(
      responderPorEnlace({
        verificacionId: verificacion.id,
        token,
        resultado: 'con_afectacion',
      }),
    ).rejects.toThrow('con_afectacion requiere movimientoId')
  })

  it('token incorrecto: 403 y no cambia el estado', async () => {
    const { verificacion } = await verificacionPendiente()

    const resultado = await responderPorEnlace({
      verificacionId: verificacion.id,
      token: 'token-invalido',
      resultado: 'sin_afectacion',
    })

    expect(resultado).toEqual({ ok: false, status: 403, motivo: 'credencial_invalida' })
    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.tokenConsumidoEn).toBeNull()
  })

  it('credencial revocada: 410', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))

    const resultado = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(resultado).toEqual({ ok: false, status: 410, motivo: 'credencial_revocada' })
  })

  it('credencial vencida: 410', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await getDb()
      .update(infraVerificacion)
      .set({ tokenExpiraEn: '2020-01-01T00:00:00.000Z' })
      .where(eq(infraVerificacion.id, verificacion.id))

    const resultado = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(resultado).toEqual({ ok: false, status: 410, motivo: 'credencial_vencida' })
  })

  it('mismo resultado dos veces: replay idempotente sin segundo evento', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const primera = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    const segunda = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })

    expect(primera.ok).toBe(true)
    expect(segunda.ok).toBe(true)
    if (!segunda.ok) return
    expect(segunda.replay).toBe(true)
    expect(await contarEventos(verificacion.id, 'respondida')).toBe(1)
  })

  it('resultado distinto la segunda vez: 409 respuesta_contradictoria', async () => {
    const { token, verificacion } = await verificacionPendiente()

    await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    const segunda = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'no_disponible',
    })

    expect(segunda).toEqual({ ok: false, status: 409, motivo: 'respuesta_contradictoria' })
  })

  it('verificación inexistente: 404', async () => {
    const resultado = await responderPorEnlace({
      verificacionId: randomUUID(),
      token: 'cualquiera',
      resultado: 'sin_afectacion',
    })
    expect(resultado).toEqual({ ok: false, status: 404, motivo: 'no_existe' })
  })
})

describe('cancelarVerificacion', () => {
  it('cancela una pendiente y deja evento cancelada', async () => {
    const { verificacion } = await verificacionPendiente()

    const resultado = await cancelarVerificacion({
      verificacionId: verificacion.id,
      actorUserId: 'user-admin',
      motivo: 'Pedido duplicado',
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.verificacion.estado).toBe('cancelada')
    expect(resultado.verificacion.canceladaPorUserId).toBe('user-admin')
    expect(resultado.verificacion.motivoCancelacion).toBe('Pedido duplicado')
    expect(await contarEventos(verificacion.id, 'cancelada')).toBe(1)
  })

  it('segunda cancelación: 409 ya_cancelada', async () => {
    const { verificacion } = await verificacionPendiente()
    await cancelarVerificacion({ verificacionId: verificacion.id, actorUserId: 'user-admin' })

    const segunda = await cancelarVerificacion({
      verificacionId: verificacion.id,
      actorUserId: 'user-admin',
    })
    expect(segunda).toEqual({ ok: false, status: 409, motivo: 'ya_cancelada' })
  })

  it('no se puede cancelar una ya respondida: 409 ya_respondida', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await responderPorEnlace({ verificacionId: verificacion.id, token, resultado: 'sin_afectacion' })

    const resultado = await cancelarVerificacion({
      verificacionId: verificacion.id,
      actorUserId: 'user-admin',
    })
    expect(resultado).toEqual({ ok: false, status: 409, motivo: 'ya_respondida' })
  })

  it('no se puede responder una cancelada: 409 solicitud_cancelada', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await cancelarVerificacion({ verificacionId: verificacion.id, actorUserId: 'user-admin' })

    const resultado = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(resultado).toEqual({ ok: false, status: 409, motivo: 'solicitud_cancelada' })
  })

  // Carrera real sobre la MISMA verificación pendiente: cancelar y responder
  // arrancan en paralelo. Ambas transiciones escriben con un UPDATE
  // condicionado a `estado = 'pendiente'`, así que exactamente una gana; la
  // otra debe informarse como conflicto y el estado final tiene que ser
  // EXACTAMENTE uno de los dos válidos, nunca ambos ni corrupto.
  it('cancelar y responder concurrentes: exactamente una transición válida', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const [cancelacion, respuesta] = await Promise.all([
      cancelarVerificacion({ verificacionId: verificacion.id, actorUserId: 'user-admin' }),
      responderPorEnlace({ verificacionId: verificacion.id, token, resultado: 'sin_afectacion' }),
    ])

    const fila = await obtenerVerificacion(verificacion.id)
    // Exactamente una ganó: nunca ambas.
    expect([cancelacion.ok, respuesta.ok].filter(Boolean)).toHaveLength(1)
    // El estado final es exactamente uno de los válidos, nunca corrupto.
    expect(['respondida', 'cancelada']).toContain(fila?.estado)

    if (respuesta.ok) {
      expect(fila?.estado).toBe('respondida')
      expect(fila?.resultado).toBe('sin_afectacion')
      expect(cancelacion).toEqual({ ok: false, status: 409, motivo: 'ya_respondida' })
    } else {
      expect(fila?.estado).toBe('cancelada')
      expect(respuesta).toEqual({ ok: false, status: 409, motivo: 'solicitud_cancelada' })
    }

    // Sólo quedó el evento de la transición que efectivamente ocurrió.
    expect(await contarEventos(verificacion.id, 'respondida')).toBe(respuesta.ok ? 1 : 0)
    expect(await contarEventos(verificacion.id, 'cancelada')).toBe(cancelacion.ok ? 1 : 0)
  })
})

describe('responderAsistida', () => {
  it('responde por teléfono, atribuye al staff y no consume la credencial de enlace', async () => {
    const { verificacion } = await verificacionPendiente()
    const hashOriginal = verificacion.tokenHash

    const resultado = await responderAsistida({
      verificacionId: verificacion.id,
      actorUserId: 'user-operador',
      canal: 'telefono',
      resultado: 'sin_afectacion',
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.verificacion.estado).toBe('respondida')
    expect(resultado.verificacion.respondidaCanal).toBe('telefono')
    expect(resultado.verificacion.respondidaPorUserId).toBe('user-operador')
    expect(resultado.verificacion.tokenHash).toBe(hashOriginal)
    expect(resultado.verificacion.tokenConsumidoEn).toBeNull()
  })

  it('con_afectacion con un movimiento del MISMO CUE: vincula y queda respondida', async () => {
    const cue = cueUnico()
    const parteId = await parteConAfectacionVigente(cue)
    const movimientoId = await crearMovimiento(parteId)
    const { verificacion } = await verificacionPendiente(cue)

    const resultado = await responderAsistida({
      verificacionId: verificacion.id,
      actorUserId: 'user-operador',
      canal: 'telefono',
      resultado: 'con_afectacion',
      movimientoId,
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.verificacion.estado).toBe('respondida')
    expect(resultado.verificacion.movimientoId).toBe(movimientoId)
  })

  it('con_afectacion con un movimiento de OTRO CUE: 409 movimiento_cue_no_coincide y no vincula', async () => {
    const cueA = cueUnico()
    const cueB = cueUnico()
    const parteB = await parteConAfectacionVigente(cueB)
    const movimientoAjeno = await crearMovimiento(parteB)
    const { verificacion } = await verificacionPendiente(cueA)

    const resultado = await responderAsistida({
      verificacionId: verificacion.id,
      actorUserId: 'user-operador',
      canal: 'telefono',
      resultado: 'con_afectacion',
      movimientoId: movimientoAjeno,
    })

    expect(resultado).toEqual({ ok: false, status: 409, motivo: 'movimiento_cue_no_coincide' })
    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.movimientoId).toBeNull()
  })
})

describe('validarCredencial', () => {
  it('ok sobre pendiente con token válido, sin consumir la credencial', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const resultado = await validarCredencial({ verificacionId: verificacion.id, token })
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.verificacion.estado).toBe('pendiente')

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.tokenConsumidoEn).toBeNull()
  })

  it('403 con token inválido, sin cambiar el estado', async () => {
    const { verificacion } = await verificacionPendiente()

    const resultado = await validarCredencial({ verificacionId: verificacion.id, token: 'malo' })
    expect(resultado).toEqual({ ok: false, status: 403, motivo: 'credencial_invalida' })

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.tokenConsumidoEn).toBeNull()
  })

  it('410 con credencial revocada, sin cambiar el estado', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))

    const resultado = await validarCredencial({ verificacionId: verificacion.id, token })
    expect(resultado).toEqual({ ok: false, status: 410, motivo: 'credencial_revocada' })

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.tokenConsumidoEn).toBeNull()
  })

  it('404 si la verificación no existe', async () => {
    const resultado = await validarCredencial({ verificacionId: randomUUID(), token: 'x' })
    expect(resultado).toEqual({ ok: false, status: 404, motivo: 'no_existe' })
  })
})

describe('verificacionHabilitaSesionEscritura', () => {
  it('recién creada (pendiente, token vigente, no revocado): true', async () => {
    const { verificacion } = await verificacionPendiente()

    expect(await verificacionHabilitaSesionEscritura(verificacion.id)).toBe(true)
  })

  it('ya respondida: false', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })

    expect(await verificacionHabilitaSesionEscritura(verificacion.id)).toBe(false)
  })

  it('token ya consumido por el flujo de enlace: false', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const respondida = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(respondida.ok).toBe(true)

    // El flujo de enlace dejó la fila respondida y con el token consumido:
    // la sesión de escritura ya no puede habilitarse por este token.
    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.tokenConsumidoEn).not.toBeNull()
    expect(fila?.estado).toBe('respondida')

    expect(await verificacionHabilitaSesionEscritura(verificacion.id)).toBe(false)
  })

  it('token consumido pero estado todavía pendiente: false (chequeo explícito)', async () => {
    const { verificacion } = await verificacionPendiente()

    // Caso hipotético que hoy no produce la máquina de estados: se fuerza por
    // UPDATE directo para aislar el chequeo explícito de tokenConsumidoEn.
    await getDb()
      .update(infraVerificacion)
      .set({ tokenConsumidoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.tokenConsumidoEn).not.toBeNull()

    expect(await verificacionHabilitaSesionEscritura(verificacion.id)).toBe(false)
  })

  it('cancelada: false', async () => {
    const { verificacion } = await verificacionPendiente()
    await cancelarVerificacion({ verificacionId: verificacion.id, actorUserId: 'user-admin' })

    expect(await verificacionHabilitaSesionEscritura(verificacion.id)).toBe(false)
  })

  it('token revocado: false', async () => {
    const { verificacion } = await verificacionPendiente()
    await getDb()
      .update(infraVerificacion)
      .set({ tokenRevocadoEn: new Date().toISOString() })
      .where(eq(infraVerificacion.id, verificacion.id))

    expect(await verificacionHabilitaSesionEscritura(verificacion.id)).toBe(false)
  })

  it('token vencido: false', async () => {
    const { verificacion } = await verificacionPendiente()
    await getDb()
      .update(infraVerificacion)
      .set({ tokenExpiraEn: '2020-01-01T00:00:00.000Z' })
      .where(eq(infraVerificacion.id, verificacion.id))

    expect(await verificacionHabilitaSesionEscritura(verificacion.id)).toBe(false)
  })

  it('verificacionId inexistente: false', async () => {
    expect(await verificacionHabilitaSesionEscritura(randomUUID())).toBe(false)
  })
})

describe('registrarIntentoVinculoFallido', () => {
  it('sobre una verificación existente inserta un evento vinculo_fallido sin tocar su estado', async () => {
    const cue = cueUnico()
    const parteId = await parteConAfectacionVigente(cue)
    const movimientoId = await crearMovimiento(parteId)
    const { token, verificacion } = await verificacionPendiente(cue)

    // Ya respondida con afectación: así los campos estado/resultado/
    // movimientoId tienen valores reales y se puede comprobar que la
    // auditoría NO los toca.
    const respondida = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'con_afectacion',
      movimientoId,
    })
    expect(respondida.ok).toBe(true)

    const ok = await registrarIntentoVinculoFallido({
      verificacionId: verificacion.id,
      motivo: 'credencial_invalida',
    })
    expect(ok).toBe(true)

    const eventos = await getDb()
      .select()
      .from(infraVerificacionEvento)
      .where(
        and(
          eq(infraVerificacionEvento.verificacionId, verificacion.id),
          eq(infraVerificacionEvento.tipo, 'vinculo_fallido'),
        ),
      )
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.actorTipo).toBe('sistema')
    expect(eventos[0]!.actorUserId).toBeNull()
    expect(eventos[0]!.canal).toBeNull()
    expect(eventos[0]!.motivo).toBe('credencial_invalida')

    // No reintenta la transición ni toca estado/resultado/movimientoId.
    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('respondida')
    expect(fila?.resultado).toBe('con_afectacion')
    expect(fila?.movimientoId).toBe(movimientoId)
  })

  it('sobre un verificacionId inexistente no inserta nada y devuelve false', async () => {
    const db = getDb()
    const [{ n: antes }] = await db.select({ n: count() }).from(infraVerificacionEvento)

    const ok = await registrarIntentoVinculoFallido({
      verificacionId: randomUUID(),
      motivo: 'credencial_invalida',
    })
    expect(ok).toBe(false)

    const [{ n: despues }] = await db.select({ n: count() }).from(infraVerificacionEvento)
    expect(despues).toBe(antes)
  })
})

describe('listarVerificaciones', () => {
  it('filtra por estado y ordena por solicitadaEn descendente', async () => {
    const cue = cueUnico()
    const primera = await verificacionPendiente(cue)
    const segunda = await verificacionPendiente(cue)
    await responderPorEnlace({
      verificacionId: primera.verificacion.id,
      token: primera.token,
      resultado: 'sin_afectacion',
    })

    const pendientes = await listarVerificaciones({
      periodoId: PERIODO_ENOS_2026_2027_ID,
      estado: 'pendiente',
      cueAnexo: cue,
    })
    expect(pendientes.map((v) => v.id)).toEqual([segunda.verificacion.id])

    const todas = await listarVerificaciones({ cueAnexo: cue })
    expect(todas).toHaveLength(2)
  })
})
