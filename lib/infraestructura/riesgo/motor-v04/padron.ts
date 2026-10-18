// Puerto de padrón de Motor v0.4: el universo es el padrón completo
// (ge.ge_localizacion) unido por izquierda con infra_geo_profile. A diferencia
// de PuertoTerritorio.listarCuesConPerfil (motor/adaptadores/territorio.ts),
// no descarta las escuelas sin perfil válido: "Motor v0.4/PLAN_IMPLEMENTACION.md"
// §1 exige una fila por CUE/anexo × horizonte, incluidas las 4 sin coordenadas.
import { getRawClient } from '@/lib/db'
import { asegurarGeAdjuntada } from '../../impacto'
import { crearEjecutorSql } from '../../ge-db'

// null = ubicación utilizable (perfil válido). `perfil_geografico_pendiente`
// cubre una escuela del padrón cuyo perfil todavía no calculó geo-perfiles.
export type MotivoUbicacionV04 = 'sin_coordenadas' | 'coordenada_invalida' | 'perfil_geografico_pendiente'

export type EscuelaPadronV04 = {
  cueAnexo: string
  motivoUbicacion: MotivoUbicacionV04 | null
}

export interface PuertoPadronV04 {
  // null = el padrón no pudo leerse; el job no inventa un universo vacío.
  listarPadron(): Promise<EscuelaPadronV04[] | null>
}

function motivoDeFila(fila: Record<string, unknown>): MotivoUbicacionV04 | null {
  if (fila.perfil_cue === null || fila.perfil_cue === undefined) {
    return fila.lat_ge === null || fila.lon_ge === null ? 'sin_coordenadas' : 'perfil_geografico_pendiente'
  }
  const motivo = fila.motivo_exclusion
  if (motivo === null || motivo === undefined) return null
  return motivo === 'coordenada_invalida' ? 'coordenada_invalida' : 'sin_coordenadas'
}

export function crearAdapterPadronV04(): PuertoPadronV04 {
  return {
    async listarPadron() {
      try {
        const client = crearEjecutorSql(getRawClient())
        await asegurarGeAdjuntada(client)
        const res = await client.execute(
          `SELECT l.cue_anexo, l.lat AS lat_ge, l.lon AS lon_ge, p.cue_anexo AS perfil_cue, p.motivo_exclusion
           FROM ge.ge_localizacion l
           LEFT JOIN infra_geo_profile p ON p.cue_anexo = l.cue_anexo
           ORDER BY l.cue_anexo`,
        )
        return res.rows.map((fila) => ({ cueAnexo: String(fila.cue_anexo), motivoUbicacion: motivoDeFila(fila) }))
      } catch {
        // Puertos del motor no lanzan: el job traduce null en 'padron_no_disponible'.
        return null
      }
    },
  }
}
