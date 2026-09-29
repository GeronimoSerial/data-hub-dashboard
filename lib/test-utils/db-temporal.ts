import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll } from 'vitest'

type OpcionesDbTemporal = {
  /** Ejecuta `ensureSeeded()` una vez fijado DATA_DIR (por defecto sí). */
  seed?: boolean
  /** Variables de entorno extra que rigen mientras corre el archivo; se restauran al final. */
  env?: Record<string, string>
}

/**
 * Aísla un archivo de test con un DATA_DIR temporal propio.
 *
 * Registra sus propios `beforeAll`/`afterAll`, que Vitest ejecuta antes que los que el
 * archivo declare después de llamar a este helper. Las variables de entorno modificadas
 * se restauran (o se borran si no existían) y el directorio se elimina al terminar.
 */
export function usarDbTemporal(prefijo: string, opciones: OpcionesDbTemporal = {}) {
  const { seed = true, env = {} } = opciones
  const previas = new Map<string, string | undefined>()
  let dir = ''

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), `${prefijo}-`))
    for (const [clave, valor] of Object.entries({ DATA_DIR: dir, ...env })) {
      previas.set(clave, process.env[clave])
      process.env[clave] = valor
    }
    if (seed) {
      // Import dinámico: el módulo lee DATA_DIR al cargarse, por eso va después de fijarlo.
      const { ensureSeeded } = await import('@/lib/db/seed')
      await ensureSeeded()
    }
  })

  afterAll(() => {
    for (const [clave, valor] of previas) {
      if (valor === undefined) delete process.env[clave]
      else process.env[clave] = valor
    }
    rmSync(dir, { recursive: true, force: true })
  })

  return {
    get dir() {
      return dir
    },
  }
}
