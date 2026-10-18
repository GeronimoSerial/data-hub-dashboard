// Parsers zod de la API pública INA A5 (alerta.ina.gob.ar/a5). Módulo puro:
// sin red, sin base y sin reloj. Un payload que no cumple el contrato lanza
// ErrorPayloadA5; nunca se convierte un valor ausente en 0.
import { z } from 'zod'

export class ErrorPayloadA5 extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorPayloadA5'
  }
}

const numeroNulo = z.number().finite().nullable().optional().transform((v) => v ?? null)

const EstacionA5Schema = z.object({
  id: z.number().int(),
  nombre: z.string(),
  id_externo: z.string().nullable(),
  tabla: z.string(),
  rio: z.string().nullable(),
  propietario: z.string().nullable().optional(),
  cero_ign: numeroNulo,
  nivel_alerta: numeroNulo,
  nivel_evacuacion: numeroNulo,
  nivel_aguas_bajas: numeroNulo,
})

export type EstacionA5 = {
  id: number
  nombre: string
  idExterno: string | null
  tabla: string
  rio: string | null
  ceroIgnM: number | null
  alertaM: number | null
  evacuacionM: number | null
  aguasBajasM: number | null
}

function mensajeZod(error: z.ZodError): string {
  const p = error.issues[0]
  return `${p.path.join('.') || 'raíz'}: ${p.message}`.slice(0, 200)
}

export function parsearEstacionesA5(json: unknown): EstacionA5[] {
  const r = z.array(EstacionA5Schema).safeParse(json)
  if (!r.success) throw new ErrorPayloadA5(`estaciones A5 inválidas: ${mensajeZod(r.error)}`)
  return r.data.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    idExterno: e.id_externo,
    tabla: e.tabla,
    rio: e.rio,
    ceroIgnM: e.cero_ign,
    alertaM: e.nivel_alerta,
    evacuacionM: e.nivel_evacuacion,
    aguasBajasM: e.nivel_aguas_bajas,
  }))
}

const ObservacionA5Schema = z.object({
  id: z.number().int(),
  series_id: z.number().int(),
  timestart: z.string().datetime({ offset: true }),
  valor: z.number().finite(),
  qualifier: z.string().nullable().optional(),
})

// La respuesta habitual es una lista; algunas rutas la envuelven con
// `metadata` (que puede ser null). Se aceptan ambas formas.
const ObservacionesA5Schema = z.union([
  z.array(ObservacionA5Schema),
  z.object({ metadata: z.unknown().nullable().optional(), rows: z.array(ObservacionA5Schema) }).transform((o) => o.rows),
])

export type ObservacionA5 = { id: number; timestart: string; valor: number; qualifier: string | null }

/** Valida observaciones de una serie; rechaza filas de otra serie (estación incorrecta). */
export function parsearObservacionesA5(json: unknown, serieIdEsperada: number): ObservacionA5[] {
  const r = ObservacionesA5Schema.safeParse(json)
  if (!r.success) throw new ErrorPayloadA5(`observaciones A5 inválidas: ${mensajeZod(r.error)}`)
  const ajena = r.data.find((o) => o.series_id !== serieIdEsperada)
  if (ajena) throw new ErrorPayloadA5(`observación de la serie ${ajena.series_id}, se esperaba ${serieIdEsperada}`)
  return r.data.map((o) => ({ id: o.id, timestart: o.timestart, valor: o.valor, qualifier: o.qualifier ?? null }))
}

// Prefectura informa la lectura diaria en hora local argentina. Se usa un
// desplazamiento fijo UTC-3 (determinístico); los horarios históricos con
// minutos raros (p. ej. 11:16:48Z en 1905) caen igual en su día local.
const DESPLAZAMIENTO_MS = -3 * 3_600_000

export function fechaLocalA5(timestartIso: string): string {
  return new Date(Date.parse(timestartIso) + DESPLAZAMIENTO_MS).toISOString().slice(0, 10)
}

export type FilaSerieDiaria = { fecha: string; valorM: number }

export type SerieDiariaNormalizada = {
  filas: FilaSerieDiaria[]
  /** Observaciones descartadas por compartir fecha local con otra. */
  repetidas: number
  /** Fechas con observaciones repetidas de valor distinto (se conserva la primera). */
  conflictosInternos: string[]
}

/**
 * Una fila por fecha local. Ante repetidas se conserva la de menor timestart
 * y, si empatan, la de menor id: el resultado no depende del orden recibido.
 */
export function normalizarSerieDiaria(observaciones: readonly ObservacionA5[]): SerieDiariaNormalizada {
  const ordenadas = [...observaciones].sort(
    (a, b) => Date.parse(a.timestart) - Date.parse(b.timestart) || a.id - b.id,
  )
  const porFecha = new Map<string, number>()
  const conflictos = new Set<string>()
  let repetidas = 0
  for (const o of ordenadas) {
    const fecha = fechaLocalA5(o.timestart)
    const previo = porFecha.get(fecha)
    if (previo === undefined) {
      porFecha.set(fecha, o.valor)
      continue
    }
    repetidas++
    if (previo !== o.valor) conflictos.add(fecha)
  }
  const filas = [...porFecha].map(([fecha, valorM]) => ({ fecha, valorM })).sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { filas, repetidas, conflictosInternos: [...conflictos].sort() }
}
