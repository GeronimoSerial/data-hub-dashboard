// Regla pura de altimetría escolar de Motor v0.4 (U2 de
// "Motor v0.4/PLAN_IMPLEMENTACION.md"; referencia: generar_cotas_conservadoras.py).
// - Cota principal: p10 espacial de Copernicus GLO-30 (la fuente que ya usa el
//   motor operativo), convertida en forma aproximada a SRVN16.
// - Cota conservadora: mínimo entre las fuentes ADMISIBLES (valor finito y
//   referencia vertical comparable). Una fuente nunca entra por ser menor.
// La conservadora es un escenario identificado, no una cota más exacta, y
// ninguna de las dos es cota de piso: `cotaIngresoEdificio` no se deriva del
// terreno y no existe en este resultado.

// Referencias verticales comparables entre IGN MDE-Ar (SRVN16) y Copernicus
// convertido de EGM2008 a GEOIDE-Ar16 de forma aproximada.
export const REFERENCIAS_VERTICALES_COMPATIBLES = ['SRVN16_con_conversion_aproximada_de_Copernicus'] as const

export type FuenteAltimetria = 'ign' | 'copernicus'
export type FuenteConservadora = FuenteAltimetria | 'coincidentes'
export type MotivoPendienteAltimetria = 'sin_coordenadas' | 'revisar_georreferencia' | 'sin_fuente_valida'
export type MotivoExclusionAltimetria = 'referencia_vertical_incompatible'

export type EntradaAltimetria = {
  ignP10M: number | null
  copernicusP10M: number | null
  tieneCoordenadas: boolean
  // true cuando el control de departamento marcó la georreferencia para revisar.
  georreferenciaObservada: boolean
  referenciaVertical: string
  operador: string
}

export type ResultadoAltimetria =
  | {
      estado: 'candidata'
      cotaPrincipalM: number | null
      cotaConservadoraM: number
      fuenteConservadora: FuenteConservadora
      fuentesValidas: 1 | 2
      referenciaVertical: string
      operador: string
      // `principal_sin_copernicus` cuando sólo IGN es admisible.
      motivos: 'principal_sin_copernicus'[]
    }
  | { estado: 'pendiente'; motivo: MotivoPendienteAltimetria; exclusiones?: MotivoExclusionAltimetria[] }

// null, NaN y ±Infinity son "sin dato"; un 0 finito es una cota válida.
function admisible(valor: number | null): valor is number {
  return valor !== null && Number.isFinite(valor)
}

export function calcularAltimetriaEscolar(e: EntradaAltimetria): ResultadoAltimetria {
  if (!e.tieneCoordenadas) return { estado: 'pendiente', motivo: 'sin_coordenadas' }
  if (e.georreferenciaObservada) return { estado: 'pendiente', motivo: 'revisar_georreferencia' }
  if (!(REFERENCIAS_VERTICALES_COMPATIBLES as readonly string[]).includes(e.referenciaVertical)) {
    return { estado: 'pendiente', motivo: 'sin_fuente_valida', exclusiones: ['referencia_vertical_incompatible'] }
  }

  const ign = admisible(e.ignP10M) ? e.ignP10M : null
  const cop = admisible(e.copernicusP10M) ? e.copernicusP10M : null
  const base = { estado: 'candidata' as const, referenciaVertical: e.referenciaVertical, operador: e.operador }

  if (ign !== null && cop !== null) {
    const fuenteConservadora: FuenteConservadora = ign === cop ? 'coincidentes' : ign < cop ? 'ign' : 'copernicus'
    return { ...base, cotaPrincipalM: cop, cotaConservadoraM: Math.min(ign, cop), fuenteConservadora, fuentesValidas: 2, motivos: [] }
  }
  if (cop !== null) {
    return { ...base, cotaPrincipalM: cop, cotaConservadoraM: cop, fuenteConservadora: 'copernicus', fuentesValidas: 1, motivos: [] }
  }
  if (ign !== null) {
    return {
      ...base,
      cotaPrincipalM: null,
      cotaConservadoraM: ign,
      fuenteConservadora: 'ign',
      fuentesValidas: 1,
      motivos: ['principal_sin_copernicus'],
    }
  }
  return { estado: 'pendiente', motivo: 'sin_fuente_valida' }
}
