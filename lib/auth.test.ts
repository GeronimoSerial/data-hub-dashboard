// Regresión del follow-up de aislamiento de tests (gate ENOS): antes,
// `lib/auth.ts` llamaba `getDb()` a nivel de módulo dentro de
// `drizzleAdapter(getDb(), ...)`, así que CUALQUIER import de `@/lib/auth`
// -aunque fuera transitivo- congelaba la conexión a lo que DATA_DIR
// resolviera en ese instante, sin importar qué DATA_DIR se seteara después en
// un `beforeAll` de test. Ver el comentario en
// app/api/infraestructura/verificaciones/route.test.ts ("No usa
// importOriginal...") que documenta el workaround que este fix hace
// innecesario.
//
// Observabilidad: el observable viejo era `existsSync(DATA_DIR/hub.sqlite)`
// ("¿ya se abrió el archivo de la base?"). Dejó de servir en DB1/F2: bajo
// Vitest `getDb()` (ver lib/db/index.ts) usa SIEMPRE PGlite EN MEMORIA
// (detecta `process.env.VITEST`), sin importar DATA_DIR, así que nunca se
// crea un `hub.sqlite`. El observable nuevo es el propio `getDb()`: se
// mockea `@/lib/db` de forma PARCIAL (conservando su implementación real y
// sólo envolviéndola en un espía) y se cuenta cuántas veces lo invoca
// `@/lib/auth`. Eso mide exactamente la garantía que importa: construcción
// perezosa (0 llamadas al importar) y memoizada (1 llamada en el primer uso,
// ninguna más después).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as dbModule from '@/lib/db'

// Mock parcial: `importOriginal` trae el `getDb` real (PGlite en memoria bajo
// Vitest) y devolvemos el módulo completo con `getDb` envuelto en un espía.
// El test referencia el mismo espía importando `@/lib/db` (mismo registro de
// módulos que ve `@/lib/auth`).
//
// Ojo: `vi.resetModules()` NO descarta el resultado de la fábrica del mock, así
// que ambos tests comparten el mismo espía. Por eso hay que limpiar sus conteos
// en `beforeEach` (clearAllMocks): sin eso, las llamadas del primer test se
// suman a las del segundo y la aserción de "1 llamada" ve 2.
vi.mock('@/lib/db', async (importOriginal) => {
  const real = await importOriginal<typeof dbModule>()
  return { ...real, getDb: vi.fn(real.getDb) }
})

describe('lib/auth - conexión perezosa a la base', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('no abre la base al importar; la construye recién en el primer uso', async () => {
    vi.resetModules()
    const { auth } = await import('@/lib/auth')
    const getDb = vi.mocked((await import('@/lib/db')).getDb)

    // El import por sí solo no debe tocar la conexión: si `betterAuth(...)`
    // corriera a nivel de módulo (bug original), esto fallaría acá.
    expect(getDb).not.toHaveBeenCalled()

    // Primer uso real de `auth` (cualquier propiedad dispara el proxy):
    // recién acá se construye la instancia y se pide la conexión.
    void auth.$context

    expect(getDb).toHaveBeenCalledTimes(1)
  })

  it('memoiza: usos posteriores no vuelven a construir la conexión', async () => {
    vi.resetModules()
    const { auth } = await import('@/lib/auth')
    const getDb = vi.mocked((await import('@/lib/db')).getDb)

    void auth.$context // primer uso: construye la instancia y pide la conexión
    expect(getDb).toHaveBeenCalledTimes(1)

    // Segundo uso: la instancia ya está memoizada, no se vuelve a pedir la
    // conexión (mismo criterio que `getDb()`).
    void auth.$context
    expect(getDb).toHaveBeenCalledTimes(1)
  })
})
