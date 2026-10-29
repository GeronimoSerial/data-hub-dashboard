import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { linktreeConfig } from '@/lib/db/schema'
import { CONFIG_INICIAL, type LinktreeConfig } from './config'
import { cargarConfig, guardarConfig } from './store'

const documento: LinktreeConfig = {
  ...CONFIG_INICIAL,
  titulo: 'Sistemas de prueba',
  acento: 'celeste',
  grupos: [
    {
      id: 'g1',
      titulo: 'Datos',
      enlaces: [
        { id: 'e1', titulo: 'Hub', descripcion: '', url: '/explorar', icono: 'database', visible: true },
      ],
    },
  ],
}

describe('store del linktree', () => {
  it('devuelve la configuración inicial cuando no hay fila guardada', async () => {
    expect(await cargarConfig()).toEqual(CONFIG_INICIAL)
  })

  it('guarda y vuelve a leer el documento, registrando quién lo cambió', async () => {
    await guardarConfig(documento, 'user-1')
    expect(await cargarConfig()).toEqual(documento)
    const [fila] = await getDb().select().from(linktreeConfig)
    expect(fila.actualizadoPor).toBe('user-1')
  })

  it('reemplaza la única fila en cada guardado', async () => {
    await guardarConfig({ ...documento, titulo: 'Primero' }, 'user-1')
    await guardarConfig({ ...documento, titulo: 'Segundo' }, 'user-2')
    const filas = await getDb().select().from(linktreeConfig)
    expect(filas).toHaveLength(1)
    expect((await cargarConfig()).titulo).toBe('Segundo')
    expect(filas[0].actualizadoPor).toBe('user-2')
  })

  it('cae a la configuración inicial si el documento guardado es inválido', async () => {
    await getDb()
      .insert(linktreeConfig)
      .values({ id: 1, config: { version: 1, grupos: 'roto' } })
      .onConflictDoUpdate({ target: linktreeConfig.id, set: { config: { version: 1, grupos: 'roto' } } })
    expect(await cargarConfig()).toEqual(CONFIG_INICIAL)
  })
})
