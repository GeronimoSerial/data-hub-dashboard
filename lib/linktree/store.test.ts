import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { linktreeConfig } from '@/lib/db/schema'
import { CONFIG_INICIAL, type LinktreeConfig } from './config'
import { actualizarConfig, cargarConfig, guardarConfig } from './store'

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

describe('actualizarConfig', () => {
  const agregar = (id: string) => (actual: LinktreeConfig): LinktreeConfig => ({
    ...actual,
    grupos: [
      {
        id: 'g1',
        titulo: 'Accesos',
        enlaces: [
          ...(actual.grupos[0]?.enlaces ?? []),
          { id, titulo: id, descripcion: '', url: `https://${id}.mec.gob.ar`, icono: null, visible: true },
        ],
      },
    ],
  })

  it('aplica el cambio sobre lo guardado y lo persiste con el autor', async () => {
    await guardarConfig({ ...CONFIG_INICIAL, grupos: [] }, 'user-1')
    const resultado = await actualizarConfig('user-2', agregar('uno'))
    expect(resultado?.grupos[0].enlaces.map((e) => e.id)).toEqual(['uno'])
    expect((await cargarConfig()).grupos[0].enlaces).toHaveLength(1)
    const [fila] = await getDb().select().from(linktreeConfig)
    expect(fila.actualizadoPor).toBe('user-2')
  })

  it('no pierde ninguna alta cuando dos llegan al mismo tiempo', async () => {
    await guardarConfig({ ...CONFIG_INICIAL, grupos: [] }, 'user-1')
    await Promise.all([actualizarConfig('a', agregar('x')), actualizarConfig('b', agregar('y'))])
    const ids = (await cargarConfig()).grupos[0].enlaces.map((e) => e.id).sort()
    expect(ids).toEqual(['x', 'y'])
  })

  it('devuelve null y no guarda cuando el resultado no pasa la validación', async () => {
    await guardarConfig({ ...CONFIG_INICIAL, titulo: 'Intacto' }, 'user-1')
    const resultado = await actualizarConfig('user-2', (actual) => ({ ...actual, titulo: '' }))
    expect(resultado).toBeNull()
    expect((await cargarConfig()).titulo).toBe('Intacto')
  })
})
