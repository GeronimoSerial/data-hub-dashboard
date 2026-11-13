import type { RegionConfig } from '@/lib/infraestructura/region/esquema'
import { regionActiva } from '@/lib/infraestructura/region/activa'

// Testigos de la sonda de cadena de datos. Son puntos de control fijos, no una
// muestra: tres CUE de Corrientes (padrón de escuelas del dataset de localizaciones,
// con corrida de riesgo esperada) y dos estaciones PNA del catálogo con rol
// "corrientes" (Corrientes sobre el Paraná y Paso de los Libres sobre el Uruguay).
// Se sobreescriben con SONDA_ESCUELAS_TESTIGO y SONDA_ESTACIONES_TESTIGO.
// Valores de Corrientes; la fuente de verdad es `sondaTestigos` en config/regiones/corrientes.json.
export const ESCUELAS_TESTIGO_DEFAULT = ['1800643-00', '1801605-04', '1801131-00'] as const
export const ESTACIONES_TESTIGO_DEFAULT = ['pna-corrientes', 'pna-paso-de-los-libres'] as const

function listaDesdeEntorno(valor: string | undefined, defecto: readonly string[]): string[] {
  const items = (valor ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return items.length > 0 ? items : [...defecto]
}

// Sin override de entorno, los testigos son los de la región (vacíos si no declara).
export function escuelasTestigo(
  env: NodeJS.ProcessEnv = process.env,
  region: Pick<RegionConfig, 'sondaTestigos'> = regionActiva(),
): string[] {
  return listaDesdeEntorno(env.SONDA_ESCUELAS_TESTIGO, region.sondaTestigos?.escuelas ?? [])
}

export function estacionesTestigo(
  env: NodeJS.ProcessEnv = process.env,
  region: Pick<RegionConfig, 'sondaTestigos'> = regionActiva(),
): string[] {
  return listaDesdeEntorno(env.SONDA_ESTACIONES_TESTIGO, region.sondaTestigos?.estaciones ?? [])
}
