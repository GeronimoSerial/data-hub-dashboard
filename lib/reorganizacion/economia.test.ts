import { describe, expect, it } from 'vitest'
import { formatearARS, resumenEconomico } from './economia'
import type { EscuelaV29 } from './tipos'

function escuela(cue: string, sueldosTotal: number | null, personasSueldos: number | null = null): EscuelaV29 {
  return {
    cue,
    nombre: `Escuela ${cue}`,
    departamento: 'Capital',
    localidad: 'Corrientes',
    ambito: 'Urbano',
    cui: '',
    jurisdiccion: '',
    modalidad: '',
    matricula: 100,
    historia: {},
    lat: -27.47,
    lon: -58.83,
    pof: {},
    agentes: 0,
    zona: 'Zona 1',
    sueldosTotal,
    personasSueldos,
    clasificacionZonaSueldos: null,
  }
}

describe('resumenEconomico', () => {
  it('calcula el potencial bruto restando la referencia retenida', () => {
    const r = resumenEconomico([escuela('A', 1_000_000, 5), escuela('B', 600_000, 3), escuela('C', 400_000, 2)])

    expect(r.calculable).toBe(true)
    expect(r.costoInformado).toBe(2_000_000)
    expect(r.referenciaRetenida).toEqual({ cue: 'A', nombre: 'Escuela A', importe: 1_000_000 })
    expect(r.potencialBrutoMensual).toBe(1_000_000)
    expect(r.personalInformado).toBe(10)
    expect(r.cobertura).toBe('completa')
    expect(r.escuelasConImporte).toBe(3)
    expect(r.escuelasSinImporte).toEqual([])
  })

  it('expresa el anual como doce veces el mensual', () => {
    const r = resumenEconomico([escuela('A', 900_000), escuela('B', 300_000)])

    expect(r.potencialBrutoMensual).toBe(300_000)
    expect(r.potencialBrutoAnual).toBe(3_600_000)
  })

  it('no es calculable con un solo establecimiento', () => {
    const r = resumenEconomico([escuela('A', 500_000)])

    expect(r.calculable).toBe(false)
    expect(r.motivo).toBe('menos de 2 establecimientos')
    expect(r.potencialBrutoMensual).toBeNull()
    expect(r.potencialBrutoAnual).toBeNull()
    expect(r.referenciaRetenida).toBeNull()
    expect(r.supuesto).toBeNull()
  })

  it('no es calculable con dos establecimientos y un solo importe', () => {
    const r = resumenEconomico([escuela('A', 500_000), escuela('B', null)])

    expect(r.calculable).toBe(false)
    expect(r.motivo).toBe('menos de 2 importes informados')
    expect(r.potencialBrutoMensual).toBeNull()
    expect(r.escuelasSinImporte).toEqual(['B'])
  })

  it('marca cobertura parcial y advierte que la cifra solo usa importes disponibles', () => {
    const r = resumenEconomico([escuela('A', 800_000), escuela('B', 200_000), escuela('C', null)])

    expect(r.calculable).toBe(true)
    expect(r.cobertura).toBe('parcial')
    expect(r.escuelasSinImporte).toEqual(['C'])
    expect(r.advertencias.some((a) => a.includes('solo los importes disponibles'))).toBe(true)
  })

  it('no extrapola ni cuenta como cero un importe faltante', () => {
    const conFaltante = resumenEconomico([escuela('A', 800_000), escuela('B', 200_000), escuela('C', null)])
    const conCero = resumenEconomico([escuela('A', 800_000), escuela('B', 200_000), escuela('C', 0)])

    expect(conFaltante.costoInformado).toBe(1_000_000)
    expect(conFaltante.potencialBrutoMensual).toBe(200_000)
    expect(conCero.escuelasSinImporte).toEqual(['C'])
    expect(conCero.potencialBrutoMensual).toBe(200_000)
  })

  it('usa el primer establecimiento en orden de zona ante un empate de importe', () => {
    const r = resumenEconomico([escuela('B', 700_000), escuela('A', 700_000), escuela('C', 100_000)])

    expect(r.referenciaRetenida?.cue).toBe('B')
    expect(r.potencialBrutoMensual).toBe(800_000)
  })

  it('suma el personal ignorando los nulos', () => {
    const r = resumenEconomico([escuela('A', 500_000, 4), escuela('B', 400_000, null), escuela('C', 300_000, 2)])

    expect(r.personalInformado).toBe(6)
  })

  it('incluye siempre las advertencias metodológicas', () => {
    const completa = resumenEconomico([escuela('A', 500_000), escuela('B', 400_000)])
    const noCalculable = resumenEconomico([])

    for (const r of [completa, noCalculable]) {
      expect(r.advertencias.length).toBeGreaterThan(0)
      expect(r.advertencias[0]).toContain('no descuenta cargos a conservar o reubicar, transporte escolar, adecuaciones ni costos del receptor')
    }
  })

  it('devuelve resumen vacío sin establecimientos', () => {
    const r = resumenEconomico([])

    expect(r.calculable).toBe(false)
    expect(r.motivo).toBe('menos de 2 establecimientos')
    expect(r.totalEscuelas).toBe(0)
  })
})

describe('formatearARS', () => {
  it('formatea pesos argentinos con separador de miles y coma decimal', () => {
    const texto = formatearARS(1_234_567.5)

    expect(texto).toContain('1.234.567,50')
    expect(texto).toContain('$')
  })

  it('muestra hasta dos decimales como el mockup', () => {
    expect(formatearARS(1000)).toContain('1.000,00')
  })
})
