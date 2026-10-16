#!/usr/bin/env node
// Resultados Python → archivo histórico + proyección + publicación atómicos.
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
registerTsResolver(process.cwd())
if (!process.env.DATABASE_URL) { console.error('Falta DATABASE_URL'); process.exit(1) }
const { migrarDb, getDb, getRawClient } = await import('../lib/db/index.ts')
try {
  let texto = ''
  for await (const bloque of process.stdin) texto += bloque
  const entrada = JSON.parse(texto)
  const lista = Array.isArray(entrada) ? entrada : [entrada]
  const { ingestarGeo, esTipoGeo } = await import('../lib/infraestructura/datasets/geo-static.ts')
  const { guardarVersion } = await import('../lib/infraestructura/datasets/repositorio.ts')
  await migrarDb()
  const resultado = await getDb().transaction(async (tx) => {
    const versiones = []
    for (const { tipo, filas, ...opciones } of lista) {
      let id
      if (esTipoGeo(tipo)) id = await ingestarGeo(tipo, filas, opciones, tx)
      else if (tipo === 'aislamiento-diagnostico') id = await guardarVersion({
        ...opciones, datasetId: 'geo-aislamiento-diagnostico', nombre: 'Diagnóstico de aislamiento', formato: 'array', clave: 'cue_anexo', datos: filas,
      }, tx)
      else throw new Error('Tipo de resultado desconocido')
      versiones.push({ tipo, versionId: id, filas: filas.length })
    }
    return versiones
  })
  console.log(JSON.stringify(resultado))
} catch (error) {
  console.error(`${error.cause?.code ?? error.code ?? 'validacion'}: ${String(error.cause?.message ?? error.message ?? 'Error de ingesta').slice(0, 1000)}`)
  process.exitCode = 1
} finally {
  const raw = getRawClient()
  if (typeof raw.end === 'function') await raw.end()
  else await raw.close()
}
