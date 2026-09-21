// Tipos de dominio para la trayectoria de situaciones hidrometeorológicas.
// Ver docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md y
// el CONTRACT.md del batch de esquema (lib/db/schema.ts:284+ es la fuente de
// verdad de las columnas; este archivo es la vista de dominio, pura y sin
// dependencias de Drizzle, que usan las funciones puras del batch 2 y que
// consumirán los route handlers (batch 3) y los componentes (batches 4-7).
//
// Nada acá hace I/O. Los snapshots (Afectacion, ServicioAlcance, Parte) se
// arman en la capa que sí tiene acceso a la base (batch 3) y se pasan como
// datos simples a estas funciones.

import type { Severidad } from './validacion'
import type { CategoriaProblematica as Categoria } from './categorias'

export type { Severidad, Categoria }

// --- Enums / uniones (mismos nombres que CONTRACT.md) ---

export type EstadoEstablecimiento = 'habitual' | 'evacuado' | 'centro_evacuados'

// Lo que el director elige (spec §3.4): sólo dos opciones. "parcial" NUNCA es
// una opción de carga, ver EstadoServicioGeneral más abajo.
export type ServicioEstado = 'normal' | 'suspendido'

export type ServicioAlcanceTipo = 'establecimiento' | 'turno' | 'seccion'

export type TipoMovimiento =
  | 'reporte_inicial'
  | 'actualizacion'
  | 'cambio_servicio'
  | 'cambio_establecimiento'
  // Reservado para el futuro recorrido de supervisor (spec §3.3, §10 de
  // CONTRACT.md). Ninguna función de este batch produce este valor.
  | 'resolucion'

export type RolMovimiento = 'director' | 'supervisor'

// Derivado, nunca persistido (spec §3.4, §10; CONTRACT.md "Derived, never
// stored"). Lo calcula calcularEstadoServicioGeneral a partir del alcance
// vigente. Sólo para mostrar: el director nunca lo elige.
export type EstadoServicioGeneral = 'normal' | 'parcial' | 'suspendido'

// --- Filas con vigencia temporal (spec §12) ---
//
// Toda fila con rigeDesde/retiradaEn describe un intervalo semiabierto de
// vigencia: [rigeDesde, retiradaEn). Ver resolverAlcanceVigente en
// vigencia-alcance.ts para cómo se resuelve "vigente en el instante T" a
// partir de este intervalo, incluyendo el caso de rigeDesde futuro.
export interface FilaConVigencia {
  rigeDesde: string
  retiradaEn: string | null
}

// --- Afectación (spec §3.2, §9) ---

// Selección de alcance de una afectación dentro de una sección. La ausencia
// de `alumnos` (o un arreglo vacío) significa "sección completa" — mismo
// criterio que infraProblematicaSeccion/infraProblematicaAlumno en
// lib/db/schema.ts. `alumnos` acá ya viene resuelto contra el corte vigente
// por quien arma el snapshot (batch 3): esta capa es pura y no puede
// consultar ge.sqlite para saber cuántos alumnos matricula una sección.
export interface AfectacionAlcanceSeccion {
  geSectionId: number
  // true cuando la selección fue "toda la sección" (no hay filas en
  // infra_afectacion_alumno para esta sección). Se conserva explícito en vez
  // de inferirlo de `alumnos.length === 0` porque una sección con matrícula 0
  // también sería "completa" con alumnos = [].
  seccionCompleta: boolean
  // IDs de alumnos efectivamente alcanzados en esta sección. Si
  // seccionCompleta es true, es la lista completa de matriculados (resuelta
  // por quien arma el snapshot); si es false, es la selección parcial tal
  // cual está persistida.
  alumnos: number[]
}

export interface Afectacion extends FilaConVigencia {
  id: string
  parteId: string
  motivo: string
  categoria: Categoria
  severidad: Severidad
  descripcion: string | null
  creadaEn: string
  secciones: AfectacionAlcanceSeccion[]
}

// --- Servicio educativo (spec §10) ---

export interface ServicioAlcance extends FilaConVigencia {
  id: string
  parteId: string
  tipo: ServicioAlcanceTipo
  // null sólo cuando tipo === 'establecimiento'. Para 'turno' es el nombre
  // del turno; para 'seccion' es el geSectionId como texto (mismo criterio
  // que infra_servicio_alcance.referencia_id en lib/db/schema.ts).
  referenciaId: string | null
  estado: ServicioEstado
  creadaEn: string
  // Etiqueta legible del alcance (p. ej. "2.º A" para una sección, el nombre
  // del turno para un turno). NO es una columna de la tabla: la resuelve
  // quien arma el snapshot (batch 3, con datos del corte vigente) sólo para
  // que describirMovimiento pueda producir textos como "en 2.º A" sin volver
  // a consultar la base. Ausente para tipo === 'establecimiento' (no hace
  // falta: el alcance es todo el establecimiento).
  etiqueta?: string
}

// Sección del establecimiento tal como la necesita
// calcularEstadoServicioGeneral: sólo lo mínimo para agrupar por turno y por
// sección. Se arma a partir del corte vigente (ver ContextoCue en
// contexto.ts); no es un tipo nuevo de esa fuente, es lo mínimo que esta capa
// pura necesita.
export interface SeccionEstablecimiento {
  geSectionId: number
  turno: string
}

// --- Movimiento (spec §3.3, §15) ---

export interface Movimiento {
  id: string
  parteId: string
  tipo: TipoMovimiento
  rol: RolMovimiento
  // Diff estructurado (ver movimiento-diff.ts). Se persiste tal cual en
  // infra_movimiento.resumen (columna JSON).
  resumen: Record<string, unknown>
  rigeDesde: string
  creadaEn: string
}

// --- Parte (spec §3.1, lo que el director ve y actualiza) ---

export interface Parte {
  id: string
  periodoId: string
  cueAnexo: string
  estadoEstablecimiento: EstadoEstablecimiento
  estadoEstablecimientoRigeDesde: string
  corteId: number
  creadaEn: string
  actualizadaEn: string
}

// Fotografía de un parte en un instante dado: lo que diffParte compara.
// `afectaciones` y `servicioAlcance` son SIEMPRE los conjuntos vigentes (ver
// resolverAlcanceVigente) — nunca el historial completo. Un parte recién
// iniciado (sin actualizaciones previas) se representa con un snapshot
// "vacío": estadoEstablecimiento en su valor por defecto, afectaciones: [],
// servicioAlcance: [].
export interface ParteSnapshot {
  estadoEstablecimiento: EstadoEstablecimiento
  afectaciones: Afectacion[]
  servicioAlcance: ServicioAlcance[]
}

export function crearSnapshotVacio(
  estadoEstablecimiento: EstadoEstablecimiento = 'habitual',
): ParteSnapshot {
  return { estadoEstablecimiento, afectaciones: [], servicioAlcance: [] }
}
