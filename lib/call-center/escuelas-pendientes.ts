import { listarPartesVigentes } from '@/lib/infraestructura/parte-mapa'
import { UMBRAL_SIN_ACTUALIZAR_HORAS } from '@/lib/infraestructura/umbrales'

const MS_POR_HORA = 3600000

export type EscuelaPendiente = {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  actualizadaEn: string
  horasSinActualizar: number
}

export function esParteSinActualizar(actualizadaEn: string, ahoraMs: number): boolean {
  return ahoraMs - Date.parse(actualizadaEn) > UMBRAL_SIN_ACTUALIZAR_HORAS * MS_POR_HORA
}

export async function listarEscuelasSinActualizar(ahoraMs: number = Date.now()): Promise<EscuelaPendiente[]> {
  const { partes } = await listarPartesVigentes({})

  return partes
    .filter((parte) => esParteSinActualizar(parte.actualizadaEn, ahoraMs))
    .map((parte) => ({
      cueAnexo: parte.cueAnexo,
      nombre: parte.nombre,
      departamento: parte.departamento,
      localidad: parte.localidad,
      actualizadaEn: parte.actualizadaEn,
      horasSinActualizar: Math.floor((ahoraMs - Date.parse(parte.actualizadaEn)) / MS_POR_HORA),
    }))
    .sort((a, b) => b.horasSinActualizar - a.horasSinActualizar || a.cueAnexo.localeCompare(b.cueAnexo))
}
