#!/usr/bin/env node
/**
 * Puente Node para el batch Python services/geo-static (rutas a centros de
 * evacuados): imprime en stdout un JSON con las escuelas con coordenadas y los CUE
 * elegibles como destino por exposición estática. Necesita DATABASE_URL.
 *   node scripts/centros-evacuados-io.mjs leer
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

registerTsResolver(join(dirname(fileURLToPath(import.meta.url)), '..'))

async function main() {
  const [comando] = process.argv.slice(2)
  if (comando !== 'leer') {
    console.error('Uso: node scripts/centros-evacuados-io.mjs leer')
    process.exit(2)
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  const { migrarDb, getRawClient } = await import('../lib/db/index.ts')
  const { cargarElegiblesEstaticos } = await import('../lib/infraestructura/evacuacion/calculo.ts')
  try {
    await migrarDb()
    console.log(JSON.stringify(await cargarElegiblesEstaticos()))
  } finally {
    const raw = getRawClient()
    if (typeof raw.end === 'function') await raw.end()
    else await raw.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
