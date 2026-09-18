// Estado actual del parte (spec §6, §17) y alta/actualización (spec §7, §8,
// §13). Un único POST cubre ambos casos — la decisión del producto mató
// "Continuar como otro episodio" (ver docs/trayectoria-contrato-implementacion.md):
// si ya existe un parte para el CUE en el período vigente, iniciar un reporte
// ES actualizar el parte. Mismo patrón de guardas que
// app/api/problematicas/route.ts: acceso público, ensureSeeded, rate limit,
// idempotencia, validación contra la base, transacción.
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraMovimiento,
  infraParte,
  infraServicioAlcance,
} from '@/lib/db/schema'
import { tieneAccesoPublico } from '@/lib/infraestructura/acceso-publico'
import type { CategoriaProblematica } from '@/lib/infraestructura/categorias'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada, obtenerMembresiaSecciones } from '@/lib/infraestructura/impacto'
import { listarIdentidadesPorPersonas } from '@/lib/infraestructura/identidad'
import { getClientIp, ipExcedeLimite } from '@/lib/infraestructura/limites'
import { listarMotivos } from '@/lib/infraestructura/motivos'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'
import { diffParte, esDiffVacio, type DiffParte } from '@/lib/infraestructura/movimiento-diff'
import {
  obtenerAfectacionesYServicio,
  obtenerParteActual,
  obtenerPeriodoVigente,
  snapshotDesde,
  type ParteActual,
} from '@/lib/infraestructura/parte-consulta'
import { listarSeccionesDelCue } from '@/lib/infraestructura/secciones-cue'
import { calcularEstadoServicioGeneral } from '@/lib/infraestructura/servicio-educativo'
import type { Afectacion, EstadoEstablecimiento, TipoMovimiento } from '@/lib/infraestructura/trayectoria-tipos'
import { resolverCategoria, validarAlumnosPermitidos } from '@/lib/infraestructura/validacion'
import { parseParteActualizacionInput } from '@/lib/infraestructura/validacion-trayectoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// El estado actual del parte incluye nombres de alumnos (spec §18.12): nunca
// se cachea, ni siquiera del lado del navegador.
const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }

const MENSAJE_SIN_SITUACION =
  'No hay una situación hidrometeorológica en seguimiento para este establecimiento.'

// Marca interna para distinguir, dentro del catch de la transacción de
// POST, un rollback deliberado (diff vacío, spec §17) de un error real de
// escritura. Nunca sale de este archivo.
class RollbackDiffVacio extends Error {}

function contarAlcance(afectacion: Afectacion): { secciones: number; alumnos: number } {
  const alumnos = new Set<number>()
  for (const seccion of afectacion.secciones) {
    for (const id of seccion.alumnos) alumnos.add(id)
  }
  return { secciones: afectacion.secciones.length, alumnos: alumnos.size }
}

export async function GET(request: Request) {
  if (!tieneAccesoPublico(request)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  const db = getDb()
  const client = db.$client
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const actual = await obtenerParteActual(cue.value, corte.id)
  if (!actual) {
    // Sin período vigente: no es un error, es "sin situación en seguimiento"
    // (spec §17).
    return Response.json(
      { ok: true, periodo: null, parte: null, mensaje: MENSAJE_SIN_SITUACION },
      { status: 200, headers: CACHE_HEADERS },
    )
  }

  const snapshot = snapshotDesde(actual)
  const estadoGeneral = calcularEstadoServicioGeneral(snapshot.servicioAlcance, actual.secciones)

  // Une los ids de alumnos de TODAS las afectaciones vigentes y los resuelve
  // en una única llamada por lotes (spec batch 3: nunca por afectación, nunca
  // por alumno).
  const idsAlumnos = new Set<number>()
  for (const afectacion of snapshot.afectaciones) {
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

  const afectacionesRespuesta = snapshot.afectaciones.map((afectacion) => ({
    id: afectacion.id,
    motivo: afectacion.motivo,
    categoria: afectacion.categoria,
    severidad: afectacion.severidad,
    descripcion: afectacion.descripcion,
    rigeDesde: afectacion.rigeDesde,
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
    totales: contarAlcance(afectacion),
  }))

  return Response.json(
    {
      ok: true,
      periodo: actual.periodo,
      parte: actual.parte
        ? {
            id: actual.parte.id,
            cueAnexo: actual.parte.cueAnexo,
            estadoEstablecimiento: snapshot.estadoEstablecimiento,
            estadoEstablecimientoRigeDesde: actual.parte.estadoEstablecimientoRigeDesde,
            actualizadaEn: actual.parte.actualizadaEn,
          }
        : null,
      servicio: { estadoGeneral, alcanceVigente: snapshot.servicioAlcance },
      afectaciones: afectacionesRespuesta,
      secciones: actual.secciones,
      ultimaActualizacion: actual.parte?.actualizadaEn ?? null,
    },
    { status: 200, headers: CACHE_HEADERS },
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
) {
  const actual = await obtenerParteActual(cueAnexo, corteId)
  const snapshot: Pick<ParteActual, 'secciones'> & { servicioAlcance: ReturnType<typeof snapshotDesde>['servicioAlcance'] } =
    actual
      ? { secciones: actual.secciones, servicioAlcance: snapshotDesde(actual).servicioAlcance }
      : { secciones: [], servicioAlcance: [] }
  const estadoGeneral = calcularEstadoServicioGeneral(snapshot.servicioAlcance, snapshot.secciones)

  return Response.json(
    {
      ok: true,
      parteId,
      movimientoId,
      tipo,
      cambios: describirMovimiento(resumen, { tipo }),
      servicio: { estadoGeneral, alcanceVigente: snapshot.servicioAlcance },
    },
    { status },
  )
}

export async function POST(request: Request) {
  if (!tieneAccesoPublico(request)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

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

  const parsed = parseParteActualizacionInput(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const input = parsed.data

  const cue = normalizeCue(input.cue)
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  const db = getDb()
  const client = db.$client

  // Idempotencia: antes de cualquier escritura. Deliberadamente NO se aplica
  // CUE_MAX_ALERTAS_ACTIVAS acá (ver docs/trayectoria-contrato-implementacion.md
  // y batch-3-spec.md): hay un único parte por CUE y período, ese tope es
  // para infra_problematica y capar actualizaciones dejaría a un director
  // afuera en medio de una inundación.
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
    categoria: CategoriaProblematica
  }> = []
  for (const entrada of input.afectacionesNuevas) {
    const resuelto = resolverCategoria(entrada.motivo, motivos)
    if (!resuelto.ok) {
      return Response.json({ error: resuelto.error }, { status: 400 })
    }
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
      return Response.json(
        { error: 'Alguna de las secciones no pertenece al establecimiento indicado' },
        { status: 400 },
      )
    }
  }
  for (const modificacion of input.afectacionesModificadas) {
    if (modificacion.secciones && seccionInvalida(modificacion.secciones)) {
      return Response.json(
        { error: 'Alguna de las secciones no pertenece al establecimiento indicado' },
        { status: 400 },
      )
    }
  }
  if (input.servicioEducativo?.alcance.tipo === 'seccion' && seccionInvalida(input.servicioEducativo.alcance.secciones)) {
    return Response.json(
      { error: 'Alguna de las secciones no pertenece al establecimiento indicado' },
      { status: 400 },
    )
  }
  if (
    input.servicioEducativo?.alcance.tipo === 'turno' &&
    input.servicioEducativo.alcance.turnos.some((t) => !turnosCueSet.has(t))
  ) {
    return Response.json(
      { error: 'Alguno de los turnos no pertenece al establecimiento indicado' },
      { status: 400 },
    )
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
      return Response.json(
        { error: 'Alguno de los alumnos seleccionados no pertenece a las secciones indicadas' },
        { status: 400 },
      )
    }
  }

  const [parteExistente] = await db
    .select()
    .from(infraParte)
    .where(and(eq(infraParte.cueAnexo, cue.value), eq(infraParte.periodoId, periodo.id)))
    .limit(1)

  const idsReferenciados = [
    ...input.afectacionesModificadas.map((m) => m.id),
    ...input.afectacionesRetiradas,
  ]
  if (idsReferenciados.length > 0) {
    if (!parteExistente) {
      return Response.json(
        { error: 'La afectación indicada no existe en el parte actual' },
        { status: 400 },
      )
    }
    const existentes = await db
      .select()
      .from(infraAfectacion)
      .where(and(eq(infraAfectacion.parteId, parteExistente.id), inArray(infraAfectacion.id, idsReferenciados)))
    const existentesPorId = new Map(existentes.map((a) => [a.id, a]))
    for (const id of idsReferenciados) {
      const fila = existentesPorId.get(id)
      if (!fila || fila.retiradaEn !== null) {
        return Response.json(
          { error: 'La afectación indicada no existe o ya fue retirada' },
          { status: 400 },
        )
      }
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
        return Response.json(
          { error: 'Alguno de los alumnos seleccionados no pertenece a las secciones indicadas' },
          { status: 400 },
        )
      }
    }
  }

  // --- Fotografía "antes" (spec §12: referencia = rigeDesde del envío) ---

  const actualAntes: ParteActual = parteExistente
    ? {
        periodo,
        parte: { ...parteExistente, estadoEstablecimiento: parteExistente.estadoEstablecimiento as EstadoEstablecimiento },
        ...(await obtenerAfectacionesYServicio(db, client, parteExistente.id, corteId)),
        secciones,
      }
    : { periodo, parte: null, afectaciones: [], servicioAlcance: [], secciones }
  const antes = snapshotDesde(actualAntes, input.rigeDesde)

  const ahora = new Date().toISOString()
  const esNuevoParte = !parteExistente
  let resultado: { status: number; body: unknown }

  try {
    resultado = await db.transaction(async (tx) => {
      let parteId: string
      if (parteExistente) {
        parteId = parteExistente.id
      } else {
        const nuevoId = crypto.randomUUID()
        await tx
          .insert(infraParte)
          .values({
            id: nuevoId,
            periodoId: periodo.id,
            cueAnexo: cue.value,
            estadoEstablecimiento: 'habitual',
            estadoEstablecimientoRigeDesde: input.rigeDesde,
            corteId,
            creadaEn: ahora,
            actualizadaEn: ahora,
          })
          // Carrera en (cue_anexo, periodo_id): si otra request ya creó el
          // parte, no hace falta el regex-catch de la ruta de problemáticas
          // porque este insert simplemente no hace nada y releemos abajo.
          .onConflictDoNothing()
        const [fila] = await tx
          .select({ id: infraParte.id })
          .from(infraParte)
          .where(and(eq(infraParte.cueAnexo, cue.value), eq(infraParte.periodoId, periodo.id)))
          .limit(1)
        if (!fila) throw new Error('No se pudo crear ni leer el parte')
        parteId = fila.id
      }

      for (const { input: entrada, categoria } of nuevasConCategoria) {
        const id = crypto.randomUUID()
        await tx.insert(infraAfectacion).values({
          id,
          parteId,
          motivo: entrada.motivo,
          categoria,
          severidad: entrada.severidad,
          descripcion: entrada.descripcion ?? null,
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
        const cambios: { severidad?: string; descripcion?: string | null } = {}
        if (modificacion.severidad !== undefined) cambios.severidad = modificacion.severidad
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
          .set({ retiradaEn: input.rigeDesde })
          .where(inArray(infraAfectacion.id, input.afectacionesRetiradas))
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
      } = { actualizadaEn: ahora }
      if (input.estadoEstablecimiento) {
        actualizacionParte.estadoEstablecimiento = input.estadoEstablecimiento.estado
        actualizacionParte.estadoEstablecimientoRigeDesde = input.rigeDesde
      }
      await tx.update(infraParte).set(actualizacionParte).where(eq(infraParte.id, parteId))

      // Fotografía "después", dentro de la misma transacción: si el diff
      // resulta vacío hay que poder revertir todo lo anterior.
      const { afectaciones: afectacionesDespues, servicioAlcance: servicioAlcanceDespues } =
        await obtenerAfectacionesYServicio(tx, client, parteId, corteId)
      const [parteDespues] = await tx.select().from(infraParte).where(eq(infraParte.id, parteId)).limit(1)
      const despues = snapshotDesde(
        {
          periodo,
          parte: parteDespues
            ? { ...parteDespues, estadoEstablecimiento: parteDespues.estadoEstablecimiento as EstadoEstablecimiento }
            : null,
          afectaciones: afectacionesDespues,
          servicioAlcance: servicioAlcanceDespues,
          secciones,
        },
        input.rigeDesde,
      )

      const diff = diffParte(antes, despues)
      if (esDiffVacio(diff)) {
        // Revierte todo lo escrito en este callback: Drizzle hace ROLLBACK
        // cuando el callback de transaction() lanza.
        throw new RollbackDiffVacio()
      }

      const tipoMovimiento: TipoMovimiento = esNuevoParte ? 'reporte_inicial' : 'actualizacion'
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
  } catch (err) {
    if (err instanceof RollbackDiffVacio) {
      return Response.json(
        { error: 'Todavía no realizó cambios en el parte actual' },
        { status: 409 },
      )
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (/UNIQUE constraint failed.*idempotency_key/i.test(msg)) {
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
        )
      }
    }
    return Response.json({ error: 'No se pudo guardar la actualización' }, { status: 500 })
  }

  return Response.json(resultado.body, { status: resultado.status })
}
