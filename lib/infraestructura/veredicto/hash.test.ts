import { describe, expect, it } from 'vitest'
import { calcularInputsHash } from './hash'

const metricas = [
  { id: 'lluvia.obs_24h.max_mm', valor: 62.4, unidad: 'mm', etiqueta: 'Lluvia', fuenteUrl: 'https://a' },
  { id: 'rio.ptl.altura_max_m', valor: 7.25, unidad: 'm', etiqueta: 'Río', fuenteUrl: 'https://b' },
]

const base = { metricas, nivel: 'alerta' as const, versionReglas: 'reglas-v1', versionPrompt: 'veredicto-v1' }

describe('calcularInputsHash', () => {
  it('es un sha256 hex de 64 caracteres', () => {
    expect(calcularInputsHash(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('no depende del orden de las métricas ni de las claves de cada objeto', () => {
    const reordenado = {
      ...base,
      metricas: [
        { fuenteUrl: 'https://b', etiqueta: 'Río', unidad: 'm', valor: 7.25, id: 'rio.ptl.altura_max_m' },
        { fuenteUrl: 'https://a', etiqueta: 'Lluvia', unidad: 'mm', valor: 62.4, id: 'lluvia.obs_24h.max_mm' },
      ],
    }
    expect(calcularInputsHash(reordenado)).toBe(calcularInputsHash(base))
  })

  it('cambia con un valor, el nivel o la versión de reglas o prompt', () => {
    const h = calcularInputsHash(base)
    const conValor = { ...base, metricas: [{ ...metricas[0]!, valor: 62.5 }, metricas[1]!] }
    expect(calcularInputsHash(conValor)).not.toBe(h)
    expect(calcularInputsHash({ ...base, nivel: 'severo' })).not.toBe(h)
    expect(calcularInputsHash({ ...base, versionReglas: 'reglas-v2' })).not.toBe(h)
    expect(calcularInputsHash({ ...base, versionPrompt: 'veredicto-v2' })).not.toBe(h)
  })
})
