// Huella de los insumos de un ámbito-día: si no cambia, no se vuelve a llamar a la IA.

import { createHash } from 'node:crypto'
import type { MetricaVeredicto } from './metricas'
import type { NivelVeredicto } from './reglas'

export type EntradaHash = {
  metricas: MetricaVeredicto[]
  nivel: NivelVeredicto
  versionReglas: string
  versionPrompt: string
  // Contexto aguas arriba (solo provincia): no fija nivel, pero se persiste y se muestra.
  aguasArriba?: unknown[]
}

// Serialización con claves ordenadas, para que el hash no dependa del orden de inserción.
function serializarEstable(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(serializarEstable).join(',')}]`
  if (valor !== null && typeof valor === 'object') {
    const claves = Object.keys(valor).sort()
    const partes = claves.map((clave) => `${JSON.stringify(clave)}:${serializarEstable((valor as Record<string, unknown>)[clave])}`)
    return `{${partes.join(',')}}`
  }
  return JSON.stringify(valor)
}

export function calcularInputsHash(entrada: EntradaHash): string {
  const metricas = [...entrada.metricas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const canonico = serializarEstable({
    metricas,
    nivel: entrada.nivel,
    versionReglas: entrada.versionReglas,
    versionPrompt: entrada.versionPrompt,
    // Solo entra al hash cuando hay contexto, para no invalidar las huellas existentes.
    ...(entrada.aguasArriba && entrada.aguasArriba.length > 0 ? { aguasArriba: entrada.aguasArriba } : {}),
  })
  return createHash('sha256').update(canonico).digest('hex')
}
