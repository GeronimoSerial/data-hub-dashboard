// Capa de lectura del parte (spec §6, §7, §8): tanto GET /parte como
// POST /parte la necesitan — POST para armar la fotografía "antes" contra la
// que diffParte compara. Framework-free salvo por el acceso a Drizzle y al
// schema `ge` de Postgres (a diferencia de trayectoria-tipos.ts y el resto del
// batch 2, que son puros): esta capa SÍ hace I/O, a propósito, porque es la
// que arma los snapshots que consume la capa pura.
import { crearEjecutorSql, type EjecutorSql } from './ge-db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraMovimiento,
  infraParte,
  infraPeriodo,
  infraServicioAlcance,
} from '@/lib/db/schema'
import { asegurarGeAdjuntada, obtenerMembresiaSecciones } from './impacto'
import { describirMovimiento } from './movimiento-descripcion'
import type { DiffParte } from './movimiento-diff'
import { listarSeccionesDelCue } from './secciones-cue'
import { calcularEstadoServicioGeneral } from './servicio-educativo'
import { claveServicioAlcance, resolverAlcanceVigente } from './vigencia-alcance'
import type {
  Afectacion,
  AfectacionAlcanceSeccion,
  Categoria,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
  Parte,
  ParteSnapshot,
  RolMovimiento,
  SeccionEstablecimiento,
  Severidad,
  ServicioAlcance,
  ServicioAlcanceTipo,
  ServicioEstado,
  TipoMovimiento,
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
// criterio que calcularImpactoSecciones (impacto.ts): una sección cuenta
// "completa" (seccionCompleta: true, alumnos = toda la
// matrícula) salvo que alguno de sus alumnos matriculados esté entre los
// seleccionados puntualmente para esta afectación — en ese caso cuenta sólo
// la intersección. infra_afectacion_alumno no guarda a qué sección pertenece
// cada alumno seleccionado (la ausencia de filas es la semántica de "sección
// completa"): esa
// pertenencia se resuelve acá, contra la matrícula real del corte vigente,
// no se infiere de la fila persistida.
async function cargarAfectaciones(
  dbEjecutor: DbEjecutor,
  client: EjecutorSql,
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
  client: EjecutorSql,
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

  const client = crearEjecutorSql(getRawClient())
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

// Ficha de una afectación lista para mostrar: mismos campos que Afectacion
// (trayectoria-tipos) más `totales`, el conteo de secciones/alumnos únicos
// que antes armaba `contarAlcance` en el route handler del director. Se
// preserva `secciones` (los ids crudos de alumno por sección) para que quien
// resuelva nombres — hoy sólo la ruta del director — pueda hacerlo; el
// llamador del mapa (F3.2) descarta ese campo antes de responder.
export interface AfectacionFicha {
  id: string
  motivo: string
  categoria: Categoria
  severidad: Severidad
  descripcion: string | null
  rigeDesde: string
  secciones: AfectacionAlcanceSeccion[]
  totales: { secciones: number; alumnos: number }
}

export interface FichaParte {
  periodo: { id: string; nombre: string }
  parte: {
    id: string
    cueAnexo: string
    estadoEstablecimiento: EstadoEstablecimiento
    estadoEstablecimientoRigeDesde: string
    actualizadaEn: string
  } | null
  servicio: { estadoGeneral: EstadoServicioGeneral; alcanceVigente: ServicioAlcance[] }
  afectaciones: AfectacionFicha[]
  secciones: SeccionEstablecimiento[]
  ultimaActualizacion: string | null
}

// Arma la ficha completa de un parte (servicio, estado, afectaciones
// vigentes con sus conteos) para consumo compartido entre la ruta del
// director (app/api/problematicas/parte/route.ts) y la del mapa
// (app/api/mapas/infraestructura/parte/route.ts, F3.2). Deliberadamente NO
// resuelve nombres de alumnos: sólo el flujo del director, autenticado por
// cookie y sujeto al gate nominal auditado, puede mostrarlos (F3.3); el mapa
// se abre con el acceso de lectura amplio del hub y sólo debe ver conteos.
export async function armarFichaParte(cueAnexo: string, corteId: number): Promise<FichaParte | null> {
  const actual = await obtenerParteActual(cueAnexo, corteId)
  if (!actual) return null

  const snapshot = snapshotDesde(actual)
  const estadoGeneral = calcularEstadoServicioGeneral(snapshot.servicioAlcance, actual.secciones)

  const afectaciones: AfectacionFicha[] = snapshot.afectaciones.map((afectacion) => {
    const alumnosUnicos = new Set<number>()
    for (const seccion of afectacion.secciones) {
      for (const id of seccion.alumnos) alumnosUnicos.add(id)
    }
    return {
      id: afectacion.id,
      motivo: afectacion.motivo,
      categoria: afectacion.categoria,
      severidad: afectacion.severidad,
      descripcion: afectacion.descripcion,
      rigeDesde: afectacion.rigeDesde,
      secciones: afectacion.secciones,
      totales: { secciones: afectacion.secciones.length, alumnos: alumnosUnicos.size },
    }
  })

  return {
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
    afectaciones,
    secciones: actual.secciones,
    ultimaActualizacion: actual.parte?.actualizadaEn ?? null,
  }
}

export interface MovimientoDescrito {
  id: string
  tipo: TipoMovimiento
  rol: RolMovimiento
  creadaEn: string
  rigeDesde: string
  cambios: string[]
}

// Historial de movimientos de un parte, ya traducidos a prosa castellana
// (describirMovimiento). Compartida entre la ruta del director
// (app/api/problematicas/parte/historial/route.ts) y la ruta paralela del
// mapa (app/api/mapas/infraestructura/historial/route.ts, F3.4): misma
// lectura, dos guardas de acceso distintas — el historial no lleva nombres
// de alumnos (nunca los llevó), así que no hay nada que degradar acá.
export async function listarMovimientosDescritos(
  cueAnexo: string,
  corteId: number,
): Promise<MovimientoDescrito[]> {
  const actual = await obtenerParteActual(cueAnexo, corteId)
  // Sin período vigente o sin parte todavía: no es un error, es historial
  // vacío (mismo criterio que las rutas que ya consumían este caso).
  if (!actual || !actual.parte) return []

  const db = getDb()
  const filas = await db
    .select()
    .from(infraMovimiento)
    .where(eq(infraMovimiento.parteId, actual.parte.id))
    .orderBy(desc(infraMovimiento.creadaEn))

  return filas.map((fila) => {
    const tipo = fila.tipo as TipoMovimiento
    return {
      id: fila.id,
      tipo,
      rol: fila.rol as RolMovimiento,
      creadaEn: fila.creadaEn,
      rigeDesde: fila.rigeDesde,
      cambios: describirMovimiento(fila.resumen as unknown as DiffParte, { tipo }),
    }
  })
}
