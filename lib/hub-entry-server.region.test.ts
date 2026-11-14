import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

import { requireServerHubPageAccess, hubApiAccessResponse } from '@/lib/hub-entry-server'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

afterEach(() => {
  vi.unstubAllEnvs()
  __reiniciarRegionActivaParaPruebas()
})

function region(id: string) {
  vi.stubEnv('REGION', id)
  __reiniciarRegionActivaParaPruebas()
}

describe('acceso a módulos exclusivos de Corrientes', () => {
  it.each(['/cuadernillos', '/mapas/matricula', '/mapas/natalidad', '/mapas/reorganizacion'])('Corrientes: %s sigue pidiendo sesión', async (ruta) => {
    region('')
    await expect(requireServerHubPageAccess(ruta)).rejects.toThrow(/REDIRECT:\/login/)
  })

  it.each(['/cuadernillos', '/mapas/matricula', '/mapas/natalidad', '/mapas/reorganizacion'])('Manaos: %s responde notFound', async (ruta) => {
    region('manaos')
    await expect(requireServerHubPageAccess(ruta)).rejects.toThrow('NOT_FOUND')
  })

  it('Manaos: las rutas comunes siguen pidiendo sesión', async () => {
    region('manaos')
    await expect(requireServerHubPageAccess('/situacion')).rejects.toThrow(/REDIRECT:\/login/)
  })

  it('Manaos: la API de cuadernillos responde 404; Corrientes conserva 401', async () => {
    region('manaos')
    expect((await hubApiAccessResponse(null, '/cuadernillos'))?.status).toBe(404)
    region('')
    expect((await hubApiAccessResponse(null, '/cuadernillos'))?.status).toBe(401)
  })
})
