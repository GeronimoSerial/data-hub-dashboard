// Motor de diffing de movimientos (spec §13, §15). Compara dos fotografías
// (`before`/`after`) de un mismo parte y produce un diff estructurado, el
// mismo objeto que se persiste en infra_movimiento.resumen (JSON) y que
// describirMovimiento (movimiento-descripcion.ts) traduce a español llano.
//
// Regla explícita de spec §13: "sin repetir toda la información que
// permanece igual" — este diff NUNCA vuelve a listar lo que no cambió. Todo
// lo que aparece acá es, por construcción, una diferencia real entre los dos
// snapshots.
//
// El matcheo de afectaciones es por `id`: una afectación editada (severidad,
// alcance) conserva su id entre `before` y `after` — no es una fila nueva.
// Sólo aparece en `afectacionesAgregadas` si su id no existía en `before`, y
// en `afectacionesRetiradas` si existía en `before` y no está en `after`
// (recordar que ParteSnapshot.afectaciones es siempre el conjunto vigente:
// una afectación retirada desaparece del `after` vigente aunque su fila siga
// existiendo con retiradaEn seteado).
import type {
  Afectacion,
  Categoria,
  EstadoEstablecimiento,
  ParteSnapshot,
  Severidad,
  ServicioAlcance,
  ServicioAlcanceTipo,
  ServicioEstado,
} from './trayectoria-tipos'
import { claveServicioAlcance } from './vigencia-alcance'

export interface DiffAfectacionAgregada {
  afectacionId: string
  motivo: string
  categoria: Categoria
  severidad: Severidad
  secciones: number
  alumnos: number
}

export interface DiffAfectacionRetirada {
  afectacionId: string
  motivo: string
}

export interface DiffSeveridadCambio {
  afectacionId: string
  motivo: string
  de: Severidad
  a: Severidad
}

export interface DiffAlcanceCambio {
  afectacionId: string
  motivo: string
  seccionesAgregadas: number
  seccionesRetiradas: number
  alumnosAgregados: number
  alumnosRetirados: number
}

export interface DiffCampoCambio {
  campo: 'motivo' | 'categoria' | 'descripcion'
  de: string | null
  a: string | null
}

export interface DiffDatosCambio {
  afectacionId: string
  motivo: string
  campos: DiffCampoCambio[]
  seccionesConSeleccionCambiada: number[]
}

export interface DiffServicioAlcanceRef {
  tipo: ServicioAlcanceTipo
  referenciaId: string | null
  etiqueta?: string
}

export interface DiffServicioCambio {
  alcance: DiffServicioAlcanceRef
  de: ServicioEstado | null
  a: ServicioEstado | null
}

export interface DiffEstablecimientoCambio {
  de: EstadoEstablecimiento
  a: EstadoEstablecimiento
}

export interface DiffParte {
  afectacionesAgregadas: DiffAfectacionAgregada[]
  afectacionesRetiradas: DiffAfectacionRetirada[]
  severidadesCambiadas: DiffSeveridadCambio[]
  alcancesCambiados: DiffAlcanceCambio[]
  datosCambiados: DiffDatosCambio[]
  serviciosCambiados: DiffServicioCambio[]
  establecimientoCambiado: DiffEstablecimientoCambio | null
}

function contarAlcance(afectacion: Afectacion): { secciones: number; alumnos: number } {
  const alumnos = new Set<number>()
  for (const seccion of afectacion.secciones) {
    for (const id of seccion.alumnos) alumnos.add(id)
  }
  return { secciones: afectacion.secciones.length, alumnos: alumnos.size }
}

function alumnosPorSeccion(afectacion: Afectacion): Map<number, Set<number>> {
  const mapa = new Map<number, Set<number>>()
  for (const seccion of afectacion.secciones) {
    mapa.set(seccion.geSectionId, new Set(seccion.alumnos))
  }
  return mapa
}

function diffAlcanceAfectacion(
  antes: Afectacion,
  despues: Afectacion,
): DiffAlcanceCambio | null {
  const seccionesAntes = new Set(antes.secciones.map((s) => s.geSectionId))
  const seccionesDespues = new Set(despues.secciones.map((s) => s.geSectionId))

  const seccionesAgregadas = [...seccionesDespues].filter((id) => !seccionesAntes.has(id)).length
  const seccionesRetiradas = [...seccionesAntes].filter((id) => !seccionesDespues.has(id)).length

  const alumnosAntes = alumnosPorSeccion(antes)
  const alumnosDespues = alumnosPorSeccion(despues)

  let alumnosAgregados = 0
  let alumnosRetirados = 0

  // Alumnos dentro de secciones presentes en ambos lados.
  for (const [seccionId, despuesSet] of alumnosDespues) {
    if (!seccionesAntes.has(seccionId)) continue
    const antesSet = alumnosAntes.get(seccionId) ?? new Set<number>()
    for (const id of despuesSet) if (!antesSet.has(id)) alumnosAgregados++
    for (const id of antesSet) if (!despuesSet.has(id)) alumnosRetirados++
  }
  // Alumnos de secciones agregadas enteras cuentan como incorporados.
  for (const seccionId of seccionesDespues) {
    if (seccionesAntes.has(seccionId)) continue
    alumnosAgregados += alumnosDespues.get(seccionId)?.size ?? 0
  }
  // Alumnos de secciones retiradas enteras cuentan como retirados.
  for (const seccionId of seccionesAntes) {
    if (seccionesDespues.has(seccionId)) continue
    alumnosRetirados += alumnosAntes.get(seccionId)?.size ?? 0
  }

  if (
    seccionesAgregadas === 0 &&
    seccionesRetiradas === 0 &&
    alumnosAgregados === 0 &&
    alumnosRetirados === 0
  ) {
    return null
  }

  return {
    afectacionId: despues.id,
    motivo: despues.motivo,
    seccionesAgregadas,
    seccionesRetiradas,
    alumnosAgregados,
    alumnosRetirados,
  }
}

function diffDatosAfectacion(antes: Afectacion, despues: Afectacion): DiffDatosCambio | null {
  const campos: DiffCampoCambio[] = []
  if (antes.motivo !== despues.motivo) {
    campos.push({ campo: 'motivo', de: antes.motivo, a: despues.motivo })
  }
  if (antes.categoria !== despues.categoria) {
    campos.push({ campo: 'categoria', de: antes.categoria, a: despues.categoria })
  }
  if (antes.descripcion !== despues.descripcion) {
    campos.push({ campo: 'descripcion', de: antes.descripcion, a: despues.descripcion })
  }

  const seccionCompletaAntes = new Map(antes.secciones.map((s) => [s.geSectionId, s.seccionCompleta]))
  const seccionesConSeleccionCambiada: number[] = []
  for (const seccion of despues.secciones) {
    const previaCompleta = seccionCompletaAntes.get(seccion.geSectionId)
    if (previaCompleta !== undefined && previaCompleta !== seccion.seccionCompleta) {
      seccionesConSeleccionCambiada.push(seccion.geSectionId)
    }
  }

  if (campos.length === 0 && seccionesConSeleccionCambiada.length === 0) return null

  return {
    afectacionId: despues.id,
    motivo: despues.motivo,
    campos,
    seccionesConSeleccionCambiada,
  }
}

function diffAfectaciones(antes: Afectacion[], despues: Afectacion[]) {
  const antesPorId = new Map(antes.map((a) => [a.id, a]))
  const despuesPorId = new Map(despues.map((a) => [a.id, a]))

  const afectacionesAgregadas: DiffAfectacionAgregada[] = []
  const afectacionesRetiradas: DiffAfectacionRetirada[] = []
  const severidadesCambiadas: DiffSeveridadCambio[] = []
  const alcancesCambiados: DiffAlcanceCambio[] = []
  const datosCambiados: DiffDatosCambio[] = []

  for (const afectacion of despues) {
    const previa = antesPorId.get(afectacion.id)
    if (!previa) {
      const { secciones, alumnos } = contarAlcance(afectacion)
      afectacionesAgregadas.push({
        afectacionId: afectacion.id,
        motivo: afectacion.motivo,
        categoria: afectacion.categoria,
        severidad: afectacion.severidad,
        secciones,
        alumnos,
      })
      continue
    }

    if (previa.severidad !== afectacion.severidad) {
      severidadesCambiadas.push({
        afectacionId: afectacion.id,
        motivo: afectacion.motivo,
        de: previa.severidad,
        a: afectacion.severidad,
      })
    }

    const cambioDatos = diffDatosAfectacion(previa, afectacion)
    if (cambioDatos) datosCambiados.push(cambioDatos)

    const cambioAlcance = diffAlcanceAfectacion(previa, afectacion)
    if (cambioAlcance) alcancesCambiados.push(cambioAlcance)
  }

  for (const afectacion of antes) {
    if (!despuesPorId.has(afectacion.id)) {
      afectacionesRetiradas.push({ afectacionId: afectacion.id, motivo: afectacion.motivo })
    }
  }

  return { afectacionesAgregadas, afectacionesRetiradas, severidadesCambiadas, alcancesCambiados, datosCambiados }
}

function diffServicio(antes: ServicioAlcance[], despues: ServicioAlcance[]): DiffServicioCambio[] {
  const antesPorClave = new Map(antes.map((f) => [claveServicioAlcance(f), f]))
  const despuesPorClave = new Map(despues.map((f) => [claveServicioAlcance(f), f]))

  const claves = new Set([...antesPorClave.keys(), ...despuesPorClave.keys()])
  const cambios: DiffServicioCambio[] = []

  for (const clave of claves) {
    const filaAntes = antesPorClave.get(clave)
    const filaDespues = despuesPorClave.get(clave)
    const de = filaAntes?.estado ?? null
    const a = filaDespues?.estado ?? null
    if (de === a) continue

    const referencia = filaDespues ?? filaAntes
    if (!referencia) continue

    cambios.push({
      alcance: {
        tipo: referencia.tipo,
        referenciaId: referencia.referenciaId,
        etiqueta: referencia.etiqueta,
      },
      de,
      a,
    })
  }

  return cambios
}

function diffEstablecimiento(
  antes: EstadoEstablecimiento,
  despues: EstadoEstablecimiento,
): DiffEstablecimientoCambio | null {
  if (antes === despues) return null
  return { de: antes, a: despues }
}

export function diffParte(antes: ParteSnapshot, despues: ParteSnapshot): DiffParte {
  const { afectacionesAgregadas, afectacionesRetiradas, severidadesCambiadas, alcancesCambiados, datosCambiados } =
    diffAfectaciones(antes.afectaciones, despues.afectaciones)

  return {
    afectacionesAgregadas,
    afectacionesRetiradas,
    severidadesCambiadas,
    alcancesCambiados,
    datosCambiados,
    serviciosCambiados: diffServicio(antes.servicioAlcance, despues.servicioAlcance),
    establecimientoCambiado: diffEstablecimiento(antes.estadoEstablecimiento, despues.estadoEstablecimiento),
  }
}

// Un diff vacío es lo que habilita/deshabilita el botón de guardar (spec
// §17: "Todavía no realizó cambios en el parte actual"). Se expone como
// función aparte para que las UI (batches 4-7) no tengan que conocer la
// forma interna del diff para tomar esa decisión.
export function esDiffVacio(diff: DiffParte): boolean {
  return (
    diff.afectacionesAgregadas.length === 0 &&
    diff.afectacionesRetiradas.length === 0 &&
    diff.severidadesCambiadas.length === 0 &&
    diff.alcancesCambiados.length === 0 &&
    diff.datosCambiados.length === 0 &&
    diff.serviciosCambiados.length === 0 &&
    diff.establecimientoCambiado === null
  )
}
