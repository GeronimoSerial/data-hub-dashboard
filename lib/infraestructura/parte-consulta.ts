// Capa de lectura del parte (spec §6, §7, §8): tanto GET /parte como
// POST /parte la necesitan — POST para armar la fotografía "antes" contra la
// que diffParte compara. Framework-free salvo por el acceso a Drizzle y a
// ge.sqlite (a diferencia de trayectoria-tipos.ts y el resto del batch 2, que
// son puros): esta capa SÍ hace I/O, a propósito, porque es la que arma los
// snapshots que consume la capa pura.
import type { Client } from '@libsql/client'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraParte,
  infraPeriodo,
  infraServicioAlcance,
} from '@/lib/db/schema'
import { asegurarGeAdjuntada, obtenerMembresiaSecciones } from './impacto'
import { listarSeccionesDelCue } from './secciones-cue'
import { claveServicioAlcance, resolverAlcanceVigente } from './vigencia-alcance'
import type {
  Afectacion,
  AfectacionAlcanceSeccion,
  Categoria,
  EstadoEstablecimiento,
  Parte,
  ParteSnapshot,
  SeccionEstablecimiento,
  Severidad,
  ServicioAlcance,
  ServicioAlcanceTipo,
  ServicioEstado,
} from './trayectoria-tipos'

// Cualquiera de los dos: la conexión de Drizzle "suelta" (getDb()) o el `tx`
// que entrega `db.transaction(async (tx) => ...)` — ambos exponen la misma
// API de `.select()`, que es todo lo que esta capa necesita para leer. Esto
// es lo que le permite a app/api/problematicas/parte/route.ts armar la
// fotografía "después" DENTRO de la misma transacción que escribe los
// cambios, para poder revertirla si el diff resulta vacío (spec §17), sin
// que esta capa tenga que saber nada de transacciones. Se tipa por lo mínimo
// que se usa (sólo `.select()`) en vez de `ReturnType<typeof getDb>` porque
// el objeto `tx` de una transacción de Drizzle no es asignable a ese tipo
// completo (le faltan métodos como `.batch()` que esta capa nunca llama).
type DbEjecutor = Pick<ReturnType<typeof getDb>, 'select'>

export interface ParteActual {
  periodo: { id: string; nombre: string }
  parte: Parte | null
  // TODAS las afectaciones (vigentes y retiradas): quien necesite sólo las
  // vigentes aplica resolverAlcanceVigente (ver snapshotDesde).
  afectaciones: Afectacion[]
  // TODOS los alcances de servicio (vigentes y retirados), mismo criterio.
  servicioAlcance: ServicioAlcance[]
  // Secciones del corte vigente para este CUE — insumo de
  // calcularEstadoServicioGeneral.
  secciones: SeccionEstablecimiento[]
}

export async function obtenerPeriodoVigente(
  dbEjecutor: DbEjecutor = getDb(),
): Promise<{ id: string; nombre: string } | null> {
  const [row] = await dbEjecutor
    .select({ id: infraPeriodo.id, nombre: infraPeriodo.nombre })
    .from(infraPeriodo)
    .where(eq(infraPeriodo.estado, 'vigente'))
    .limit(1)
  return row ?? null
}

// Arma las AfectacionAlcanceSeccion de una afectación aplicando el MISMO
// criterio que calcularImpactoSecciones (impacto.ts) e infra_problematica_*:
// una sección cuenta "completa" (seccionCompleta: true, alumnos = toda la
// matrícula) salvo que alguno de sus alumnos matriculados esté entre los
// seleccionados puntualmente para esta afectación — en ese caso cuenta sólo
// la intersección. infra_afectacion_alumno no guarda a qué sección pertenece
// cada alumno seleccionado (mismo diseño que infra_problematica_alumno): esa
// pertenencia se resuelve acá, contra la matrícula real del corte vigente,
// no se infiere de la fila persistida.
async function cargarAfectaciones(
  dbEjecutor: DbEjecutor,
  client: Client,
  parteId: string,
  corteId: number,
): Promise<Afectacion[]> {
  const filas = await dbEjecutor
    .select()
    .from(infraAfectacion)
    .where(eq(infraAfectacion.parteId, parteId))
  if (filas.length === 0) return []

  const afectacionIds = filas.map((f) => f.id)
  const seccionesRows = await dbEjecutor
    .select()
    .from(infraAfectacionSeccion)
    .where(inArray(infraAfectacionSeccion.afectacionId, afectacionIds))
  const alumnosRows = await dbEjecutor
    .select()
    .from(infraAfectacionAlumno)
    .where(inArray(infraAfectacionAlumno.afectacionId, afectacionIds))

  const seccionesPorAfectacion = new Map<string, number[]>()
  for (const s of seccionesRows) {
    const lista = seccionesPorAfectacion.get(s.afectacionId) ?? []
    lista.push(s.geSectionId)
    seccionesPorAfectacion.set(s.afectacionId, lista)
  }
  const alumnosPorAfectacion = new Map<string, number[]>()
  for (const a of alumnosRows) {
    const lista = alumnosPorAfectacion.get(a.afectacionId) ?? []
    lista.push(a.gePersonId)
    alumnosPorAfectacion.set(a.afectacionId, lista)
  }

  // Una sola consulta de membresía para TODAS las secciones de TODAS las
  // afectaciones del parte, nunca una por afectación.
  const todasLasSecciones = [...new Set(seccionesRows.map((s) => s.geSectionId))]
  const membresia = await obtenerMembresiaSecciones(client, {
    corteId,
    geSectionIds: todasLasSecciones,
  })

  return filas.map((fila): Afectacion => {
    const seccionIds = seccionesPorAfectacion.get(fila.id) ?? []
    const alumnosSeleccionados = new Set(alumnosPorAfectacion.get(fila.id) ?? [])
    const secciones: AfectacionAlcanceSeccion[] = seccionIds.map((geSectionId) => {
      const matriculados = membresia.get(geSectionId) ?? new Set<number>()
      const interseccion = [...matriculados].filter((id) => alumnosSeleccionados.has(id))
      if (interseccion.length > 0) {
        return { geSectionId, seccionCompleta: false, alumnos: interseccion }
      }
      return { geSectionId, seccionCompleta: true, alumnos: [...matriculados] }
    })

    return {
      id: fila.id,
      parteId: fila.parteId,
      motivo: fila.motivo,
      categoria: fila.categoria as Categoria,
      severidad: fila.severidad as Severidad,
      descripcion: fila.descripcion,
      rigeDesde: fila.rigeDesde,
      creadaEn: fila.creadaEn,
      retiradaEn: fila.retiradaEn,
      secciones,
    }
  })
}

async function cargarServicioAlcance(
  dbEjecutor: DbEjecutor,
  parteId: string,
): Promise<ServicioAlcance[]> {
  const filas = await dbEjecutor
    .select()
    .from(infraServicioAlcance)
    .where(eq(infraServicioAlcance.parteId, parteId))

  return filas.map((fila): ServicioAlcance => {
    // Etiqueta legible sólo donde sale gratis (spec batch 3): para 'turno',
    // el propio referenciaId ya ES el nombre del turno. Para 'seccion' haría
    // falta curso+division de ge_seccion, que esta capa no trae acá (ver
    // SeccionEstablecimiento en trayectoria-tipos.ts: sólo geSectionId y
    // turno) — se deja sin etiqueta a propósito.
    const etiqueta =
      fila.tipo === 'turno' && fila.referenciaId ? fila.referenciaId : undefined
    return {
      id: fila.id,
      parteId: fila.parteId,
      tipo: fila.tipo as ServicioAlcanceTipo,
      referenciaId: fila.referenciaId,
      estado: fila.estado as ServicioEstado,
      rigeDesde: fila.rigeDesde,
      creadaEn: fila.creadaEn,
      retiradaEn: fila.retiradaEn,
      etiqueta,
    }
  })
}

// Variante de bajo nivel usada por el POST (app/api/problematicas/parte/route.ts)
// para releer afectaciones y alcance de servicio DENTRO de la transacción que
// aplica los cambios, pasando `tx` en vez de getDb(). No forma parte del
// contrato público mínimo del batch 3, pero evita duplicar la lógica de
// cargarAfectaciones/cargarServicioAlcance en el route handler.
export async function obtenerAfectacionesYServicio(
  dbEjecutor: DbEjecutor,
  client: Client,
  parteId: string,
  corteId: number,
): Promise<{ afectaciones: Afectacion[]; servicioAlcance: ServicioAlcance[] }> {
  const afectaciones = await cargarAfectaciones(dbEjecutor, client, parteId, corteId)
  const servicioAlcance = await cargarServicioAlcance(dbEjecutor, parteId)
  return { afectaciones, servicioAlcance }
}

export async function obtenerParteActual(
  cueAnexo: string,
  corteId: number,
): Promise<ParteActual | null> {
  const db = getDb()
  const periodo = await obtenerPeriodoVigente(db)
  if (!periodo) return null

  const client = db.$client
  await asegurarGeAdjuntada(client)
  const secciones = await listarSeccionesDelCue(client, corteId, cueAnexo)

  const [parteRow] = await db
    .select()
    .from(infraParte)
    .where(and(eq(infraParte.cueAnexo, cueAnexo), eq(infraParte.periodoId, periodo.id)))
    .limit(1)

  if (!parteRow) {
    return { periodo, parte: null, afectaciones: [], servicioAlcance: [], secciones }
  }

  const { afectaciones, servicioAlcance } = await obtenerAfectacionesYServicio(
    db,
    client,
    parteRow.id,
    corteId,
  )

  return {
    periodo,
    parte: { ...parteRow, estadoEstablecimiento: parteRow.estadoEstablecimiento as EstadoEstablecimiento },
    afectaciones,
    servicioAlcance,
    secciones,
  }
}

// Aplica resolverAlcanceVigente a afectaciones y servicioAlcance (con
// claveServicioAlcance como clave de agrupación, ver vigencia-alcance.ts) y
// arma el ParteSnapshot que diffParte consume. Un `actual.parte` ausente se
// representa como el snapshot vacío por defecto (estadoEstablecimiento
// 'habitual'), igual que crearSnapshotVacio en trayectoria-tipos.ts.
export function snapshotDesde(actual: ParteActual, referencia?: Date | string): ParteSnapshot {
  return {
    estadoEstablecimiento: actual.parte?.estadoEstablecimiento ?? 'habitual',
    afectaciones: resolverAlcanceVigente(actual.afectaciones, { referencia }),
    servicioAlcance: resolverAlcanceVigente(actual.servicioAlcance, {
      referencia,
      clave: claveServicioAlcance,
    }),
  }
}
