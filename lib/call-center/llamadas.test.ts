import { describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import {
  LIMITES_LLAMADA,
  listarLlamadasPorCue,
  registrarLlamada,
  ultimaLlamadaPorCue,
  validarEntradaLlamada,
  type EntradaLlamada,
} from './llamadas'

usarDbTemporal('llamadas-')

const CUE_ANEXO = '1234567-01'

function entradaValida(sobrescribir: Partial<EntradaLlamada> = {}): EntradaLlamada {
  return {
    cueAnexo: CUE_ANEXO,
    usuarioId: 'usuario-1',
    callerNombre: 'Ana Operadora',
    justificacion: 'El director estaba de licencia',
    respuestaDirector: 'Cargará el parte la semana próxima',
    ...sobrescribir,
  }
}

describe('validarEntradaLlamada', () => {
  it('acepta una entrada válida y normaliza el CUE', () => {
    const resultado = validarEntradaLlamada({
      cueAnexo: ` ${CUE_ANEXO} `,
      callerNombre: '  Ana Operadora ',
      justificacion: 'Motivo',
      respuestaDirector: 'Respuesta',
    })
    expect(resultado).toEqual({
      ok: true,
      value: {
        cueAnexo: CUE_ANEXO,
        callerNombre: 'Ana Operadora',
        justificacion: 'Motivo',
        respuestaDirector: 'Respuesta',
      },
    })
  })

  it('rechaza campos de texto vacíos o que superan el límite', () => {
    const vacio = validarEntradaLlamada({ ...entradaValida(), justificacion: '   ' })
    expect(vacio.ok).toBe(false)

    const largo = validarEntradaLlamada({
      ...entradaValida(),
      callerNombre: 'x'.repeat(LIMITES_LLAMADA.callerNombre + 1),
    })
    expect(largo.ok).toBe(false)

    const justoEnLimite = validarEntradaLlamada({
      ...entradaValida(),
      respuestaDirector: 'x'.repeat(LIMITES_LLAMADA.respuestaDirector),
    })
    expect(justoEnLimite.ok).toBe(true)
  })

  it('rechaza un CUE inválido', () => {
    const resultado = validarEntradaLlamada({ ...entradaValida(), cueAnexo: 'abc' })
    expect(resultado.ok).toBe(false)
  })

  it('ignora cualquier usuarioId enviado en el cuerpo', () => {
    const resultado = validarEntradaLlamada({ ...entradaValida(), usuarioId: 'otro-usuario' })
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect('usuarioId' in resultado.value).toBe(false)
  })
})

describe('registrarLlamada y listarLlamadasPorCue', () => {
  it('devuelve el historial del CUE del más nuevo al más viejo', async () => {
    await registrarLlamada(entradaValida({ justificacion: 'primera' }), new Date('2026-11-01T10:00:00Z'))
    await registrarLlamada(entradaValida({ justificacion: 'segunda' }), new Date('2026-11-03T10:00:00Z'))
    await registrarLlamada(entradaValida({ justificacion: 'tercera' }), new Date('2026-11-02T10:00:00Z'))

    const historial = await listarLlamadasPorCue(CUE_ANEXO)
    expect(historial.map((l) => l.justificacion)).toEqual(['segunda', 'tercera', 'primera'])
    expect(historial[0].creadaEn).toBe('2026-11-03T10:00:00.000Z')
    expect(historial[0].id).toBeTruthy()
  })
})

describe('ultimaLlamadaPorCue', () => {
  it('devuelve la llamada más reciente de cada CUE', async () => {
    await registrarLlamada(
      entradaValida({ cueAnexo: '7654321-02', callerNombre: 'Viejo' }),
      new Date('2026-11-01T08:00:00Z'),
    )
    await registrarLlamada(
      entradaValida({ cueAnexo: '7654321-02', callerNombre: 'Nuevo' }),
      new Date('2026-11-05T08:00:00Z'),
    )

    const ultimas = await ultimaLlamadaPorCue()
    expect(ultimas.get('7654321-02')).toEqual({
      creadaEn: '2026-11-05T08:00:00.000Z',
      callerNombre: 'Nuevo',
    })
  })
})
