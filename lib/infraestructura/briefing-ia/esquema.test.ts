import { describe, expect, it } from 'vitest'
import { esquemaSalidaBriefingIA } from './esquema'

describe('esquemaSalidaBriefingIA', () => {
  it('acepta una salida válida con una o más frases', () => {
    const resultado = esquemaSalidaBriefingIA.safeParse({
      frases: [
        { texto: 'Hay escuelas en riesgo alto para las próximas 24 horas.', refs: ['kpi.escuelas_riesgo_alto_24h'] },
        { texto: 'Dos fuentes de datos están vencidas.', refs: ['fuentes.vencidas_conteo', 'fuentes.total'] },
      ],
    })

    expect(resultado.success).toBe(true)
  })

  it('rechaza una lista de frases vacía', () => {
    const resultado = esquemaSalidaBriefingIA.safeParse({ frases: [] })

    expect(resultado.success).toBe(false)
  })

  it('rechaza más de seis frases', () => {
    const resultado = esquemaSalidaBriefingIA.safeParse({
      frases: Array.from({ length: 7 }, (_, indice) => ({
        texto: `Frase ${indice + 1}`,
        refs: [],
      })),
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza texto vacío', () => {
    const resultado = esquemaSalidaBriefingIA.safeParse({
      frases: [{ texto: '', refs: [] }],
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza refs que no sean strings', () => {
    const resultado = esquemaSalidaBriefingIA.safeParse({
      frases: [{ texto: 'Frase válida', refs: [123] }],
    })

    expect(resultado.success).toBe(false)
  })
})
