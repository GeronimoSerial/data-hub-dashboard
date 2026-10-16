#!/usr/bin/env node
// Punto inicial verificable: preserva lo disponible, no inventa corridas pasadas.
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
registerTsResolver(process.cwd())
if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== '/hub_prod') {
  console.error('El archivo inicial requiere hub_prod'); process.exit(1)
}
const { getDb, getRawClient, migrarDb } = await import('../lib/db/index.ts')
const { hidroLectura, hidroReferencia } = await import('../lib/db/schema.ts')
const { leerVersion } = await import('../lib/infraestructura/datasets/repositorio.ts')
const { publicarCorridaPrefectura } = await import('../lib/infraestructura/hidrometria/publicacion.ts')
try {
  await migrarDb()
  await getDb().transaction(async (tx) => {
    const catalogo = await leerVersion('estaciones-prefectura', undefined, tx)
    if (!catalogo) throw new Error('Falta catálogo versionado')
    // Preservar también todas las mediciones previas, con clave estación/fecha.
    for (const tipo of ['alturas', 'referencias']) {
      const anterior = await leerVersion('prefectura-'+tipo, undefined, tx)
      if (anterior && (tipo==='referencias' || anterior.version.metadatos.jobRunId !== 'archivo-inicial-disponible')) continue
      const filas = await tx.select().from(tipo==='alturas' ? hidroLectura : hidroReferencia)
      if (!filas.length) continue
      const fecha = filas.map(f=>tipo==='alturas' ? f.capturadaEn : f.calculadoEn).sort().at(-1)
      await publicarCorridaPrefectura({ tipo, filas, capturadaEn: fecha,
        jobRunId: 'archivo-inicial-completo', catalogoVersion: catalogo.version.id,
        originalesNoDisponibles: true }, tx)
      console.log(JSON.stringify({ tipo, filas: filas.length, fecha }))
    }
  })
} catch {
  console.error('No se pudo archivar el estado inicial de Prefectura'); process.exitCode=1
} finally { await getRawClient().end() }
