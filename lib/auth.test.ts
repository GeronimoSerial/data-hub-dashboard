// Regresión del follow-up de aislamiento de tests (gate ENOS): antes,
// `lib/auth.ts` llamaba `getDb()` a nivel de módulo dentro de
// `drizzleAdapter(getDb(), ...)`, así que CUALQUIER import de `@/lib/auth`
// -aunque fuera transitivo- congelaba la conexión a lo que DATA_DIR
// resolviera en ese instante (típicamente `.data/hub.sqlite` de un checkout
// de dev), sin importar qué DATA_DIR se seteara después en un `beforeAll` de
// test. Ver el comentario en app/api/infraestructura/verificaciones/route.test.ts
// ("No usa importOriginal...") que documenta el workaround que este fix hace
// innecesario.
//
// Esta prueba usa `vi.resetModules()` + import dinámico para verificar, sin
// mocks del módulo bajo prueba, que:
// 1. Importar '@/lib/auth' NO abre ningún archivo de base.
// 2. Cambiar DATA_DIR DESPUÉS del import, y recién entonces tocar `auth` por
//    primera vez, hace que la conexión real se abra contra el DATA_DIR
//    vigente en ESE momento, no en el del import.
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('lib/auth - conexión perezosa a la base', () => {
  let dirA: string | undefined
  let dirB: string | undefined
  const prevDataDir = process.env.DATA_DIR

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR
    else process.env.DATA_DIR = prevDataDir
    if (dirA) rmSync(dirA, { recursive: true, force: true })
    if (dirB) rmSync(dirB, { recursive: true, force: true })
    dirA = undefined
    dirB = undefined
    vi.resetModules()
  })

  it('no abre la base al importar; usa el DATA_DIR vigente recién en el primer uso', async () => {
    dirA = mkdtempSync(path.join(tmpdir(), 'auth-lazy-a-'))
    dirB = mkdtempSync(path.join(tmpdir(), 'auth-lazy-b-'))

    process.env.DATA_DIR = dirA
    vi.resetModules()
    const { auth } = await import('@/lib/auth')

    // El import por sí solo no debe abrir el archivo de la base en dirA: si
    // `betterAuth(...)` corriera a nivel de módulo (bug original), esto
    // fallaría acá.
    expect(existsSync(path.join(dirA, 'hub.sqlite'))).toBe(false)

    // Cambiar DATA_DIR DESPUÉS del import: con la conexión eager original
    // esto no tendría efecto, porque ya habría memoizado dirA en el import.
    process.env.DATA_DIR = dirB

    // Primer uso real de `auth` (cualquier propiedad dispara el proxy):
    // recién acá se construye la instancia y se abre la conexión.
    void auth.$context

    expect(existsSync(path.join(dirB, 'hub.sqlite'))).toBe(true)
    expect(existsSync(path.join(dirA, 'hub.sqlite'))).toBe(false)
  })

  it('memoiza: usos posteriores no reabren ni migran la conexión a un DATA_DIR nuevo', async () => {
    dirA = mkdtempSync(path.join(tmpdir(), 'auth-lazy-memo-a-'))
    dirB = mkdtempSync(path.join(tmpdir(), 'auth-lazy-memo-b-'))

    process.env.DATA_DIR = dirA
    vi.resetModules()
    const { auth } = await import('@/lib/auth')

    void auth.$context // primer uso: fija la conexión a dirA
    expect(existsSync(path.join(dirA, 'hub.sqlite'))).toBe(true)

    // Cambiar DATA_DIR ahora, DESPUÉS del primer uso, no debe mover nada: la
    // instancia ya está memoizada (mismo criterio que getDb()).
    process.env.DATA_DIR = dirB
    void auth.$context

    expect(existsSync(path.join(dirB, 'hub.sqlite'))).toBe(false)
  })
})
