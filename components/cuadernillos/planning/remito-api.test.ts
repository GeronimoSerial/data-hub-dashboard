import { describe, expect, it } from 'vitest'
import { dispatchErrorMessage, REMITO_ERRORS } from './remito-api'

const labels = new Map([['p1', 'Cuadernillo para estudiantes de 1.er grado'], ['p2', 'Cuadernillo para estudiantes de 2.º grado']])
const schools = new Map([['180123457', 'Escuela N° 5'], ['180123458', 'Colegio Sur']])
const available = new Map([['p1', 0], ['p2', 12]])

describe('dispatchErrorMessage', () => {
  it('names a school that is no longer a priority', () => {
    expect(dispatchErrorMessage({ error: 'recipients_not_critical', recipientCueAnexos: ['180123457'] }, labels, schools))
      .toBe('La Escuela N° 5 ya no figura como prioritaria, quitala del envío.')
  })

  it('names several schools and falls back to the CUE for unknown ones', () => {
    expect(dispatchErrorMessage({ error: 'recipients_not_critical', recipientCueAnexos: ['180123458', '999'] }, labels, schools))
      .toBe('Estas escuelas ya no figuran como prioritarias, quitalas del envío: escuela Colegio Sur, escuela con CUE 999.')
  })

  it('tells the stock left of the product that does not suffice', () => {
    expect(dispatchErrorMessage({ error: 'insufficient_stock', productIds: ['p2'] }, labels, schools, available))
      .toBe('No alcanza el stock de 2.º grado: quedan 12.')
    expect(dispatchErrorMessage({ error: 'insufficient_stock', productIds: ['p1', 'p2'] }, labels, schools, available))
      .toBe('No alcanza el stock de 1.er grado (quedan 0), 2.º grado (quedan 12).')
    expect(dispatchErrorMessage({ error: 'insufficient_stock', productIds: ['p2'] }, labels, schools))
      .toBe('No alcanza el stock de 2.º grado.')
  })

  it('explains in plain words that the cabecera is not confirmed yet', () => {
    const message = dispatchErrorMessage({ error: 'authority_unavailable' }, labels, schools)
    expect(message).toContain('La escuela cabecera todavía no confirmó su cuenta')
    expect(message).not.toContain('authority_unavailable')
  })

  it('never shows a raw code and uses the plain vocabulary', () => {
    for (const [code, text] of Object.entries(REMITO_ERRORS)) {
      expect(text, code).not.toContain(code)
      expect(text, code).not.toMatch(/remito|despach|severidad|cr[ií]tica/i)
    }
    expect(dispatchErrorMessage({ error: 'something_new' }, labels, schools)).toBe('No se pudo enviar. Intentá nuevamente.')
  })
})
