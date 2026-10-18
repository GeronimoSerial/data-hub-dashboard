// Puerto de altimetría escolar de Motor v0.4: devuelve, para un lote de CUE,
// el resultado de la última versión importada en infra_altimetria_escolar.
// Un CUE ausente de la versión es `null` (sin dato), nunca una cota 0.
import { desc, eq, inArray, and } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraAltimetriaEscolar } from '@/lib/db/schema'
import type { FuenteConservadora, MotivoPendienteAltimetria, ResultadoAltimetria } from './altimetria'

export type AltimetriaPorCue = { version: string; porCue: Map<string, ResultadoAltimetria | null> }

export interface PuertoAltimetriaV04 {
  // null = no hay versión importada o no pudo leerse; el puerto no lanza.
  obtener(cues: string[]): Promise<AltimetriaPorCue | null>
}

type FilaAltimetria = typeof infraAltimetriaEscolar.$inferSelect
export type CargadorAltimetria = (cues: string[]) => Promise<{ version: string; filas: FilaAltimetria[] } | null>

const TAMANO_LOTE = 500

export function resultadoDesdeFila(f: FilaAltimetria): ResultadoAltimetria {
  if (f.estado === 'candidata' && f.cotaConservadoraM !== null && f.fuenteConservadora !== null) {
    return {
      estado: 'candidata',
      cotaPrincipalM: f.cotaPrincipalM,
      cotaConservadoraM: f.cotaConservadoraM,
      fuenteConservadora: f.fuenteConservadora as FuenteConservadora,
      fuentesValidas: f.fuentesValidas === 2 ? 2 : 1,
      referenciaVertical: f.referenciaVertical,
      operador: f.operador,
      motivos: f.cotaPrincipalM === null ? ['principal_sin_copernicus'] : [],
    }
  }
  return { estado: 'pendiente', motivo: (f.motivo ?? 'sin_fuente_valida') as MotivoPendienteAltimetria }
}

const cargarDesdeDb: CargadorAltimetria = async (cues) => {
  const db = getDb()
  const [ultima] = await db
    .select({ version: infraAltimetriaEscolar.version })
    .from(infraAltimetriaEscolar)
    .orderBy(desc(infraAltimetriaEscolar.importadoEn), desc(infraAltimetriaEscolar.version))
    .limit(1)
  if (!ultima) return null
  const filas: FilaAltimetria[] = []
  for (let i = 0; i < cues.length; i += TAMANO_LOTE) {
    const lote = cues.slice(i, i + TAMANO_LOTE)
    filas.push(
      ...(await db
        .select()
        .from(infraAltimetriaEscolar)
        .where(and(eq(infraAltimetriaEscolar.version, ultima.version), inArray(infraAltimetriaEscolar.cueAnexo, lote)))),
    )
  }
  return { version: ultima.version, filas }
}

export function crearAdapterAltimetriaV04(cargar: CargadorAltimetria = cargarDesdeDb): PuertoAltimetriaV04 {
  return {
    async obtener(cues) {
      try {
        const cargado = await cargar(cues)
        if (cargado === null) return null
        const porFila = new Map(cargado.filas.map((f) => [f.cueAnexo, resultadoDesdeFila(f)]))
        return { version: cargado.version, porCue: new Map(cues.map((c) => [c, porFila.get(c) ?? null])) }
      } catch {
        return null
      }
    },
  }
}
