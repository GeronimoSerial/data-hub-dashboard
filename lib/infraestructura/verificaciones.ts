// Máquina de estados de las verificaciones del batch E1 del protocolo ENOS.
// Una verificación es un pedido de confirmación a un establecimiento: nace
// 'pendiente' con una credencial de un solo uso (enlace público) y termina
// 'respondida' o 'cancelada'. Ver lib/db/schema.ts (infraVerificacion /
// infraVerificacionEvento) para el modelo y verificacion-token.ts para la
// credencial.
//
// Regla transversal: TODA transición de estado usa un UPDATE condicionado con
// `.returning()` (mismo patrón que lib/infraestructura/riesgo/job-run.ts).
// Nunca un select-then-act separado: entre el read y el write otra request
// concurrente puede cancelar o responder, y el WHERE es lo único que garantiza
// que gane una sola. El select posterior al UPDATE fallido sirve para
// *clasificar* el conflicto (404/409), no para decidir la escritura.
import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  infraAfectacion,
  infraMovimiento,
  infraParte,
  infraVerificacion,
  infraVerificacionEvento,
} from '@/lib/db/schema'
import { obtenerEpisodio } from '@/lib/infraestructura/episodios'
import {
  calcularVencimientoToken,
  generarToken,
  hashearToken,
  tokenExpirado,
} from './verificacion-token'

export type VerificacionRow = typeof infraVerificacion.$inferSelect

export type ResultadoTransicion =
  | { ok: true; verificacion: VerificacionRow; replay?: boolean }
  | { ok: false; status: 403 | 404 | 409 | 410; motivo: string }

type ResultadoRespuesta = 'sin_afectacion' | 'con_afectacion' | 'no_disponible'
type CanalRespuesta = 'enlace' | 'telefono' | 'whatsapp' | 'presencial' | 'otro'
type CanalAsistido = 'telefono' | 'whatsapp' | 'presencial' | 'otro'

type OrigenRespuesta =
  | { tipo: 'enlace'; token: string }
  | { tipo: 'asistida'; actorUserId: string; canal: CanalAsistido }

type CrearVerificacionInput = {
  episodioId: string
  cueAnexo: string
  solicitadaPorUserId: string
  vencimientoEn?: string | null
}

type CancelarVerificacionInput = {
  verificacionId: string
  actorUserId: string
  motivo?: string | null
}

type ResponderPorEnlaceInput = {
  verificacionId: string
  token: string
  resultado: ResultadoRespuesta
  movimientoId?: string | null
}

type ResponderAsistidaInput = {
  verificacionId: string
  actorUserId: string
  canal: CanalAsistido
  resultado: ResultadoRespuesta
  movimientoId?: string | null
}

// Emite un pedido de verificación. El `token` en claro viaja en la respuesta
// SÓLO acá: es el único momento en que existe fuera del proceso. La base
// guarda nada más que su sha256 (`tokenHash`), así que después de esta llamada
// no hay forma de recuperarlo — quien lo perdió tiene que pedir otro pedido.
//
// No reemplaza verificaciones anteriores del mismo CUE: una nueva solicitud
// convive con las previas (spec E1). Si el episodio no está abierto no se
// emiten pedidos.
export async function crearVerificacion(
  input: CrearVerificacionInput,
  ahora: Date = new Date(),
): Promise<
  | { ok: true; verificacion: VerificacionRow; token: string }
  | { ok: false; status: 404 | 409; motivo: 'episodio_no_existe' | 'episodio_cerrado' }
> {
  const db = getDb()
  const episodio = await obtenerEpisodio(input.episodioId)
  if (!episodio) return { ok: false, status: 404, motivo: 'episodio_no_existe' }
  if (episodio.estado !== 'abierto') return { ok: false, status: 409, motivo: 'episodio_cerrado' }

  const { token, tokenHash } = generarToken()
  const ahoraIso = ahora.toISOString()

  const [verificacion] = await db
    .insert(infraVerificacion)
    .values({
      id: randomUUID(),
      episodioId: input.episodioId,
      cueAnexo: input.cueAnexo,
      estado: 'pendiente',
      solicitadaEn: ahoraIso,
      solicitadaPorUserId: input.solicitadaPorUserId,
      vencimientoEn: input.vencimientoEn ?? null,
      resultado: null,
      discrepancia: 0,
      respondidaEn: null,
      respondidaCanal: null,
      respondidaPorUserId: null,
      movimientoId: null,
      canceladaEn: null,
      canceladaPorUserId: null,
      motivoCancelacion: null,
      tokenHash,
      // Vencimiento de la credencial (bloquea, 410), no el SLA informativo.
      tokenExpiraEn: calcularVencimientoToken(ahora),
      tokenRevocadoEn: null,
      tokenConsumidoEn: null,
      creadaEn: ahoraIso,
      actualizadaEn: ahoraIso,
    })
    .returning()

  await db.insert(infraVerificacionEvento).values({
    id: randomUUID(),
    verificacionId: verificacion.id,
    tipo: 'creada',
    actorTipo: 'usuario',
    actorUserId: input.solicitadaPorUserId,
    canal: null,
    motivo: null,
    correlacionId: null,
    creadaEn: ahoraIso,
  })

  return { ok: true, verificacion, token }
}

// Cancela un pedido pendiente. El UPDATE condicionado a estado='pendiente' es
// el árbitro de la carrera cancelar/responder: gana quien logre el UPDATE
// primero. El perdedor cae en el select de clasificación y recibe el estado
// real ya persistido, no una suposición.
export async function cancelarVerificacion(
  input: CancelarVerificacionInput,
  ahora: Date = new Date(),
): Promise<ResultadoTransicion> {
  const db = getDb()
  const ahoraIso = ahora.toISOString()

  const [actualizada] = await db
    .update(infraVerificacion)
    .set({
      estado: 'cancelada',
      canceladaEn: ahoraIso,
      canceladaPorUserId: input.actorUserId,
      motivoCancelacion: input.motivo ?? null,
      actualizadaEn: ahoraIso,
    })
    .where(
      and(
        eq(infraVerificacion.id, input.verificacionId),
        eq(infraVerificacion.estado, 'pendiente'),
      ),
    )
    .returning()

  if (actualizada) {
    await db.insert(infraVerificacionEvento).values({
      id: randomUUID(),
      verificacionId: input.verificacionId,
      tipo: 'cancelada',
      actorTipo: 'usuario',
      actorUserId: input.actorUserId,
      canal: null,
      motivo: input.motivo ?? null,
      correlacionId: null,
      creadaEn: ahoraIso,
    })
    return { ok: true, verificacion: actualizada }
  }

  // El UPDATE no matcheó: la fila no existe, ya estaba cancelada o ya se
  // respondió. El select sólo clasifica el motivo.
  const [fila] = await db
    .select()
    .from(infraVerificacion)
    .where(eq(infraVerificacion.id, input.verificacionId))
  if (!fila) return { ok: false, status: 404, motivo: 'no_existe' }
  if (fila.estado === 'cancelada') return { ok: false, status: 409, motivo: 'ya_cancelada' }
  if (fila.estado === 'respondida') return { ok: false, status: 409, motivo: 'ya_respondida' }
  return { ok: false, status: 409, motivo: fila.estado }
}

// true si existe al menos una afectación vigente (retirada_en IS NULL) para
// ese establecimiento dentro del período. Es la señal que convierte una
// respuesta 'sin_afectacion' en discrepancia: el director dice que no pasa
// nada mientras el parte registra lo contrario.
async function existeAfectacionVigente(cueAnexo: string, periodoId: string): Promise<boolean> {
  const db = getDb()
  const [fila] = await db
    .select({ uno: sql<number>`1` })
    .from(infraAfectacion)
    .innerJoin(infraParte, eq(infraAfectacion.parteId, infraParte.id))
    .where(
      and(
        eq(infraParte.cueAnexo, cueAnexo),
        eq(infraParte.periodoId, periodoId),
        isNull(infraAfectacion.retiradaEn),
      ),
    )
    .limit(1)
  return Boolean(fila)
}

// Defensa contra vínculo cruzado entre escuelas: un movimientoId sólo es
// válido para ESTA verificación si el parte al que pertenece es del mismo
// cueAnexo. Sin este chequeo, cualquier movimientoId ajeno (de otro CUE)
// quedaría enlazado igual — un bug real encontrado por revisión adversarial.
async function movimientoPerteneceAlCue(movimientoId: string, cueAnexo: string): Promise<boolean> {
  const db = getDb()
  const [fila] = await db
    .select({ cueAnexo: infraParte.cueAnexo })
    .from(infraMovimiento)
    .innerJoin(infraParte, eq(infraMovimiento.parteId, infraParte.id))
    .where(eq(infraMovimiento.id, movimientoId))
    .limit(1)
  return fila?.cueAnexo === cueAnexo
}

async function insertarEvento(params: {
  verificacionId: string
  tipo: 'respondida' | 'discrepancia_detectada'
  origen: OrigenRespuesta
  canal: CanalRespuesta
  ahoraIso: string
}): Promise<void> {
  const db = getDb()
  await db.insert(infraVerificacionEvento).values({
    id: randomUUID(),
    verificacionId: params.verificacionId,
    tipo: params.tipo,
    actorTipo: params.origen.tipo === 'enlace' ? 'enlace' : 'usuario',
    actorUserId: params.origen.tipo === 'asistida' ? params.origen.actorUserId : null,
    canal: params.canal,
    motivo: null,
    correlacionId: null,
    creadaEn: params.ahoraIso,
  })
}

// Núcleo compartido por las dos vías de respuesta (enlace público y carga
// asistida por staff). Parametrizado por origen para que la validación de la
// credencial y la atribución de la auditoría vivan en un solo lugar.
//
// Orden deliberado de los chequeos:
//   1. credencial (sólo enlace) ANTES del estado: una credencial inválida
//      nunca debe revelar si la solicitud existe, está cancelada o ya se
//      respondió. Mismo criterio para 403 y para los 410.
//   2. estado persistido, para resolver cancelación y replay idempotente.
//   3. escritura atómica condicionada, con un único reintento si perdió una
//      carrera contra una transición concurrente.
async function transicionarARespondida(
  verificacionId: string,
  resultado: ResultadoRespuesta,
  origen: OrigenRespuesta,
  movimientoId: string | null,
  ahora: Date,
): Promise<ResultadoTransicion> {
  const db = getDb()
  const ahoraIso = ahora.toISOString()
  const canal: CanalRespuesta = origen.tipo === 'enlace' ? 'enlace' : origen.canal

  // Máximo un reintento: si tras re-leer el estado volvemos a perder el
  // UPDATE condicionado, hay una tormenta de transiciones concurrentes que no
  // vale la pena seguir persiguiendo. El diseño congela "una vez más".
  for (let intento = 0; intento < 2; intento += 1) {
    const [fila] = await db
      .select()
      .from(infraVerificacion)
      .where(eq(infraVerificacion.id, verificacionId))
    if (!fila) return { ok: false, status: 404, motivo: 'no_existe' }

    if (origen.tipo === 'enlace') {
      if (hashearToken(origen.token) !== fila.tokenHash) {
        return { ok: false, status: 403, motivo: 'credencial_invalida' }
      }
      if (fila.tokenRevocadoEn !== null) {
        return { ok: false, status: 410, motivo: 'credencial_revocada' }
      }
      if (tokenExpirado(fila.tokenExpiraEn, ahora)) {
        return { ok: false, status: 410, motivo: 'credencial_vencida' }
      }
    }

    if (fila.estado === 'cancelada') {
      return { ok: false, status: 409, motivo: 'solicitud_cancelada' }
    }

    if (fila.estado === 'respondida') {
      // Retry idéntico: idempotente, no escribe un segundo evento. Un retry
      // con otra respuesta es un conflicto real del usuario, no un reintento.
      if (fila.resultado === resultado) return { ok: true, verificacion: fila, replay: true }
      return { ok: false, status: 409, motivo: 'respuesta_contradictoria' }
    }

    // fila.estado === 'pendiente': calcular discrepancia y escribir. La
    // consulta de afectación vigente usa el período del episodio, que es el
    // que ancla el parte del establecimiento.
    const episodio = await obtenerEpisodio(fila.episodioId)
    const hayAfectacion = episodio
      ? await existeAfectacionVigente(fila.cueAnexo, episodio.periodoId)
      : false
    const discrepancia = resultado === 'sin_afectacion' && hayAfectacion ? 1 : 0

    if (resultado === 'con_afectacion' && movimientoId !== null) {
      if (!(await movimientoPerteneceAlCue(movimientoId, fila.cueAnexo))) {
        return { ok: false, status: 409, motivo: 'movimiento_cue_no_coincide' }
      }
    }

    const [actualizada] = await db
      .update(infraVerificacion)
      .set({
        estado: 'respondida',
        resultado,
        respondidaEn: ahoraIso,
        respondidaCanal: canal,
        respondidaPorUserId: origen.tipo === 'asistida' ? origen.actorUserId : null,
        movimientoId,
        discrepancia,
        // La credencial se consume sólo cuando la respuesta vino por enlace.
        // La vía asistida no toca tokenConsumidoEn: el enlace sigue válido si
        // el director todavía no lo usó.
        tokenConsumidoEn: origen.tipo === 'enlace' ? ahoraIso : fila.tokenConsumidoEn,
        actualizadaEn: ahoraIso,
      })
      .where(
        and(
          eq(infraVerificacion.id, verificacionId),
          eq(infraVerificacion.estado, 'pendiente'),
        ),
      )
      .returning()

    if (!actualizada) continue // perdió la carrera: re-lee y reintenta una vez

    await insertarEvento({
      verificacionId,
      tipo: 'respondida',
      origen,
      canal,
      ahoraIso,
    })
    if (discrepancia === 1) {
      await insertarEvento({
        verificacionId,
        tipo: 'discrepancia_detectada',
        origen,
        canal,
        ahoraIso,
      })
    }
    return { ok: true, verificacion: actualizada }
  }

  // Se perdió la carrera dos veces seguidas: el estado siguió cambiando bajo
  // los pies. No es un camino alcanzable en operación normal; se informa como
  // conflicto en vez de inventar un resultado.
  return { ok: false, status: 409, motivo: 'conflicto_concurrente' }
}

export async function responderPorEnlace(
  input: ResponderPorEnlaceInput,
  ahora: Date = new Date(),
): Promise<ResultadoTransicion> {
  // Error de programación del caller, no un caso de usuario: una respuesta
  // 'con_afectacion' sin movimiento es un dato incompleto que no debe
  // persistirse.
  if (input.resultado === 'con_afectacion' && !input.movimientoId) {
    throw new Error('con_afectacion requiere movimientoId')
  }
  return transicionarARespondida(
    input.verificacionId,
    input.resultado,
    { tipo: 'enlace', token: input.token },
    input.movimientoId ?? null,
    ahora,
  )
}

export async function responderAsistida(
  input: ResponderAsistidaInput,
  ahora: Date = new Date(),
): Promise<ResultadoTransicion> {
  if (input.resultado === 'con_afectacion' && !input.movimientoId) {
    throw new Error('con_afectacion requiere movimientoId')
  }
  return transicionarARespondida(
    input.verificacionId,
    input.resultado,
    { tipo: 'asistida', actorUserId: input.actorUserId, canal: input.canal },
    input.movimientoId ?? null,
    ahora,
  )
}

// Chequeo de SÓLO LECTURA para que la página pública muestre el estado antes
// de que el director elija una respuesta. No escribe, no consume el token y no
// valida contra un resultado (todavía no hay uno). Misma secuencia de
// validación de credencial que transicionarARespondida, sin el paso de
// escritura. Si ya está respondida se devuelve igual como ok: la página
// necesita poder mostrar el resultado final, no ocultarlo.
export async function validarCredencial(
  input: { verificacionId: string; token: string },
  ahora: Date = new Date(),
): Promise<
  | { ok: true; verificacion: VerificacionRow }
  | { ok: false; status: 403 | 404 | 409 | 410; motivo: string }
> {
  const db = getDb()
  const [fila] = await db
    .select()
    .from(infraVerificacion)
    .where(eq(infraVerificacion.id, input.verificacionId))
  if (!fila) return { ok: false, status: 404, motivo: 'no_existe' }

  if (hashearToken(input.token) !== fila.tokenHash) {
    return { ok: false, status: 403, motivo: 'credencial_invalida' }
  }
  if (fila.tokenRevocadoEn !== null) {
    return { ok: false, status: 410, motivo: 'credencial_revocada' }
  }
  if (tokenExpirado(fila.tokenExpiraEn, ahora)) {
    return { ok: false, status: 410, motivo: 'credencial_vencida' }
  }
  if (fila.estado === 'cancelada') {
    return { ok: false, status: 409, motivo: 'solicitud_cancelada' }
  }
  return { ok: true, verificacion: fila }
}

// Regla de N1 (gate del batch E1): la sesión derivada del token nunca puede
// ser más fuerte que el token. Esta función es el único lugar que decide si
// una verificación sigue habilitando ESCRITURA: se usa tanto al canjear una
// sesión nueva (canjear-sesion) como en CADA request que reusa una sesión ya
// emitida (tieneAccesoAlParteParaCue en acceso-parte.ts) — nunca basta con
// que la cookie tenga firma/expiración válidas, la fila real de la
// verificación manda siempre.
export async function verificacionHabilitaSesionEscritura(
  verificacionId: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  const fila = await obtenerVerificacion(verificacionId)
  if (!fila) return false
  if (fila.estado !== 'pendiente') return false
  if (fila.tokenConsumidoEn !== null) return false
  if (fila.tokenRevocadoEn !== null) return false
  if (tokenExpirado(fila.tokenExpiraEn, ahora)) return false
  return true
}

export async function obtenerVerificacion(
  verificacionId: string,
): Promise<VerificacionRow | null> {
  const db = getDb()
  const [fila] = await db
    .select()
    .from(infraVerificacion)
    .where(eq(infraVerificacion.id, verificacionId))
  return fila ?? null
}

export async function listarVerificaciones(
  input?: { episodioId?: string; cueAnexo?: string; estado?: 'pendiente' | 'respondida' | 'cancelada' },
): Promise<VerificacionRow[]> {
  const db = getDb()
  const condiciones = []
  if (input?.episodioId) condiciones.push(eq(infraVerificacion.episodioId, input.episodioId))
  if (input?.cueAnexo) condiciones.push(eq(infraVerificacion.cueAnexo, input.cueAnexo))
  if (input?.estado) condiciones.push(eq(infraVerificacion.estado, input.estado))

  const base = db.select().from(infraVerificacion)
  const conFiltro = condiciones.length > 0 ? base.where(and(...condiciones)) : base
  return conFiltro.orderBy(desc(infraVerificacion.solicitadaEn))
}

// Auditoría de un intento de vínculo fallido (batch E1): quien llama a esto ya
// tiene un movimiento real guardado (el parte del director se guardó bien) y
// el vínculo con la verificación de origen no prendió por el motivo que sea
// (credencial inválida/vencida/revocada, respuesta contradictoria, etc.). Esto
// NO reintenta la transición ni toca `estado`/`resultado`/`movimientoId` de la
// verificación: sólo dejar un rastro append-only para que el operador vea que
// hubo un intento de responder con afectación que no quedó enlazado. Si el id
// de verificación ni siquiera existe (token completamente ajeno/inventado), no
// hay nada real que auditar: no se escribe nada y se devuelve false.
export async function registrarIntentoVinculoFallido(
  input: { verificacionId: string; motivo: string },
  ahora: Date = new Date(),
): Promise<boolean> {
  const db = getDb()
  const [fila] = await db
    .select({ id: infraVerificacion.id })
    .from(infraVerificacion)
    .where(eq(infraVerificacion.id, input.verificacionId))
  if (!fila) return false

  await db.insert(infraVerificacionEvento).values({
    id: randomUUID(),
    verificacionId: input.verificacionId,
    tipo: 'vinculo_fallido',
    actorTipo: 'sistema',
    actorUserId: null,
    canal: null,
    motivo: input.motivo,
    correlacionId: null,
    creadaEn: ahora.toISOString(),
  })
  return true
}
