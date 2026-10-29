import { describe, expect, it } from 'vitest'
import { CONFIG_INICIAL, type LinksConfig } from './config'
import { cargarConfig, guardarConfig } from './store'

const documento: LinksConfig = {
  ...CONFIG_INICIAL,
  titulo: 'Accesos de prueba',
  enlaces: [{ id: 'e1', titulo: 'Portal', descripcion: 'Del Estado', url: 'https://www.argentina.gob.ar' }],
}

describe('store de la miniapp de enlaces', () => {
  it('devuelve la configuración inicial cuando no hay fila guardada', async () => {
    expect(await cargarConfig()).toEqual(CONFIG_INICIAL)
  })

  it('guarda y vuelve a leer el documento', async () => {
    await guardarConfig(documento)
    expect(await cargarConfig()).toEqual(documento)
  })

  it('sobrescribe la única fila en vez de agregar otra', async () => {
    await guardarConfig({ ...documento, titulo: 'Otro' })
    expect((await cargarConfig()).titulo).toBe('Otro')
  })
})
