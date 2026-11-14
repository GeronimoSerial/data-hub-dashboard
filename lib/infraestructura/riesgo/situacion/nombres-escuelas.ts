// Resolves school names for the priority list of the Situation Center. The
// risk snapshot only carries the CUE-anexo, so the name comes from the padrón
// (ge.ge_localizacion). Presentation-only: a failed lookup yields no names and
// the UI falls back to the CUE, it never blocks the page.
import { getRawClient } from '@/lib/db'
import { crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'

export async function nombresDeEscuelas(cues: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(cues)]
  if (unicos.length === 0) return {}
  try {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)
    const res = await client.execute({
      sql: `SELECT cue_anexo, nombre FROM ge.ge_localizacion WHERE cue_anexo IN (${unicos.map(() => '?').join(',')})`,
      args: unicos,
    })
    const nombres: Record<string, string> = {}
    for (const fila of res.rows) {
      const nombre = String(fila.nombre ?? '').trim()
      if (nombre !== '') nombres[String(fila.cue_anexo)] = nombre
    }
    return nombres
  } catch {
    return {}
  }
}
