// Estado actual del parte (spec §6, §17) y alta/actualización (spec §7, §8,
// §13). Un único POST cubre ambos casos — la decisión del producto mató
// "Continuar como otro episodio" (ver docs/trayectoria-contrato-implementacion.md):
// si ya existe un parte para el CUE en el período vigente, iniciar un reporte
// ES actualizar el parte. Mismo patrón de guardas que
// app/api/problematicas/route.ts: acceso público, ensureSeeded, rate limit,
// idempotencia, validación contra la base, transacción.
import { z } from 'zod'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { ensureSeeded } from '@/lib/db/seed'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraMovimiento,
  infraParte,
  infraServicioAlcance,
} from '@/lib/db/schema'
import { codigoSinAccesoParte, tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import type { CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { crearEjecutorSql, getCorteVigente, type EjecutorSql } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada, obtenerMembresiaSecciones } from '@/lib/infraestructura/impacto'
import { listarIdentidadesPorPersonas } from '@/lib/infraestructura/identidad'
import { getClientIp, ipExcedeLimite } from '@/lib/infraestructura/limites'
import { validarJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { listarMotivos } from '@/lib/infraestructura/motivos'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'
import { diffParte, esDiffVacio, type DiffParte } from '@/lib/infraestructura/movimiento-diff'
import {
  armarFichaParte,
  listarMovimientosDescritos,
  listarSituacionesRecientes,
  obtenerAfectacionesYServicio,
  obtenerParteActual,
  obtenerPeriodoVigente,
  snapshotDesde,
  type ParteActual,
} from '@/lib/infraestructura/parte-consulta'
import { listarSeccionesDelCue } from '@/lib/infraestructura/secciones-cue'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { calcularEstadoServicioGeneral } from '@/lib/infraestructura/servicio-educativo'
import { causaElegible } from '@/lib/infraestructura/causa-afectacion'
import type {
  Afectacion,
  EstadoEstablecimiento,
  Severidad,
  TipoMovimiento,
} from '@/lib/infraestructura/trayectoria-tipos'
import { resolverCategoria, validarAlumnosPermitidos } from '@/lib/infraestructura/validacion'
import { parseParteActualizacionInput } from '@/lib/infraestructura/validacion-trayectoria'
import {
  registrarIntentoVinculoFallido,
  responderPorEnlace,
} from '@/lib/infraestructura/verificaciones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MENSAJE_SIN_SITUACION =
  'No hay una situación hidrometeorológica en seguimiento para este establecimiento.'

// Marca interna para distinguir, dentro del catch de la transacción de
// POST, un rollback deliberado (diff vacío, spec §17) de un error real de
// escritura. Nunca sale de este archivo.
class RollbackDiffVacio extends Error {}

// Corrección de la carrera cross-device del gate N1 (ver
// docs/ejecucion-enos/E1b/registro.md, "Correcciones del gate N1" → riesgo
// residual): dos dispositivos que mandan la primera alta del mismo CUE+
// período casi al mismo tiempo, cada uno con su propia idempotencyKey, no
// deben terminar duplicando la afectación que describe el mismo evento. Acá
// se compara el contenido de una entrada de `afectacionesNuevas` contra una
// afectación YA vigente en el parte (releída dentro de la transacción, con
// el lock de escritura tomado) para decidir si hay que insertarla de nuevo o
// si ya está cubierta. La comparación reconstruye el mismo alcance por
// sección que arma cargarAfectaciones (parte-consulta.ts) para que sea
// exacta, no una aproximación.
function motivoCategoriaSeveridadDescripcionCoinciden(
  existente: Afectacion,
  entrada: { motivo: string; severidad: Severidad; descripcion?: string | null },
  categoria: CategoriaAfectacion,
): boolean {
  return (
    existente.motivo === entrada.motivo &&
    existente.categoria === categoria &&
    existente.severidad === entrada.severidad &&
    (existente.descripcion ?? null) === (entrada.descripcion ?? null)
  )
}

async function seccionesEsperadas(
  client: EjecutorSql,
  corteId: number,
  geSectionIds: number[],
  alumnosSeleccionados: number[] | undefined,
): Promise<Map<number, { seccionCompleta: boolean; alumnos: Set<number> }>> {
  const membresia = await obtenerMembresiaSecciones(client, { corteId, geSectionIds })
  const seleccionados = new Set(alumnosSeleccionados ?? [])
  const resultado = new Map<number, { seccionCompleta: boolean; alumnos: Set<number> }>()
  for (const geSectionId of geSectionIds) {
    const matriculados = membresia.get(geSectionId) ?? new Set<number>()
    const interseccion = [...matriculados].filter((id) => seleccionados.has(id))
    resultado.set(
      geSectionId,
      interseccion.length > 0
        ? { seccionCompleta: false, alumnos: new Set(interseccion) }
        : { seccionCompleta: true, alumnos: matriculados },
    )
  }
  return resultado
}

function seccionesCoincidenConEsperadas(
  existente: Afectacion,
  esperadas: Map<number, { seccionCompleta: boolean; alumnos: Set<number> }>,
): boolean {
  if (existente.secciones.length !== esperadas.size) return false
  for (const seccion of existente.secciones) {
    const esperada = esperadas.get(seccion.geSectionId)
    if (!esperada) return false
    if (esperada.seccionCompleta !== seccion.seccionCompleta) return false
    if (esperada.alumnos.size !== seccion.alumnos.length) return false
    for (const id of seccion.alumnos) {
      if (!esperada.alumnos.has(id)) return false
    }
  }
  return true
}

// Busca, entre las afectaciones vigentes ya persistidas, una que describa
// EXACTAMENTE el mismo evento que `entrada` (mismo motivo/categoría/
// severidad/descripción y el mismo alcance de secciones+alumnos). El chequeo
// barato (campos escalares) va primero para no pagar la consulta de
// membresía en el caso común de una afectación genuinamente nueva.
async function buscarAfectacionEquivalente(
  client: EjecutorSql,
  corteId: number,
  candidatas: Afectacion[],
  entrada: {
    motivo: string
    severidad: Severidad
    descripcion?: string | null
    causadaPorId?: string | null
    secciones: number[]
    alumnos?: number[]
  },
  categoria: CategoriaAfectacion,
): Promise<Afectacion | undefined> {
  const posibles = candidatas.filter((existente) =>
    motivoCategoriaSeveridadDescripcionCoinciden(existente, entrada, categoria) &&
    (existente.causadaPorId ?? null) === (entrada.causadaPorId ?? null),
  )
  if (posibles.length === 0) return undefined
  const esperadas = await seccionesEsperadas(client, corteId, entrada.secciones, entrada.alumnos)
  return posibles.find((existente) => seccionesCoincidenConEsperadas(existente, esperadas))
}

// Campo hermano opcional a nivel raíz del mismo body de POST (batch E1). Vive
// SEPARADO de parteActualizacionInputSchema para no tocar el contrato del
// parte: si viene con forma inválida se ignora en silencio, nunca es un 400.
const verificacionVinculoSchema = z
  .object({
    id: z.string().trim().min(1),
    token: z.string().trim().min(1),
  })
  .optional()

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  // El CUE tiene que conocerse ANTES de la guarda para poder validar la
  // sesión acotada por CUE del batch E1; quien ya tenía contraseña/sesión
  // admin entra exactamente igual que antes porque tieneAccesoAlParteParaCue
  // prueba esa vía primero.
  if (!(await tieneAccesoAlParteParaCue(request, cue.value))) {
    return Response.json({ error: 'No autorizado' }, { status: await codigoSinAccesoParte() })
  }

  await ensureSeeded()

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const ficha = await armarFichaParte(cue.value, corte.id)
  if (!ficha) {
    // Sin período vigente: no es un error, es "sin situación en seguimiento"
    // (spec §17).
    return jsonNoStore({ ok: true, periodo: null, parte: null, mensaje: MENSAJE_SIN_SITUACION })
  }

  // La ficha compartida (armarFichaParte) no resuelve nombres — ver
  // parte-consulta.ts. Sólo acá, autenticado por cookie del director, se
  // resuelven: se juntan los ids de TODAS las afectaciones vigentes y se
  // resuelven en una única llamada por lotes (spec batch 3: nunca por
  // afectación, nunca por alumno).
  const idsAlumnos = new Set<number>()
  for (const afectacion of ficha.afectaciones) {
    for (const seccion of afectacion.secciones) {
      for (const id of seccion.alumnos) idsAlumnos.add(id)
    }
  }

  let identidades = new Map<number, { nombre: string; apellido: string }>()
  if (idsAlumnos.size > 0) {
    try {
      const resueltas = await listarIdentidadesPorPersonas(client, [...idsAlumnos])
      identidades = new Map(resueltas.map((i) => [i.gePersonId, { nombre: i.nombre, apellido: i.apellido }]))
    } catch {
      // Degradar a mostrar el id solo (ver map abajo): nunca se cae la
      // pantalla de estado actual por no poder resolver un nombre.
    }
  }

  const afectacionesRespuesta = ficha.afectaciones.map((afectacion) => ({
    id: afectacion.id,
    motivo: afectacion.motivo,
    categoria: afectacion.categoria,
    severidad: afectacion.severidad,
    descripcion: afectacion.descripcion,
    rigeDesde: afectacion.rigeDesde,
    creadaEn: afectacion.creadaEn,
    causadaPorId: afectacion.causadaPorId,
    secciones: afectacion.secciones.map((seccion) => ({
      geSectionId: seccion.geSectionId,
      seccionCompleta: seccion.seccionCompleta,
      alumnos: seccion.alumnos.map((id) => {
        const identidad = identidades.get(id)
        return identidad
          ? { gePersonId: id, nombre: identidad.nombre, apellido: identidad.apellido }
          : { gePersonId: id, nombre: String(id), apellido: '' }
      }),
    })),
    totales: afectacion.totales,
  }))

  const [recientes, movimientos] = await Promise.all([
    listarSituacionesRecientes(cue.value),
    listarMovimientosDescritos(cue.value, corte.id),
  ])
  const ultimaCarga = movimientos[0]
    ? { creadaEn: movimientos[0].creadaEn, titulo: movimientos[0].titulo, cambios: movimientos[0].cambios }
    : null

  return jsonNoStore(
    {
      ok: true,
      periodo: ficha.periodo,
      parte: ficha.parte,
      servicio: ficha.servicio,
      afectaciones: afectacionesRespuesta,
      secciones: ficha.secciones,
      ultimaActualizacion: ficha.ultimaActualizacion,
      recientes,
      ultimaCarga,
    },
  )
}

// Arma la respuesta de éxito (201 en el camino normal, 200 en un replay
// idempotente) releyendo el estado actual — nunca reconstruyéndolo a mano —
// para que la respuesta nunca pueda discrepar de lo que después devuelve
// GET /parte.
async function respuestaExito(
  cueAnexo: string,
  corteId: number,
  parteId: string,
  movimientoId: string,
  tipo: TipoMovimiento,
  resumen: DiffParte,
  status: number,
  verificacionVinculo?: { id: string; token: string },
) {
  const actual = await obtenerParteActual(cueAnexo, corteId)
  const snapshot: Pick<ParteActual, 'secciones'> & { servicioAlcance: ReturnType<typeof snapshotDesde>['servicioAlcance'] } =
    actual
      ? { secciones: actual.secciones, servicioAlcance: snapshotDesde(actual).servicioAlcance }
      : { secciones: [], servicioAlcance: [] }
  const estadoGeneral = calcularEstadoServicioGeneral(snapshot.servicioAlcance, snapshot.secciones)

  // Best-effort, igual que en el camino de transacción nueva: un replay
  // idempotente o la carrera de idempotencia también pueden traer el vínculo
  // de verificación (batch E1), y nunca deben bloquear esta respuesta.
  const { vinculado, motivo } = await intentarVincularVerificacion(verificacionVinculo, movimientoId)

  return Response.json(
    {
      ok: true,
      parteId,
      movimientoId,
      tipo,
      cambios: describirMovimiento(resumen, { tipo }),
      servicio: { estadoGeneral, alcanceVigente: snapshot.servicioAlcance },
      verificacionVinculada: vinculado,
      ...(motivo ? { verificacionVinculoMotivo: motivo } : {}),
    },
    { status },
  )
}

// Best-effort: enlazar el movimiento con la verificación de origen NUNCA
// bloquea la respuesta del parte. Cualquier motivo de rechazo de
// responderPorEnlace (credencial inválida/vencida/revocada, contradicción,
// etc.) se informa en el campo `verificacionVinculada` de la respuesta para
// que la UI pueda mostrar una advertencia si corresponde. Cuando el intento
// falla, además se deja un evento de auditoría append-only
// (`vinculo_fallido`) visible para el operador, y el motivo viaja en
// `verificacionVinculoMotivo` (sólo presente cuando hay un motivo).
async function intentarVincularVerificacion(
  vinculo: { id: string; token: string } | undefined,
  movimientoId: string,
): Promise<{ vinculado: boolean; motivo?: string }> {
  if (!vinculo) return { vinculado: false }
  try {
    const resultado = await responderPorEnlace({
      verificacionId: vinculo.id,
      token: vinculo.token,
      resultado: 'con_afectacion',
      movimientoId,
    })
    if (resultado.ok) return { vinculado: true }
    await registrarIntentoVinculoFallido({ verificacionId: vinculo.id, motivo: resultado.motivo })
    return { vinculado: false, motivo: resultado.motivo }
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'error_interno'
    await registrarIntentoVinculoFallido({ verificacionId: vinculo.id, motivo })
    return { vinculado: false, motivo }
  }
}

export async function POST(request: Request) {
  await ensureSeeded()

  const ip = getClientIp(request)
  if (ipExcedeLimite(ip)) {
    return Response.json({ error: 'Demasiadas solicitudes. Intente nuevamente más tarde.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  // Enlace opcional con la verificación de origen (batch E1). Se extrae del
  // body crudo, aparte de parseParteActualizacionInput: es un campo hermano y
  // best-effort, una forma inválida se ignora en silencio en vez de dar 400.
  const verificacionRaw =
    body && typeof body === 'object' && 'verificacion' in body
      ? (body as { verificacion?: unknown }).verificacion
      : undefined
  const verificacionParsed = verificacionVinculoSchema.safeParse(verificacionRaw)
  const verificacionVinculo = verificacionParsed.success ? verificacionParsed.data : undefined

  const parsed = parseParteActualizacionInput(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const input = parsed.data

  const cue = normalizeCue(input.cue)
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  // La guarda va después de parsear el body y normalizar el CUE por la misma
  // razón que en GET: el CUE tiene que conocerse ANTES para poder validar la
  // sesión acotada por CUE del batch E1; quien ya tenía contraseña/sesión
  // admin entra exactamente igual que antes porque tieneAccesoAlParteParaCue
  // prueba esa vía primero.
  //
  // CONSECUENCIA DE SEGURIDAD EXPLÍCITA: un llamador sin ninguna credencial
  // ahora recibe 400 de validación de body/CUE ANTES que 401 de autorización
  // (antes era al revés). Esto no debilita el control de acceso real —nadie
  // sin credencial válida logra escribir nada, la guarda sigue siendo la
  // última puerta antes de cualquier escritura—, sólo cambia qué mensaje de
  // error ve primero un llamador no autenticado.
  if (!(await tieneAccesoAlParteParaCue(request, cue.value))) {
    return Response.json({ error: 'No autorizado' }, { status: await codigoSinAccesoParte() })
  }

  const db = getDb()
  const client = crearEjecutorSql(getRawClient())

  // Idempotencia: antes de cualquier escritura. Deliberadamente NO se aplica
  // CUE_MAX_ALERTAS_ACTIVAS acá (ver docs/trayectoria-contrato-implementacion.md
  // y batch-3-spec.md): hay un único parte por CUE y período, ese tope era
  // del modelo deprecado (retirado en la Fase 4) y capar actualizaciones
  // dejaría a un director afuera en medio de una inundación.
  const [movimientoExistente] = await db
    .select()
    .from(infraMovimiento)
    .where(eq(infraMovimiento.idempotencyKey, input.idempotencyKey))
    .limit(1)

  await asegurarGeAdjuntada(client)
  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }
  // Capturada en una const propia: el chequeo de arriba no sobrevive el
  // análisis de flujo de TypeScript dentro de los closures que siguen
  // (alumnosPertenecenASecciones, el callback de la transacción).
  const corteId = corte.id

  if (movimientoExistente) {
    return respuestaExito(
      cue.value,
      corteId,
      movimientoExistente.parteId,
      movimientoExistente.id,
      movimientoExistente.tipo as TipoMovimiento,
      movimientoExistente.resumen as unknown as DiffParte,
      200,
      verificacionVinculo,
    )
  }

  const periodo = await obtenerPeriodoVigente(db)
  if (!periodo) {
    return Response.json({ error: 'No hay un período hidrometeorológico vigente' }, { status: 503 })
  }

  // --- Validación contra la base, igual que POST /api/problematicas ---

  const motivos = await listarMotivos()
  const nuevasConCategoria: Array<{
    input: (typeof input.afectacionesNuevas)[number]
    categoria: CategoriaAfectacion
  }> = []
  for (const entrada of input.afectacionesNuevas) {
    const resuelto = resolverCategoria(entrada.motivo, motivos)
    if (!resuelto.ok) {
      return Response.json({ error: resuelto.error }, { status: 400 })
    }
    const sugerida = motivos.find((m) => m.nombre === entrada.motivo)?.severidadSugerida ?? null
    const justificada = validarJustificacionCritica({
      severidad: entrada.severidad,
      sugerida,
      justificacion: entrada.justificacionCritica,
      detalle: entrada.justificacionCriticaDetalle,
    })
    if (!justificada.ok) return jsonError(justificada.error, 400)
    const permitido = validarAlumnosPermitidos(resuelto.categoria, entrada.alumnos)
    if (!permitido.ok) {
      return Response.json({ error: permitido.error }, { status: 400 })
    }
    nuevasConCategoria.push({ input: entrada, categoria: resuelto.categoria })
  }

  const secciones = await listarSeccionesDelCue(client, corteId, cue.value)
  const seccionesCueSet = new Set(secciones.map((s) => s.geSectionId))
  const turnosCueSet = new Set(secciones.map((s) => s.turno))
  const seccionInvalida = (ids: number[]) => ids.some((id) => !seccionesCueSet.has(id))

  for (const { input: entrada } of nuevasConCategoria) {
    if (seccionInvalida(entrada.secciones)) {
      return jsonError('Alguna de las secciones no pertenece al establecimiento indicado', 400)
    }
  }
  for (const modificacion of input.afectacionesModificadas) {
    if (modificacion.secciones && seccionInvalida(modificacion.secciones)) {
      return jsonError('Alguna de las secciones no pertenece al establecimiento indicado', 400)
    }
  }
  if (input.servicioEducativo?.alcance.tipo === 'seccion' && seccionInvalida(input.servicioEducativo.alcance.secciones)) {
    return jsonError('Alguna de las secciones no pertenece al establecimiento indicado', 400)
  }
  if (
    input.servicioEducativo?.alcance.tipo === 'turno' &&
    input.servicioEducativo.alcance.turnos.some((t) => !turnosCueSet.has(t))
  ) {
    return jsonError('Alguno de los turnos no pertenece al establecimiento indicado', 400)
  }

  async function alumnosPertenecenASecciones(geSectionIds: number[], alumnoIds: number[] | undefined) {
    if (!alumnoIds || alumnoIds.length === 0) return true
    if (geSectionIds.length === 0) return false
    const membresia = await obtenerMembresiaSecciones(client, { corteId, geSectionIds })
    const todos = new Set<number>()
    for (const set of membresia.values()) for (const id of set) todos.add(id)
    return alumnoIds.every((id) => todos.has(id))
  }

  for (const { input: entrada } of nuevasConCategoria) {
    if (!(await alumnosPertenecenASecciones(entrada.secciones, entrada.alumnos))) {
      return jsonError('Alguno de los alumnos seleccionados no pertenece a las secciones indicadas', 400)
    }
  }

  for (const { input: entrada, categoria } of nuevasConCategoria) {
    if (categoria !== 'alumnos') continue
    const membresia = await obtenerMembresiaSecciones(client, { corteId, geSectionIds: entrada.secciones })
    const alumnos = new Set(entrada.alumnos ?? [])
    const todasConAlumno = entrada.secciones.every((seccion) =>
      [...(membresia.get(seccion) ?? [])].some((id) => alumnos.has(id)),
    )
    if (!todasConAlumno) return jsonError('Cada sección elegida debe incluir al menos un alumno', 400)
  }

  const [parteExistente] = await db
    .select()
    .from(infraParte)
    .where(and(eq(infraParte.cueAnexo, cue.value), eq(infraParte.periodoId, periodo.id)))
    .limit(1)

  const evacuaAhora = input.estadoEstablecimiento?.estado === 'evacuado' || input.estadoEstablecimiento?.estado === 'centro_evacuados'
  if (evacuaAhora && !input.confirmarInterrupcionTotal && parteExistente && input.servicioEducativo === undefined) {
    const alcancesVigentes = await db.select({ tipo: infraServicioAlcance.tipo }).from(infraServicioAlcance)
      .where(and(eq(infraServicioAlcance.parteId, parteExistente.id), isNull(infraServicioAlcance.retiradaEn)))
    const hayAlcanceTotalOTurno = alcancesVigentes.some((a) => a.tipo === 'establecimiento' || a.tipo === 'turno')
    if (!hayAlcanceTotalOTurno) {
      const [hechoPorSecciones] = await db.select({ id: infraAfectacionSeccion.geSectionId })
        .from(infraAfectacionSeccion)
        .innerJoin(infraAfectacion, eq(infraAfectacion.id, infraAfectacionSeccion.afectacionId))
        .where(and(eq(infraAfectacion.parteId, parteExistente.id), isNull(infraAfectacion.retiradaEn)))
        .limit(1)
      if (hechoPorSecciones) return jsonError('Confirme que se interrumpe todo el establecimiento', 400)
    }
  }

  const idsReferenciados = [
    ...input.afectacionesModificadas.map((m) => m.id),
    ...input.afectacionesRetiradas,
    ...input.afectacionesSolucionadas.map((s) => s.id),
    ...input.afectacionesConfirmadas,
  ]
  if (idsReferenciados.length > 0) {
    if (!parteExistente) {
      return jsonError('La afectación indicada no existe en el parte actual', 400)
    }
    const existentes = await db
      .select()
      .from(infraAfectacion)
      .where(and(eq(infraAfectacion.parteId, parteExistente.id), inArray(infraAfectacion.id, idsReferenciados)))
    const existentesPorId = new Map(existentes.map((a) => [a.id, a]))
    for (const id of idsReferenciados) {
      const fila = existentesPorId.get(id)
      if (!fila || fila.retiradaEn !== null) {
        return jsonError('La afectación indicada no existe o ya fue retirada', 400)
      }
    }

    for (const modificacion of input.afectacionesModificadas) {
      if (modificacion.severidad === undefined) continue
      const fila = existentesPorId.get(modificacion.id)
      const sugerida = motivos.find((m) => m.nombre === fila?.motivo)?.severidadSugerida ?? null
      const justificada = validarJustificacionCritica({
        severidad: modificacion.severidad,
        sugerida,
        justificacion: modificacion.justificacionCritica,
        detalle: modificacion.justificacionCriticaDetalle,
      })
      if (!justificada.ok) return jsonError(justificada.error, 400)
    }

    for (const modificacion of input.afectacionesModificadas) {
      if (!modificacion.alumnos || modificacion.alumnos.length === 0) continue
      let seccionesEfectivas = modificacion.secciones
      if (!seccionesEfectivas) {
        const actuales = await db
          .select({ geSectionId: infraAfectacionSeccion.geSectionId })
          .from(infraAfectacionSeccion)
          .where(eq(infraAfectacionSeccion.afectacionId, modificacion.id))
        seccionesEfectivas = actuales.map((s) => s.geSectionId)
      }
      if (!(await alumnosPertenecenASecciones(seccionesEfectivas, modificacion.alumnos))) {
        return jsonError('Alguno de los alumnos seleccionados no pertenece a las secciones indicadas', 400)
      }
    }
  }

  const idsCausa = [...new Set(input.afectacionesNuevas.flatMap((a) => (a.causadaPorId ? [a.causadaPorId] : [])))]
  const motivoCausaExterna = new Map<string, string>()
  if (idsCausa.length > 0) {
    const causas = await db
      .select({ id: infraAfectacion.id, motivo: infraAfectacion.motivo, retiradaEn: infraAfectacion.retiradaEn, cueAnexo: infraParte.cueAnexo })
      .from(infraAfectacion)
      .innerJoin(infraParte, eq(infraParte.id, infraAfectacion.parteId))
      .where(inArray(infraAfectacion.id, idsCausa))
    const porId = new Map(causas.map((c) => [c.id, c]))
    for (const causa of causas) motivoCausaExterna.set(causa.id, causa.motivo)
    for (const id of idsCausa) {
      const causa = porId.get(id)
      if (!causa || !causaElegible(causa, cue.value, input.rigeDesde)) {
        return jsonError('La situación indicada como causa no es válida', 400)
      }
    }
  }

  const ahora = new Date().toISOString()
  // Definite assignment: cada iteración del loop de reintentos de más abajo
  // o bien asigna `resultado` y hace `break`, o bien `return`-ea antes de
  // salir del bloque — TypeScript no puede seguir esa garantía a través del
  // `for` + `break`.
  let resultado!: { status: number; body: unknown }

  // Transacción real de Postgres vía db.transaction() de Drizzle
  // (drizzle-orm/node-postgres, o drizzle-orm/pglite en tests): a diferencia
  // del driver de libsql, acá db.transaction() abre un BEGIN real sobre una
  // única conexión reservada del pool y hace COMMIT/ROLLBACK automáticamente.
  // Ese es justamente el comportamiento que el workaround manual con BEGIN
  // IMMEDIATE de SQLite intentaba conseguir; en Postgres el problema que lo
  // forzaba no existe, así que se usa la transacción nativa de Drizzle (mismo
  // query builder `tx`) y se elimina la ventana de carrera que motivaba el
  // BEGIN IMMEDIATE.
  //
  // Todo el bloque sigue viviendo dentro de un reintento manual
  // (lib/db/reintento.ts#conReintentoPorBloqueo): si esta request pierde la
  // carrera por el lock de escritura contra otra, se entera y reintenta el
  // bloque COMPLETO tras una espera corta con jitter, releyendo el estado
  // real dentro de la nueva transacción — nunca sólo el BEGIN, porque toda la
  // lógica de "¿existe ya el parte?" de más abajo depende de ese estado
  // fresco. Cada reintento vuelve a llamar a db.transaction() de cero, con
  // una conexión y un BEGIN nuevos.
  try {
    resultado = await conReintentoPorBloqueo(async () => {
      return await db.transaction(async (tx) => {
      // Ejecutor de GE ligado a la MISMA conexión que sostiene esta
      // transacción. Nunca se usa `client` (el pool/raw separado) dentro del
      // callback: bajo PGlite, emitir una query por el cliente raw mientras la
      // transacción tiene la única sesión ocupada esperando el COMMIT produce
      // un deadlock real (la query raw queda encolada detrás del COMMIT y la
      // transacción no puede cerrar hasta que el callback —que espera esa
      // query— termine). Ver crearEjecutorSql en ge-db.ts.
      const clienteGeEnTx = crearEjecutorSql(tx)
      let parteId: string
      let esNuevoParte: boolean
      if (parteExistente) {
        parteId = parteExistente.id
        esNuevoParte = false
      } else {
        const nuevoId = crypto.randomUUID()
        await tx
          .insert(infraParte)
          .values({
            id: nuevoId,
            periodoId: periodo.id,
            cueAnexo: cue.value,
            estadoEstablecimiento: 'habitual',
            asistenciaPedagogica: null,
            estadoEstablecimientoRigeDesde: input.rigeDesde,
            corteId,
            creadaEn: ahora,
            actualizadaEn: ahora,
          })
          // Carrera en (cue_anexo, periodo_id): si otra request ya creó el
          // parte mientras ésta esperaba el lock de escritura, este insert
          // simplemente no hace nada y releemos abajo.
          .onConflictDoNothing()
        const [fila] = await tx
          .select({ id: infraParte.id })
          .from(infraParte)
          .where(and(eq(infraParte.cueAnexo, cue.value), eq(infraParte.periodoId, periodo.id)))
          .limit(1)
        if (!fila) throw new Error('No se pudo crear ni leer el parte')
        parteId = fila.id
        // Si `fila.id` no es el id que generamos, otra transacción ganó la
        // carrera del alta y ya creó el parte: esta request pasa a tratarse
        // como una actualización, no como un segundo "reporte_inicial" del
        // mismo parte (riesgo residual de E1b).
        esNuevoParte = fila.id === nuevoId
      }

      // --- Fotografía "antes" (spec §12), releída DENTRO de la transacción
      // con el lock de escritura ya tomado — nunca la `parteExistente` de
      // más arriba, que pudo quedar desactualizada por la misma carrera.
      const [parteFilaActual] = await tx.select().from(infraParte).where(eq(infraParte.id, parteId)).limit(1)
      const { afectaciones: afectacionesActuales, servicioAlcance: servicioAlcanceActual } =
        await obtenerAfectacionesYServicio(tx, clienteGeEnTx, parteId, corteId)
      const actualAntesReal: ParteActual = parteFilaActual
        ? {
            periodo,
            parte: { ...parteFilaActual, estadoEstablecimiento: parteFilaActual.estadoEstablecimiento as EstadoEstablecimiento, asistenciaPedagogica: parteFilaActual.asistenciaPedagogica ? JSON.parse(parteFilaActual.asistenciaPedagogica) : null },
            afectaciones: afectacionesActuales,
            servicioAlcance: servicioAlcanceActual,
            secciones,
          }
        : { periodo, parte: null, afectaciones: [], servicioAlcance: [], secciones }
      const antes = snapshotDesde(actualAntesReal, input.rigeDesde)
      const afectacionesVigentesActuales = afectacionesActuales.filter((a) => a.retiradaEn === null)
      const causaPorNuevaId = new Map<string, string>()

      for (const { input: entrada, categoria } of nuevasConCategoria) {
        // Nunca duplicar una afectación que otro dispositivo ya insertó para
        // el mismo evento (misma carrera de alta cross-device): si el
        // contenido coincide exactamente con una ya vigente, esta entrada es
        // un no-op.
        const equivalente = await buscarAfectacionEquivalente(
          clienteGeEnTx,
          corteId,
          afectacionesVigentesActuales,
          entrada,
          categoria,
        )
        if (equivalente) continue

        const id = crypto.randomUUID()
        if (entrada.causadaPorId) causaPorNuevaId.set(id, entrada.causadaPorId)
        await tx.insert(infraAfectacion).values({
          id,
          parteId,
          motivo: entrada.motivo,
          categoria,
          severidad: entrada.severidad,
          justificacionCritica: entrada.justificacionCritica ?? null,
          justificacionCriticaDetalle: entrada.justificacionCriticaDetalle ?? null,
          descripcion: entrada.descripcion ?? null,
          causadaPorId: entrada.causadaPorId ?? null,
          rigeDesde: input.rigeDesde,
          creadaEn: ahora,
          retiradaEn: null,
        })
        await tx
          .insert(infraAfectacionSeccion)
          .values(entrada.secciones.map((geSectionId) => ({ afectacionId: id, geSectionId })))
        if (entrada.alumnos && entrada.alumnos.length > 0) {
          await tx
            .insert(infraAfectacionAlumno)
            .values(entrada.alumnos.map((gePersonId) => ({ afectacionId: id, gePersonId })))
        }
      }

      for (const modificacion of input.afectacionesModificadas) {
        const cambios: {
          severidad?: string
          descripcion?: string | null
          justificacionCritica?: string | null
          justificacionCriticaDetalle?: string | null
        } = {}
        if (modificacion.severidad !== undefined) {
          cambios.severidad = modificacion.severidad
          cambios.justificacionCritica = modificacion.justificacionCritica ?? null
          cambios.justificacionCriticaDetalle = modificacion.justificacionCriticaDetalle ?? null
        }
        if (modificacion.descripcion !== undefined) cambios.descripcion = modificacion.descripcion
        if (Object.keys(cambios).length > 0) {
          await tx.update(infraAfectacion).set(cambios).where(eq(infraAfectacion.id, modificacion.id))
        }
        if (modificacion.secciones !== undefined) {
          await tx.delete(infraAfectacionSeccion).where(eq(infraAfectacionSeccion.afectacionId, modificacion.id))
          if (modificacion.secciones.length > 0) {
            await tx
              .insert(infraAfectacionSeccion)
              .values(modificacion.secciones.map((geSectionId) => ({ afectacionId: modificacion.id, geSectionId })))
          }
        }
        if (modificacion.alumnos !== undefined) {
          await tx.delete(infraAfectacionAlumno).where(eq(infraAfectacionAlumno.afectacionId, modificacion.id))
          if (modificacion.alumnos.length > 0) {
            await tx
              .insert(infraAfectacionAlumno)
              .values(modificacion.alumnos.map((gePersonId) => ({ afectacionId: modificacion.id, gePersonId })))
          }
        }
      }

      if (input.afectacionesRetiradas.length > 0) {
        await tx
          .update(infraAfectacion)
          .set({ retiradaEn: input.rigeDesde, cierre: 'retirada' })
          .where(inArray(infraAfectacion.id, input.afectacionesRetiradas))
      }

      for (const solucionada of input.afectacionesSolucionadas) {
        await tx
          .update(infraAfectacion)
          .set({ retiradaEn: solucionada.solucionadaEn ?? input.rigeDesde, cierre: 'solucionada' })
          .where(eq(infraAfectacion.id, solucionada.id))
      }

      if (input.servicioEducativo) {
        const claves: Array<{ tipo: 'establecimiento' | 'turno' | 'seccion'; referenciaId: string | null }> = []
        if (input.servicioEducativo.alcance.tipo === 'establecimiento') {
          claves.push({ tipo: 'establecimiento', referenciaId: null })
        } else if (input.servicioEducativo.alcance.tipo === 'turno') {
          for (const turno of input.servicioEducativo.alcance.turnos) {
            claves.push({ tipo: 'turno', referenciaId: turno })
          }
        } else {
          for (const seccionId of input.servicioEducativo.alcance.secciones) {
            claves.push({ tipo: 'seccion', referenciaId: String(seccionId) })
          }
        }

        for (const clave of claves) {
          const condicionReferencia =
            clave.referenciaId === null
              ? isNull(infraServicioAlcance.referenciaId)
              : eq(infraServicioAlcance.referenciaId, clave.referenciaId)
          // Baja blanda de la fila vigente para esta clave puntual (spec
          // §10: suspender una sección no debe tocar a las demás).
          await tx
            .update(infraServicioAlcance)
            .set({ retiradaEn: input.rigeDesde })
            .where(
              and(
                eq(infraServicioAlcance.parteId, parteId),
                eq(infraServicioAlcance.tipo, clave.tipo),
                condicionReferencia,
                isNull(infraServicioAlcance.retiradaEn),
              ),
            )
          await tx.insert(infraServicioAlcance).values({
            id: crypto.randomUUID(),
            parteId,
            tipo: clave.tipo,
            referenciaId: clave.referenciaId,
            estado: input.servicioEducativo.estado,
            rigeDesde: input.rigeDesde,
            creadaEn: ahora,
            retiradaEn: null,
          })
        }
      }

      const actualizacionParte: {
        actualizadaEn: string
        estadoEstablecimiento?: string
        estadoEstablecimientoRigeDesde?: string
        asistenciaPedagogica?: string | null
      } = { actualizadaEn: ahora }
      if (input.estadoEstablecimiento) {
        actualizacionParte.estadoEstablecimiento = input.estadoEstablecimiento.estado
        actualizacionParte.estadoEstablecimientoRigeDesde = input.rigeDesde
      }
      if (input.asistenciaPedagogica !== undefined) actualizacionParte.asistenciaPedagogica = JSON.stringify(input.asistenciaPedagogica)
      await tx.update(infraParte).set(actualizacionParte).where(eq(infraParte.id, parteId))

      // Fotografía "después", dentro de la misma transacción: si el diff
      // resulta vacío hay que poder revertir todo lo anterior.
      const { afectaciones: afectacionesDespues, servicioAlcance: servicioAlcanceDespues } =
        await obtenerAfectacionesYServicio(tx, clienteGeEnTx, parteId, corteId)
      const [parteDespues] = await tx.select().from(infraParte).where(eq(infraParte.id, parteId)).limit(1)
      const despues = snapshotDesde(
        {
          periodo,
          parte: parteDespues
            ? { ...parteDespues, estadoEstablecimiento: parteDespues.estadoEstablecimiento as EstadoEstablecimiento, asistenciaPedagogica: parteDespues.asistenciaPedagogica ? JSON.parse(parteDespues.asistenciaPedagogica) : null }
            : null,
          afectaciones: afectacionesDespues,
          servicioAlcance: servicioAlcanceDespues,
          secciones,
        },
        input.rigeDesde,
      )

      const diff = diffParte(antes, despues)
      const motivoPorId = new Map(afectacionesActuales.map((a) => [a.id, a.motivo]))
      diff.afectacionesConfirmadas = input.afectacionesConfirmadas.map((id) => ({ afectacionId: id, motivo: motivoPorId.get(id) ?? '' }))
      const solucionadas = new Set(input.afectacionesSolucionadas.map((s) => s.id))
      diff.afectacionesRetiradas = diff.afectacionesRetiradas.map((r) => ({ ...r, cierre: solucionadas.has(r.afectacionId) ? 'solucionada' : 'retirada' }))
      diff.afectacionesAgregadas = diff.afectacionesAgregadas.map((a) => {
        const causaId = causaPorNuevaId.get(a.afectacionId)
        return causaId ? { ...a, causadaPor: { afectacionId: causaId, motivo: motivoPorId.get(causaId) ?? motivoCausaExterna.get(causaId) ?? '' } } : a
      })
      if (esDiffVacio(diff)) {
        // Revierte todo lo escrito en la transacción: al lanzar desde el
        // callback, db.transaction() hace ROLLBACK real y relanza este mismo
        // error, que el catch de más abajo reconoce.
        throw new RollbackDiffVacio()
      }

      const soloConfirmaciones = (diff.afectacionesConfirmadas?.length ?? 0) > 0 &&
        diff.afectacionesAgregadas.length === 0 && diff.afectacionesRetiradas.length === 0 &&
        diff.severidadesCambiadas.length === 0 && diff.alcancesCambiados.length === 0 &&
        diff.datosCambiados.length === 0 && diff.serviciosCambiados.length === 0 &&
        diff.establecimientoCambiado === null && diff.asistenciaPedagogicaCambiada == null
      const tipoMovimiento: TipoMovimiento = soloConfirmaciones ? 'confirmacion' : esNuevoParte ? 'reporte_inicial' : 'actualizacion'
      const movimientoId = crypto.randomUUID()
      await tx.insert(infraMovimiento).values({
        id: movimientoId,
        parteId,
        tipo: tipoMovimiento,
        rol: 'director',
        resumen: diff as unknown as Record<string, unknown>,
        rigeDesde: input.rigeDesde,
        creadaEn: ahora,
        idempotencyKey: input.idempotencyKey,
      })

      const estadoGeneral = calcularEstadoServicioGeneral(despues.servicioAlcance, secciones)
      return {
        status: 201,
        body: {
          ok: true,
          parteId,
          movimientoId,
          tipo: tipoMovimiento,
          cambios: describirMovimiento(diff, { tipo: tipoMovimiento }),
          servicio: { estadoGeneral, alcanceVigente: despues.servicioAlcance },
        },
      }
      })
    })
  } catch (err) {
    if (err instanceof RollbackDiffVacio) {
      return jsonError('Todavía no realizó cambios en el parte actual', 409)
    }
    // Violación del constraint único de idempotency_key. En SQLite (driver
    // libsql, fallback para entornos que aún no migraron) el texto es
    // "UNIQUE constraint failed: infra_movimiento.idempotency_key", envuelto
    // por drizzle-orm en DrizzleQueryError — según la versión el texto puede
    // caer en `err.message` o en `err.cause.message`, así que se revisan
    // ambos. En Postgres el error trae `code === '23505'` y el nombre de la
    // constraint (o el mensaje "duplicate key value violates unique
    // constraint ...") menciona la columna; `code`/`constraint` pueden venir
    // en el error envuelto por Drizzle, dentro de `err.cause`.
    const msg = err instanceof Error ? err.message : String(err)
    const causaMsg =
      err instanceof Error && err.cause instanceof Error ? err.cause.message : ''
    const causa = (err as { cause?: unknown }).cause
    const errCode =
      (err as { code?: string }).code ??
      (causa && typeof causa === 'object' ? (causa as { code?: string }).code : undefined)
    const constraint =
      (err as { constraint?: string }).constraint ??
      (causa && typeof causa === 'object' ? (causa as { constraint?: string }).constraint : undefined) ??
      ''
    const duplicadoIdempotencyKeyPostgres =
      errCode === '23505' && /idempotency_key/i.test(`${msg} ${causaMsg} ${constraint}`)
    if (
      /UNIQUE constraint failed.*idempotency_key/i.test(msg) ||
      /UNIQUE constraint failed.*idempotency_key/i.test(causaMsg) ||
      duplicadoIdempotencyKeyPostgres
    ) {
      // Carrera: otra request con la misma idempotencyKey ganó mientras se
      // procesaba ésta. Se responde como si fuera un replay, releyendo el
      // movimiento que sí se escribió.
      const [race] = await db
        .select()
        .from(infraMovimiento)
        .where(eq(infraMovimiento.idempotencyKey, input.idempotencyKey))
        .limit(1)
      if (race) {
        return respuestaExito(
          cue.value,
          corteId,
          race.parteId,
          race.id,
          race.tipo as TipoMovimiento,
          race.resumen as unknown as DiffParte,
          200,
          verificacionVinculo,
        )
      }
    }
    return Response.json({ error: 'No se pudo guardar la actualización' }, { status: 500 })
  }

  // Único punto de retorno final de POST (éxito de la transacción): acá se
  // enlaza el movimiento con la verificación de origen, best-effort. Si no
  // vino `verificacion`, `verificacionVinculada` es false (no undefined) para
  // que la forma de la respuesta sea siempre la misma.
  const bodyResultado = resultado.body as { movimientoId: string } & Record<string, unknown>
  const { vinculado, motivo } = await intentarVincularVerificacion(
    verificacionVinculo,
    bodyResultado.movimientoId,
  )
  return Response.json(
    {
      ...bodyResultado,
      verificacionVinculada: vinculado,
      ...(motivo ? { verificacionVinculoMotivo: motivo } : {}),
    },
    { status: resultado.status },
  )
}
