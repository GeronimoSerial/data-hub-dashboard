import type { EscuelaV29 } from './tipos'

export type MotivoNoCalculable = 'menos de 2 establecimientos' | 'menos de 2 importes informados'

export interface ReferenciaRetenida {
  cue: string
  nombre: string
  importe: number
}

export interface ResumenEconomico {
  calculable: boolean
  motivo: MotivoNoCalculable | null
  totalEscuelas: number
  escuelasConImporte: number
  escuelasSinImporte: string[]
  cobertura: 'completa' | 'parcial'
  costoInformado: number
  personalInformado: number
  referenciaRetenida: ReferenciaRetenida | null
  potencialBrutoMensual: number | null
  potencialBrutoAnual: number | null
  supuesto: string | null
  advertencias: string[]
}

const formatoArs = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
})

/** Formato de pesos del mockup V29: es-AR con hasta dos decimales. */
export function formatearARS(valor: number): string {
  return formatoArs.format(valor)
}

function esImportePositivo(valor: number | null): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0
}

/**
 * Potencial bruto de una zona completa. Los miembros deben ser la zona entera:
 * un subconjunto filtrado cambiaría la referencia y el costo informado.
 * Los importes faltantes no se extrapolan ni cuentan como cero.
 */
export function resumenEconomico(miembros: EscuelaV29[]): ResumenEconomico {
  const conImporte = miembros.filter((m): m is EscuelaV29 & { sueldosTotal: number } =>
    esImportePositivo(m.sueldosTotal),
  )
  const sinImporte = miembros.filter((m) => !esImportePositivo(m.sueldosTotal))

  const costoInformado = conImporte.reduce((suma, m) => suma + m.sueldosTotal, 0)
  const personalInformado = miembros.reduce((suma, m) => suma + (m.personasSueldos ?? 0), 0)

  // Igual que el mockup: ante empate gana el primero en el orden de la zona.
  const retenida = conImporte.reduce<(EscuelaV29 & { sueldosTotal: number }) | null>(
    (mayor, m) => (mayor === null || m.sueldosTotal > mayor.sueldosTotal ? m : mayor),
    null,
  )

  let motivo: MotivoNoCalculable | null = null
  if (miembros.length < 2) motivo = 'menos de 2 establecimientos'
  else if (conImporte.length < 2) motivo = 'menos de 2 importes informados'

  const calculable = motivo === null && retenida !== null
  const potencialBrutoMensual = calculable ? costoInformado - retenida.sueldosTotal : null
  const cobertura = sinImporte.length === 0 ? 'completa' : 'parcial'

  const advertencias = [
    'No es ahorro realizable confirmado: no descuenta cargos a conservar o reubicar, transporte escolar, adecuaciones ni costos del receptor.',
    'Cifra de potencial bruto bajo un supuesto, no ahorro confirmado ni recomendación de cierre.',
  ]
  if (cobertura === 'parcial') {
    advertencias.push(
      `La cifra representa solo los importes disponibles. Faltan importes de ${sinImporte.length} establecimiento(s); no se extrapolan.`,
    )
  }

  return {
    calculable,
    motivo,
    totalEscuelas: miembros.length,
    escuelasConImporte: conImporte.length,
    escuelasSinImporte: sinImporte.map((m) => m.cue),
    cobertura,
    costoInformado,
    personalInformado,
    referenciaRetenida: calculable
      ? { cue: retenida.cue, nombre: retenida.nombre, importe: retenida.sueldosTotal }
      : null,
    potencialBrutoMensual,
    potencialBrutoAnual: potencialBrutoMensual === null ? null : potencialBrutoMensual * 12,
    supuesto: calculable
      ? `Conservar como referencia el establecimiento con mayor costo salarial informado (${retenida.cue}); suma el costo completo de los demás con importe.`
      : null,
    advertencias,
  }
}
