import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { callCenterLlamadas } from '@/lib/db/schema'
import { normalizeCue } from '@/lib/infraestructura/cue'

export const LIMITES_LLAMADA = {
  callerNombre: 120,
  justificacion: 2000,
  respuestaDirector: 2000,
} as const

export type EntradaLlamada = {
  cueAnexo: string
  usuarioId: string
  callerNombre: string
  justificacion: string
  respuestaDirector: string
}

export type Llamada = EntradaLlamada & { id: string; creadaEn: string }

type CamposValidados = Omit<EntradaLlamada, 'usuarioId'>

type CampoTexto = 'callerNombre' | 'justificacion' | 'respuestaDirector'

const ETIQUETAS: Record<CampoTexto, string> = {
  callerNombre: 'El nombre de quien llama',
  justificacion: 'La justificación',
  respuestaDirector: 'La respuesta del director',
}

function validarTexto(
  input: Record<string, unknown>,
  campo: CampoTexto,
): { ok: true; value: string } | { ok: false; error: string } {
  const raw = input[campo]
  if (typeof raw !== 'string') return { ok: false, error: `${ETIQUETAS[campo]} es obligatorio` }
  const value = raw.trim()
  if (value === '') return { ok: false, error: `${ETIQUETAS[campo]} es obligatorio` }
  if (value.length > LIMITES_LLAMADA[campo]) {
    return { ok: false, error: `${ETIQUETAS[campo]} supera ${LIMITES_LLAMADA[campo]} caracteres` }
  }
  return { ok: true, value }
}

export function validarEntradaLlamada(
  input: unknown,
): { ok: true; value: CamposValidados } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'El cuerpo de la llamada no es válido' }
  }
  const registro = input as Record<string, unknown>

  const cue = typeof registro.cueAnexo === 'string' ? normalizeCue(registro.cueAnexo) : null
  if (!cue) return { ok: false, error: 'El CUE no es válido' }

  const callerNombre = validarTexto(registro, 'callerNombre')
  if (!callerNombre.ok) return callerNombre
  const justificacion = validarTexto(registro, 'justificacion')
  if (!justificacion.ok) return justificacion
  const respuestaDirector = validarTexto(registro, 'respuestaDirector')
  if (!respuestaDirector.ok) return respuestaDirector

  return {
    ok: true,
    value: {
      cueAnexo: cue.value,
      callerNombre: callerNombre.value,
      justificacion: justificacion.value,
      respuestaDirector: respuestaDirector.value,
    },
  }
}

export async function registrarLlamada(entrada: EntradaLlamada, ahora: Date = new Date()): Promise<Llamada> {
  const db = getDb()
  const llamada: Llamada = {
    id: crypto.randomUUID(),
    creadaEn: ahora.toISOString(),
    cueAnexo: entrada.cueAnexo,
    usuarioId: entrada.usuarioId,
    callerNombre: entrada.callerNombre,
    justificacion: entrada.justificacion,
    respuestaDirector: entrada.respuestaDirector,
  }
  await db.insert(callCenterLlamadas).values(llamada)
  return llamada
}

export async function listarLlamadasPorCue(cueAnexo: string): Promise<Llamada[]> {
  const db = getDb()
  return db
    .select()
    .from(callCenterLlamadas)
    .where(eq(callCenterLlamadas.cueAnexo, cueAnexo))
    .orderBy(desc(callCenterLlamadas.creadaEn), desc(callCenterLlamadas.id))
}

export async function ultimaLlamadaPorCue(): Promise<Map<string, { creadaEn: string; callerNombre: string }>> {
  const db = getDb()
  const filas = await db
    .select({
      cueAnexo: callCenterLlamadas.cueAnexo,
      creadaEn: callCenterLlamadas.creadaEn,
      callerNombre: callCenterLlamadas.callerNombre,
    })
    .from(callCenterLlamadas)
    .orderBy(desc(callCenterLlamadas.creadaEn), desc(callCenterLlamadas.id))

  const ultimas = new Map<string, { creadaEn: string; callerNombre: string }>()
  for (const fila of filas) {
    if (!ultimas.has(fila.cueAnexo)) {
      ultimas.set(fila.cueAnexo, { creadaEn: fila.creadaEn, callerNombre: fila.callerNombre })
    }
  }
  return ultimas
}
