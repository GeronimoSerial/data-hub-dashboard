// Concise reading of a verdict for the UI: one headline plus a few points.
// Older stored verdicts may be longer than the current prompt allows; they are
// truncated here instead of being rewritten in the database.

import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { departamentosSinNovedad, ordenarPorSeveridad, tieneNovedad } from './orden'

export const MAX_PUNTOS_RESUMEN = 3

export type ResumenVeredicto = { titular: string; puntos: string[] }

function textosDeFrases(frases: unknown[] | null): string[] {
  if (!frases) return []
  return frases
    .map((f) => (f !== null && typeof f === 'object' ? (f as { texto?: unknown }).texto : null))
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    .map((t) => t.trim())
}

function oraciones(texto: string | null): string[] {
  if (!texto) return []
  return texto
    .split(/(?<=[.!?])\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

export function resumirVeredicto(v: { texto: string | null; frases: unknown[] | null }): ResumenVeredicto {
  const partes = textosDeFrases(v.frases)
  const lista = partes.length > 0 ? partes : oraciones(v.texto)
  const [titular = '', ...resto] = lista
  return { titular, puntos: resto.slice(0, MAX_PUNTOS_RESUMEN) }
}

export type FilaLectura = {
  ambito: string
  nivel: string
  texto: string | null
  fuente: string
  frases: unknown[] | null
  metricas: { id: string; valor: unknown }[]
}

export type LineaDepartamento<T> = { veredicto: T; id: string; nombre: string; texto: string }

export type LecturaDia<T> = {
  provincia: T | null
  titular: string
  /** Departments with news, most to least severe. */
  lineas: LineaDepartamento<T>[]
  /** Display names of departments without news, alphabetical. */
  sinNovedad: string[]
  conIa: boolean
}

const PREFIJO_DEPARTAMENTO = 'departamento:'

/**
 * Reading of one day: provincial headline, one line per department with news
 * (ordered in code, never by the model) and the quiet departments. Works for
 * rows of any prompt version: only the first sentence of each row is used.
 */
export function lecturaDelDia<T extends FilaLectura>(delDia: T[]): LecturaDia<T> {
  const provincia = delDia.find((v) => v.ambito === 'provincia') ?? null
  const departamentos = delDia.filter((v) => v.ambito.startsWith(PREFIJO_DEPARTAMENTO))
  const lineas = ordenarPorSeveridad(departamentos.filter(tieneNovedad)).map((veredicto) => {
    const id = veredicto.ambito.slice(PREFIJO_DEPARTAMENTO.length)
    return { veredicto, id, nombre: etiquetaDepartamento(id), texto: resumirVeredicto(veredicto).titular }
  })
  return {
    provincia,
    titular: provincia ? resumirVeredicto(provincia).titular : '',
    lineas,
    sinNovedad: departamentosSinNovedad(departamentos),
    conIa: delDia.some((v) => v.fuente === 'ia'),
  }
}
