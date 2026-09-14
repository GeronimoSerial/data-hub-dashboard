import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { archivoAbsPath, archivoStorageKey } from '@/lib/archivo'
export { isTableroSeed } from '@/lib/resource-pilot'

export type SeedPublicFile = {
  id: string
  publicRel: string
  /** Historical URL retained for the gated direct-document route. */
  legacyRuta?: string
  mime: string
  nombreOriginal: string
}

/** Catalog HTML/PDF that should be stored as uploads, not internal rutas. */
export const SEED_PUBLIC_FILES: SeedPublicFile[] = [
  {
    id: 'r2',
    publicRel: 'tablero/index.html',
    legacyRuta: '/tablero',
    mime: 'text/html',
    nombreOriginal: 'tablero.html',
  },
  {
    id: 'r3',
    publicRel: 'mapa_interactivo/index.html',
    legacyRuta: '/mapa_interactivo',
    mime: 'text/html',
    nombreOriginal: 'mapa_interactivo.html',
  },
  {
    id: 'r13',
    publicRel: 'mapa_sobreedad/index.html',
    legacyRuta: '/mapa_sobreedad',
    mime: 'text/html',
    nombreOriginal: 'mapa_sobreedad.html',
  },
  {
    id: 'r14',
    publicRel: 'mapa_notas/index.html',
    legacyRuta: '/mapa_notas',
    mime: 'text/html',
    nombreOriginal: 'mapa_notas.html',
  },
  {
    id: 'r15',
    publicRel: 'recursos/reporte-sobreedad-inicial.pdf',
    mime: 'application/pdf',
    nombreOriginal: 'reporte-sobreedad-inicial.pdf',
  },
  {
    id: 'r16',
    publicRel: 'recursos/reporte-sobreedad-primario.pdf',
    mime: 'application/pdf',
    nombreOriginal: 'reporte-sobreedad-primario.pdf',
  },
  {
    id: 'r17',
    publicRel: 'recursos/reporte-sobreedad-secundario.pdf',
    mime: 'application/pdf',
    nombreOriginal: 'reporte-sobreedad-secundario.pdf',
  },
]

export function seedStorageKey(id: string) {
  return archivoStorageKey(id, 'seed')
}

export function seedResourceIdForRuta(ruta: string) {
  return SEED_PUBLIC_FILES.find((spec) => spec.legacyRuta === ruta)?.id ?? null
}

export function shouldReplaceWithSeedFile(row: {
  id: string
  ruta: string | null
  storageKey: string | null
}) {
  const spec = SEED_PUBLIC_FILES.find((s) => s.id === row.id)
  if (!spec) return false
  const key = row.storageKey?.trim() || null
  if (key && key !== seedStorageKey(row.id)) return false
  return true
}

export function copySeedPublicFile(spec: SeedPublicFile) {
  const src = path.join(process.cwd(), 'public', spec.publicRel)
  const key = seedStorageKey(spec.id)
  const dest = archivoAbsPath(key)
  if (!dest) throw new Error(`invalid seed storage key for ${spec.id}`)
  mkdirSync(path.dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  return { storageKey: key, size: statSync(dest).size }
}
