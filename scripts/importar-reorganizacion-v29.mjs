#!/usr/bin/env node
/**
 * Importa el corte V29 del mapa de reorganización: lee el HTML del mockup como
 * texto, normaliza el dataset y escribe el dataset y el informe de cobertura.
 *
 * Uso:
 *   node scripts/importar-reorganizacion-v29.mjs [<ruta-html>] [--salida <json>] [--informe <json>]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
registerTsResolver(raiz)

const HTML_POR_DEFECTO = 'services/Mapa_Reduccion_Establecimientos_Hasta_10_Alumnos_V29_Diseno_Actualizado_Liquidaciones.html'
const SALIDA_POR_DEFECTO = 'lib/reorganizacion/data/v29.json'
const INFORME_POR_DEFECTO = 'lib/reorganizacion/data/v29.informe.json'

function leerArgumentos(argv) {
  const opciones = { html: HTML_POR_DEFECTO, salida: SALIDA_POR_DEFECTO, informe: INFORME_POR_DEFECTO }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--salida') opciones.salida = argv[++i]
    else if (arg === '--informe') opciones.informe = argv[++i]
    else opciones.html = arg
  }
  if (!opciones.salida || !opciones.informe) throw new Error('Faltan valores para --salida o --informe')
  return opciones
}

// Serialización estable: 2 espacios y salto final, sin marcas de tiempo.
const serializar = (valor) => `${JSON.stringify(valor, null, 2)}\n`

async function main() {
  const { html, salida, informe } = leerArgumentos(process.argv.slice(2))
  const { normalizarV29 } = await import('../lib/reorganizacion/importar-v29.ts')

  const contenido = readFileSync(resolve(raiz, html), 'utf8')
  const { dataset, informe: resumen } = normalizarV29(contenido)

  const rutaSalida = resolve(raiz, salida)
  const rutaInforme = resolve(raiz, informe)
  mkdirSync(dirname(rutaSalida), { recursive: true })
  mkdirSync(dirname(rutaInforme), { recursive: true })
  writeFileSync(rutaSalida, serializar(dataset))
  writeFileSync(rutaInforme, serializar(resumen))

  const cifras = [
    'escuelas', 'alumnos', 'conCoordenadas', 'conImportePositivo', 'conRegistrosPof',
    'centros', 'zonasOcupadas', 'referencias', 'referenciasPrimaria', 'referenciasSecundaria',
    'clavesOferta', 'referenciasSinOferta', 'ofertaSinReferencia',
  ]
  for (const clave of cifras) console.log(`${clave}: ${resumen[clave]}`)
  console.log(`sinImporte: ${resumen.sinImporte.length} (${resumen.sinImporte.join(', ')})`)
  console.log(`Escritos: ${join(salida)} y ${join(informe)}`)
}

main().catch((error) => {
  console.error(`Importación V29 fallida: ${error.message}`)
  process.exit(1)
})
