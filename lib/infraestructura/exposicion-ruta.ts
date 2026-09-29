import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraExposicionRutaInundacion, type CeldaExposicionRuta } from '@/lib/db/schema'

export type FilaExposicionRuta = typeof infraExposicionRutaInundacion.$inferSelect

export interface ExposicionRutaRespuesta {
  cueAnexo: string
  disponible: boolean
  motivoSinDato?: string
  estado?: 'sin_ruta' | 'sin_dato' | 'sin_profundidad' | 'con_profundidad'
  versionJob: string | null
  resumen: {
    celdasTotal: number
    celdasConDato: number
    celdasConProfundidad: number
    profundidadMaxM: number | null
    cobertura: number
  }
  celdasAfectadas: CeldaExposicionRuta[]
  resolucionArcsec: number | null
  periodoRetornoAnios: number | null
  escenario: string | null
  fuente: string | null
  licencia: string | null
  fechaCorrida: string | null
  aviso: string
}

export const AVISO_EXPOSICION_RUTA =
  'Indicador historico/estatico por celda de ~1 km; no es pronostico ni estado del camino ni el trazado de un rio.'

function compararVersionJob(a: string, b: string): number {
  const na = a.trim() === '' ? Number.NaN : Number(a)
  const nb = b.trim() === '' ? Number.NaN : Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a > b ? 1 : a < b ? -1 : 0
}

export function construirRespuestaExposicion(
  cueAnexo: string,
  fila: FilaExposicionRuta | null,
): ExposicionRutaRespuesta {
  const base = {
    cueAnexo,
    versionJob: fila?.versionJob ?? null,
    resumen: {
      celdasTotal: fila?.celdasTotal ?? 0,
      celdasConDato: fila?.celdasConDato ?? 0,
      celdasConProfundidad: fila?.celdasConProfundidad ?? 0,
      profundidadMaxM: fila?.profundidadMaxM != null && Number.isFinite(fila.profundidadMaxM) ? fila.profundidadMaxM : null,
      cobertura: fila?.cobertura ?? 0,
    },
    celdasAfectadas: (fila?.celdas ?? []).filter((celda) =>
      celda.profundidadM !== null && Number.isFinite(celda.profundidadM) && celda.profundidadM > 0,
    ),
    resolucionArcsec: fila?.resolucionArcsec ?? null,
    periodoRetornoAnios: fila?.periodoRetornoAnios ?? null,
    escenario: fila?.escenario ?? null,
    fuente: fila?.fuente ?? null,
    licencia: fila?.licencia ?? null,
    fechaCorrida: fila?.fechaCorrida ?? null,
    aviso: AVISO_EXPOSICION_RUTA,
  }

  if (fila === null) {
    return { ...base, disponible: false, motivoSinDato: 'Sin dato de exposicion para esta escuela.' }
  }
  if (fila.estado === 'sin_ruta' || fila.estado === 'sin_dato') {
    return {
      ...base,
      disponible: false,
      estado: fila.estado,
      motivoSinDato:
        fila.estado === 'sin_ruta'
          ? 'Sin ruta de acceso calculada; no hay dato de exposicion a lo largo de la ruta.'
          : fila.motivoSinDato ?? 'Sin dato de exposicion para esta escuela.',
      celdasAfectadas: [],
    }
  }

  return {
    ...base,
    disponible: true,
    estado: fila.estado === 'con_profundidad' ? 'con_profundidad' : 'sin_profundidad',
  }
}

export function ultimaExposicionDeCue(
  filas: readonly FilaExposicionRuta[],
): FilaExposicionRuta | null {
  return filas.reduce<FilaExposicionRuta | null>((elegida, fila) => {
    if (elegida === null || compararVersionJob(fila.versionJob, elegida.versionJob) > 0) return fila
    return elegida
  }, null)
}

export async function obtenerExposicionRuta(cueAnexo: string): Promise<FilaExposicionRuta | null> {
  const filas = await getDb()
    .select()
    .from(infraExposicionRutaInundacion)
    .where(eq(infraExposicionRutaInundacion.cueAnexo, cueAnexo))
  return ultimaExposicionDeCue(filas)
}
