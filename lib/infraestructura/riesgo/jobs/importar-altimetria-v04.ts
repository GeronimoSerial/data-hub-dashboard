// Importa a infra_altimetria_escolar el CSV conservador de altimetría de
// Motor v0.4 (docs/motor-v0.4/altimetria.md). Reglas:
// - la cabecera debe ser exacta;
// - la regla se recalcula por fila y cualquier discrepancia de estado, cota
//   (> 1e-6 m) o fuente rechaza el archivo completo, informando los CUE;
// - la versión se deriva del sha256 del archivo: reimportar el mismo archivo
//   no escribe nada; un archivo distinto agrega una versión nueva y las
//   anteriores se conservan (rollback = leer la versión previa);
// - todas las filas (candidatas y pendientes) se escriben en una transacción.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { count, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraAltimetriaEscolar } from '@/lib/db/schema'
import { regionActiva } from '@/lib/infraestructura/region/activa'
import { fuenteDemDe } from '@/lib/infraestructura/region/fuente-dem'
import type { ResultadoAltimetria } from '../motor-v04/altimetria'
import {
  type FilaCsvAltimetria,
  FormatoAltimetriaInvalido, evaluarFilaCsvAltimetria, parsearCsvAltimetria } from '../motor-v04/altimetria-csv'

const TAMANO_LOTE = 500
const CONVERSION_COPERNICUS =
  'Copernicus GLO-30 EGM2008 convertido a SRVN16 (GEOIDE-Ar16) de forma aproximada; IGN MDE-Ar v2.1 en SRVN16'
// FABDEM regions: the heights are EGM2008 and no conversion to SRVN16 is applied.
const CONVERSION_FABDEM =
  'FABDEM V1-2 (Universidade de Bristol / Fathom, CC BY-NC-SA 4.0), alturas em EGM2008; sem conversao para SRVN16'

// Text stamped in `conversion`, chosen by the active region's DEM source.
function conversionDeRegionActiva(): string {
  return fuenteDemDe(regionActiva()) === 'fabdem' ? CONVERSION_FABDEM : CONVERSION_COPERNICUS
}

export type ResultadoImportarAltimetriaV04 =
  | { ejecutado: false; estado: 'fallido'; mensaje: string; cuesDiscrepantes?: string[] }
  | { ejecutado: true; estado: 'completo' | 'ya_importado'; version: string; contadores: Record<string, number> }

export type OpcionesImportarAltimetriaV04 = {
  ruta?: string
  leerArchivo?: (ruta: string) => Promise<string>
  ahora?: Date
}

function contar(resultados: ResultadoAltimetria[]): Record<string, number> {
  const c: Record<string, number> = { filas: resultados.length, candidatas: 0, pendientes: 0 }
  for (const r of resultados) {
    const clave = r.estado === 'candidata' ? `fuente:${r.fuenteConservadora}` : `pendiente:${r.motivo}`
    c[r.estado === 'candidata' ? 'candidatas' : 'pendientes'] += 1
    c[clave] = (c[clave] ?? 0) + 1
  }
  return c
}

export async function importarAltimetriaV04(
  opts: OpcionesImportarAltimetriaV04 = {},
): Promise<ResultadoImportarAltimetriaV04> {
  const ruta = opts.ruta ?? process.env.ALTIMETRIA_V04_CSV
  if (!ruta) return { ejecutado: false, estado: 'fallido', mensaje: 'sin archivo de altimetría' }
  const leer = opts.leerArchivo ?? ((r: string) => fs.readFile(r, 'utf8'))
  const importadoEn = (opts.ahora ?? new Date()).toISOString()

  let texto: string
  try {
    texto = await leer(ruta)
  } catch {
    return { ejecutado: false, estado: 'fallido', mensaje: 'sin archivo de altimetría' }
  }

  let evaluadas: { fila: FilaCsvAltimetria; resultado: ResultadoAltimetria }[]
  try {
    const filas = parsearCsvAltimetria(texto)
    const discrepantes: string[] = []
    evaluadas = filas.map((fila) => {
      const { resultado, coincide } = evaluarFilaCsvAltimetria(fila)
      if (!coincide) discrepantes.push(fila.cueAnexo)
      return { fila, resultado }
    })
    if (discrepantes.length > 0) {
      return { ejecutado: false, estado: 'fallido', mensaje: 'discrepancia con la regla', cuesDiscrepantes: discrepantes }
    }
  } catch (error) {
    if (error instanceof FormatoAltimetriaInvalido) return { ejecutado: false, estado: 'fallido', mensaje: error.message }
    throw error
  }

  const sha256 = createHash('sha256').update(texto).digest('hex')
  const version = `altimetria-v04-${sha256.slice(0, 16)}`
  const contadores = contar(evaluadas.map((e) => e.resultado))
  const conversion = conversionDeRegionActiva()
  const db = getDb()

  const [existente] = await db
    .select({ total: count() })
    .from(infraAltimetriaEscolar)
    .where(eq(infraAltimetriaEscolar.version, version))
  if (Number(existente?.total ?? 0) > 0) return { ejecutado: true, estado: 'ya_importado', version, contadores }

  // Un NaN/Infinity del archivo se guarda como null: sin dato, nunca 0.
  const finito = (v: number | null) => (v !== null && Number.isFinite(v) ? v : null)
  const filas = evaluadas.map(({ fila, resultado: r }) => ({
    cueAnexo: fila.cueAnexo,
    version,
    estado: r.estado,
    motivo: r.estado === 'pendiente' ? r.motivo : null,
    ignP10M: finito(fila.ignP10M),
    copernicusP10M: finito(fila.copernicusP10M),
    cotaPrincipalM: r.estado === 'candidata' ? r.cotaPrincipalM : null,
    cotaConservadoraM: r.estado === 'candidata' ? r.cotaConservadoraM : null,
    fuenteConservadora: r.estado === 'candidata' ? r.fuenteConservadora : null,
    fuentesValidas: r.estado === 'candidata' ? r.fuentesValidas : 0,
    referenciaVertical: fila.referenciaVertical,
    operador: fila.operador,
    conversion,
    origenSha256: sha256,
    importadoEn,
  }))

  await db.transaction(async (tx) => {
    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      await tx.insert(infraAltimetriaEscolar).values(filas.slice(i, i + TAMANO_LOTE))
    }
  })
  return { ejecutado: true, estado: 'completo', version, contadores }
}
