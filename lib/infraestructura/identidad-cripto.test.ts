import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cifrarIdentidad, obtenerClave } from './identidad-cripto'

const CLAVE = Buffer.alloc(32, 7)

describe('cifrarIdentidad', () => {
  it('produce un payload distinto en cada llamada (iv aleatorio)', () => {
    const a = cifrarIdentidad('ANA', 'PEREZ', CLAVE)
    const b = cifrarIdentidad('ANA', 'PEREZ', CLAVE)
    expect(a).not.toBe(b)
  })

  it('nunca deja el nombre en claro dentro del payload', () => {
    const payload = cifrarIdentidad('BIANCA', 'ALBARENGA', CLAVE)
    expect(payload).not.toContain('BIANCA')
    expect(payload).not.toContain('ALBARENGA')
  })
})

describe('obtenerClave', () => {
  it('rechaza una clave que no decodifica a 32 bytes', () => {
    const previa = process.env.NOMINAL_ENCRYPTION_KEY
    process.env.NOMINAL_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64')
    try {
      expect(() => obtenerClave()).toThrow(/32 bytes/)
    } finally {
      process.env.NOMINAL_ENCRYPTION_KEY = previa
    }
  })
})

// Guarda de arquitectura: scripts/import-padron.mjs carga este módulo dentro
// del contenedor de producción, donde el bundle standalone de Next NO deja
// drizzle-orm ni el resto del ORM resolubles como paquetes. Si alguien agrega
// acá un import hacia el ORM o hacia identidad.ts, el importador del padrón
// deja de arrancar en producción y sólo se descubre en el despliegue.
describe('aislamiento del módulo', () => {
  it('no importa nada más que node:crypto', () => {
    const fuente = readFileSync(join(__dirname, 'identidad-cripto.ts'), 'utf8')
    const imports = [...fuente.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual(['node:crypto'])
  })
})
