import { describe, expect, it } from 'vitest'
import { TINTA_POR_SEVERIDAD } from '@/components/infraestructura/estado-actual-severidad'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'

function luminanciaRelativa(hex: string): number {
  const canales = hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (!canales) throw new Error(`Color hexadecimal inválido: ${hex}`)

  const rgb = canales.slice(1).map((canal) => Number.parseInt(canal, 16) / 255)
  const lineal = rgb.map((canal) => canal <= 0.04045
    ? canal / 12.92
    : ((canal + 0.055) / 1.055) ** 2.4)

  return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2]
}

function contraste(primerColor: string, segundoColor: string): number {
  const [claro, escuro] = [luminanciaRelativa(primerColor), luminanciaRelativa(segundoColor)]
    .sort((a, b) => b - a)
  return (claro + 0.05) / (escuro + 0.05)
}

describe('contraste de la tinta de gravedad', () => {
  it.each(SEVERIDADES)('mantiene contraste WCAG AA para %s', (severidad) => {
    expect(contraste(colorSeveridad(severidad), TINTA_POR_SEVERIDAD[severidad])).toBeGreaterThanOrEqual(4.5)
  })
})
