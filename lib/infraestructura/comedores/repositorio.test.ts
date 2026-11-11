import { beforeAll, describe, expect, it } from 'vitest'
import { migrarDb } from '@/lib/db'
import { cargarComedoresPorCue, reemplazarComedores } from './repositorio'

const comedor = (cueAnexo: string, desayuno: boolean, almuerzo: boolean) =>
  ({ cueAnexo, desayuno, almuerzo, proveedor: null, fuentes: ['a'] })

describe('reemplazarComedores', () => {
  beforeAll(async () => { await migrarDb() })

  it('reemplaza por completo: un CUE ausente en la nueva planilla deja de tener servicio', async () => {
    await reemplazarComedores([comedor('1800001-00', true, true), comedor('1800002-00', true, false)], { fuente: 'a.xlsx' })
    await reemplazarComedores([comedor('1800002-00', false, true)], { fuente: 'b.xlsx' })
    const mapa = await cargarComedoresPorCue()
    expect([...mapa]).toEqual([['1800002-00', { desayuno: false, almuerzo: true }]])
  })
})
