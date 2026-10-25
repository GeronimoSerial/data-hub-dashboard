import { describe, expect, it, vi } from 'vitest'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { GET } from './route'

// Caso 503 aislado en su propio archivo: sin filas de matrícula, no hay corte vigente.
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

usarDbTemporal('matricula-route-sin-corte', {
  env: { PROBLEMATICAS_ACCESO_PASSWORD: claveDePrueba(), MATRICULA_DNI_SECRET: 'secreto-sin-corte' },
})

describe('GET /api/problematicas/parte/matricula sin corte vigente', () => {
  it('responde 503 cuando no hay matrícula vigente cargada', async () => {
    const { token } = crearTokenSesion()
    const res = await GET(
      new Request('http://localhost/api/problematicas/parte/matricula?cue=1801605-51&carreras=1&q=perez', {
        headers: { cookie: `${NOMBRE_COOKIE}=${token}` },
      }),
    )
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'No hay una matrícula vigente cargada' })
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})
