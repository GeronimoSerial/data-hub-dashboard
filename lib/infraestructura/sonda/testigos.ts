// Testigos de la sonda de cadena de datos. Son puntos de control fijos, no una
// muestra: tres CUE de Corrientes (padrón de escuelas del dataset de localizaciones,
// con corrida de riesgo esperada) y dos estaciones PNA del catálogo con rol
// "corrientes" (Corrientes sobre el Paraná y Paso de los Libres sobre el Uruguay).
// Se sobreescriben con SONDA_ESCUELAS_TESTIGO y SONDA_ESTACIONES_TESTIGO.
export const ESCUELAS_TESTIGO_DEFAULT = ['1800643-00', '1801605-04', '1801131-00'] as const
export const ESTACIONES_TESTIGO_DEFAULT = ['pna-corrientes', 'pna-paso-de-los-libres'] as const

function listaDesdeEntorno(valor: string | undefined, defecto: readonly string[]): string[] {
  const items = (valor ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return items.length > 0 ? items : [...defecto]
}

export function escuelasTestigo(env: NodeJS.ProcessEnv = process.env): string[] {
  return listaDesdeEntorno(env.SONDA_ESCUELAS_TESTIGO, ESCUELAS_TESTIGO_DEFAULT)
}

export function estacionesTestigo(env: NodeJS.ProcessEnv = process.env): string[] {
  return listaDesdeEntorno(env.SONDA_ESTACIONES_TESTIGO, ESTACIONES_TESTIGO_DEFAULT)
}
