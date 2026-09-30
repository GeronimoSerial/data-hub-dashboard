// Agregados por departamento y provincia sobre el PADRÓN COMPLETO de escuelas
// (listarEscuelasMapa): sólo conteos, nunca datos nominales. El denominador
// SIEMPRE es el padrón del departamento (con y sin coordenadas); las escuelas
// sin ubicación suman al total pero jamás pueden estar afectadas, porque la
// afectación vive en `escuelas` y no en `sinUbicacion`.
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'
import { listarEscuelasMapa, type FiltrosMapa } from './parte-mapa'

export interface TotalesDepartamento {
  // Nombre normalizado (normalizarNombreDepartamento): mayúsculas sin tildes.
  departamento: string
  // Primer nombre "tal cual" visto para ese departamento, para mostrar en UI.
  departamentoOriginal: string
  // Padrón completo del departamento (con Y sin coordenadas).
  totalEscuelas: number
  // Escuelas con estado === 'afectada' (nunca las sin coordenadas).
  escuelasAfectadas: number
  // escuelasAfectadas / totalEscuelas * 100, redondeado a 1 decimal.
  porcentajeAfectadas: number
}

export interface TotalesMapaResultado {
  departamentos: TotalesDepartamento[]
  provincia: {
    totalEscuelas: number
    escuelasAfectadas: number
    porcentajeAfectadas: number
  }
}

// Redondeo a 1 decimal; total 0 no debe tirar división por cero.
function porcentajeAfectadas(afectadas: number, total: number): number {
  if (total === 0) return 0
  return Math.round((afectadas / total) * 1000) / 10
}

export async function obtenerTotalesMapa(
  filtros: FiltrosMapa = {},
): Promise<TotalesMapaResultado> {
  // Una sola llamada: nada de N+1, todo lo demás se agrupa en memoria.
  const resultado = await listarEscuelasMapa(filtros)

  interface Acumulado {
    departamentoOriginal: string
    totalEscuelas: number
    escuelasAfectadas: number
  }

  const porDepartamento = new Map<string, Acumulado>()

  const registrar = (departamento: string, afectada: boolean): void => {
    const clave = normalizarNombreDepartamento(departamento)
    const acumulado = porDepartamento.get(clave)
    if (acumulado) {
      acumulado.totalEscuelas += 1
      if (afectada) acumulado.escuelasAfectadas += 1
      return
    }
    // El primer nombre visto para la clave queda como "original" de la UI.
    porDepartamento.set(clave, {
      departamentoOriginal: departamento,
      totalEscuelas: 1,
      escuelasAfectadas: afectada ? 1 : 0,
    })
  }

  for (const escuela of resultado.escuelas) {
    registrar(escuela.departamento, escuela.estado === 'afectada')
  }
  // Las sin coordenadas cuentan en el total pero no en afectadas.
  for (const escuela of resultado.sinUbicacion) {
    registrar(escuela.departamento, false)
  }

  const departamentos: TotalesDepartamento[] = [...porDepartamento.entries()]
    .map(([departamento, acumulado]) => ({
      departamento,
      departamentoOriginal: acumulado.departamentoOriginal,
      totalEscuelas: acumulado.totalEscuelas,
      escuelasAfectadas: acumulado.escuelasAfectadas,
      porcentajeAfectadas: porcentajeAfectadas(
        acumulado.escuelasAfectadas,
        acumulado.totalEscuelas,
      ),
    }))
    .sort((a, b) => a.departamentoOriginal.localeCompare(b.departamentoOriginal))

  const totalEscuelas = departamentos.reduce((acc, d) => acc + d.totalEscuelas, 0)
  const afectadas = departamentos.reduce((acc, d) => acc + d.escuelasAfectadas, 0)

  return {
    departamentos,
    provincia: {
      totalEscuelas,
      escuelasAfectadas: afectadas,
      // % sobre los totales sumados, nunca el promedio de los % por depto.
      porcentajeAfectadas: porcentajeAfectadas(afectadas, totalEscuelas),
    },
  }
}
