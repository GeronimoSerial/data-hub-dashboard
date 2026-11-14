// Snapshot comparison for API contracts.
//
// Usage inside a spec:
//   import { compararSnapshot } from '../contratos/snapshot'
//   compararSnapshot('escuelas-admin', body)
//
// The value is normalized (see normalizar.ts), serialized as pretty JSON and compared with
// contratos/snapshots/<nombre>.json. A missing or different file throws with a diff.
//
// Updating snapshots is an explicit command, never a side effect of a normal run:
//   pnpm test:e2e:mapa:snapshots                       # all contract specs
//   pnpm test:e2e:mapa:snapshots -- e2e/mapa-enos/specs/contratos-fundacion.spec.ts
// That sets MAPA_E2E_ACTUALIZAR_SNAPSHOTS=1. The specs then rewrite the files inside the
// ephemeral project, and run.mjs copies contratos/snapshots/ back into the repository.
// Review the git diff of the snapshots before committing them.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { normalizar } from './normalizar'

export const DIR_SNAPSHOTS = path.join(__dirname, 'snapshots')
export const VARIABLE_ACTUALIZAR = 'MAPA_E2E_ACTUALIZAR_SNAPSHOTS'

const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9._-]*$/i
const MAX_LINEAS_DIFF = 200

function serializar(valor: unknown): string {
  return `${JSON.stringify(normalizar(valor), null, 2)}\n`
}

// Shows the changed block between the first and the last differing line, trimming the common prefix and suffix.
function diferencia(esperado: string, obtenido: string): string {
  const a = esperado.split('\n')
  const b = obtenido.split('\n')
  let inicio = 0
  while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) inicio++
  let finA = a.length
  let finB = b.length
  while (finA > inicio && finB > inicio && a[finA - 1] === b[finB - 1]) {
    finA--
    finB--
  }
  const lineas = [
    `first difference at line ${inicio + 1}`,
    ...a.slice(inicio, finA).slice(0, MAX_LINEAS_DIFF).map((linea) => `- ${linea}`),
    ...b.slice(inicio, finB).slice(0, MAX_LINEAS_DIFF).map((linea) => `+ ${linea}`),
  ]
  return lineas.join('\n')
}

/**
 * Compares `normalizar(valor)` with contratos/snapshots/<nombre>.json.
 * Throws when the file is missing or different. With MAPA_E2E_ACTUALIZAR_SNAPSHOTS=1, writes the file instead.
 */
export function compararSnapshot(nombre: string, valor: unknown): void {
  if (!NOMBRE_VALIDO.test(nombre) || nombre.includes('..')) {
    throw new Error(`Invalid snapshot name: "${nombre}"`)
  }
  const ruta = path.join(DIR_SNAPSHOTS, `${nombre}.json`)
  const obtenido = serializar(valor)

  if (process.env[VARIABLE_ACTUALIZAR] === '1') {
    mkdirSync(DIR_SNAPSHOTS, { recursive: true })
    writeFileSync(ruta, obtenido, 'utf8')
    return
  }

  if (!existsSync(ruta)) {
    throw new Error(
      `Snapshot "${nombre}" does not exist (${ruta}). If the new contract is intended, run: pnpm test:e2e:mapa:snapshots`,
    )
  }
  const esperado = readFileSync(ruta, 'utf8')
  if (esperado !== obtenido) {
    throw new Error(
      `Snapshot "${nombre}" differs from ${ruta}.\n${diferencia(esperado, obtenido)}\n` +
        'If the change is intended, run: pnpm test:e2e:mapa:snapshots',
    )
  }
}
