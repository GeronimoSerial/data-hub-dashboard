import type { EjecutorSql } from '../ge-db'
import { crearAlcanceGe, type AlcanceGe } from './ge'
import type { AlcanceProvider } from './tipos'

export type { AlcanceProvider, IdentidadMiembro, UnidadAlcance } from './tipos'
export type { AlcanceGe } from './ge'

// Adapter for a CUE, with its GE-only surface. Keep one instance per request
// and use it for every read of that CUE, so the section rows are fetched once.
// Only the GE padrón exists for now. T4 resolves the adapter by the CUE's
// jurisdictional level (ge_escuela_nivel_jur), which is why this stays sync:
// the lookup is local and needs no I/O yet.
export function alcanceGeParaCue(client: EjecutorSql, corteId: number, cueAnexo: string): AlcanceGe {
  return crearAlcanceGe(client, corteId, cueAnexo)
}

export function alcanceParaCue(client: EjecutorSql, corteId: number, cueAnexo: string): AlcanceProvider {
  return alcanceGeParaCue(client, corteId, cueAnexo)
}
