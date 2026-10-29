import type { Workbook, Worksheet, CellValue } from 'exceljs'
import { normalizeCue } from '../cue'

export const HOJA_COMEDORES = 'PlanillaServicioComedor'
const FILA_ENCABEZADO = 3
const COLUMNAS = {
  cue: 'Cue-Anexo',
  proveedor: 'Proveedor',
  desayuno: 'Raciones Desayuno',
  almuerzo: 'Raciones Almuerzo',
} as const

export interface FilaComedorCruda {
  cueAnexo: string
  proveedor: string | null
  racionesDesayuno: number
  racionesAlmuerzo: number
  fuente: string
}

export interface FilaRechazada {
  fila: number
  fuente: string
  cue: string | null
  motivo: 'cue_vacio' | 'cue_invalido'
}

export interface ComedorAgregado {
  cueAnexo: string
  desayuno: boolean
  almuerzo: boolean
  proveedor: string | null
  fuentes: string[]
}

export interface EstadisticasComedores {
  filasLeidas: number
  cuesUnicos: number
  sinRaciones: number
  repetidosPorFuente: Record<string, number>
  solapadosEntreFuentes: number
}

function texto(valor: CellValue): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'object') {
    const v = valor as { result?: CellValue; text?: string; richText?: Array<{ text: string }> }
    if (v.richText) return texto(v.richText.map((t) => t.text).join(''))
    if (v.result !== undefined) return texto(v.result)
    if (typeof v.text === 'string') return texto(v.text)
    return null
  }
  const limpio = String(valor).trim()
  return limpio === '' ? null : limpio
}

function numero(valor: CellValue): number {
  const t = texto(valor)
  if (t === null) return 0
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function indicesPorEncabezado(hoja: Worksheet): Record<keyof typeof COLUMNAS, number> {
  const encabezados = new Map<string, number>()
  hoja.getRow(FILA_ENCABEZADO).eachCell({ includeEmpty: false }, (celda, col) => {
    const nombre = texto(celda.value)
    if (nombre) encabezados.set(nombre, col)
  })
  const indices = {} as Record<keyof typeof COLUMNAS, number>
  for (const [clave, nombre] of Object.entries(COLUMNAS) as Array<[keyof typeof COLUMNAS, string]>) {
    const col = encabezados.get(nombre)
    if (col === undefined) throw new Error(`Falta la columna "${nombre}" en la fila ${FILA_ENCABEZADO} de la hoja ${HOJA_COMEDORES}`)
    indices[clave] = col
  }
  return indices
}

export function leerPlanillaComedores(
  libro: Workbook,
  fuente: string,
): { filas: FilaComedorCruda[]; rechazadas: FilaRechazada[] } {
  const hoja = libro.getWorksheet(HOJA_COMEDORES)
  if (!hoja) throw new Error(`El archivo ${fuente} no tiene la hoja ${HOJA_COMEDORES}`)
  const col = indicesPorEncabezado(hoja)
  const filas: FilaComedorCruda[] = []
  const rechazadas: FilaRechazada[] = []

  for (let n = FILA_ENCABEZADO + 1; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n)
    const cueTexto = texto(fila.getCell(col.cue).value)
    if (cueTexto === null) {
      // Una fila completamente vacía no es un dato: sólo se informa si trae algo más.
      if (texto(fila.getCell(col.proveedor).value) !== null || numero(fila.getCell(col.desayuno).value) > 0 || numero(fila.getCell(col.almuerzo).value) > 0) {
        rechazadas.push({ fila: n, fuente, cue: null, motivo: 'cue_vacio' })
      }
      continue
    }
    const cue = normalizeCue(cueTexto)
    if (!cue || cue.kind !== 'anexo') {
      rechazadas.push({ fila: n, fuente, cue: cueTexto, motivo: 'cue_invalido' })
      continue
    }
    filas.push({
      cueAnexo: cue.value,
      proveedor: texto(fila.getCell(col.proveedor).value),
      racionesDesayuno: numero(fila.getCell(col.desayuno).value),
      racionesAlmuerzo: numero(fila.getCell(col.almuerzo).value),
      fuente,
    })
  }
  return { filas, rechazadas }
}

export function agregarComedores(filas: readonly FilaComedorCruda[]): {
  comedores: ComedorAgregado[]
  estadisticas: EstadisticasComedores
} {
  const porCue = new Map<string, {
    desayuno: number; almuerzo: number; proveedores: Set<string>; fuentes: Set<string>; conteoPorFuente: Map<string, number>
  }>()
  for (const f of filas) {
    const acum = porCue.get(f.cueAnexo) ?? {
      desayuno: 0, almuerzo: 0, proveedores: new Set<string>(), fuentes: new Set<string>(), conteoPorFuente: new Map<string, number>(),
    }
    acum.desayuno += f.racionesDesayuno
    acum.almuerzo += f.racionesAlmuerzo
    if (f.proveedor) acum.proveedores.add(f.proveedor)
    acum.fuentes.add(f.fuente)
    acum.conteoPorFuente.set(f.fuente, (acum.conteoPorFuente.get(f.fuente) ?? 0) + 1)
    porCue.set(f.cueAnexo, acum)
  }

  const comedores: ComedorAgregado[] = []
  const repetidosPorFuente: Record<string, number> = {}
  let solapadosEntreFuentes = 0
  let sinRaciones = 0
  for (const [cueAnexo, acum] of [...porCue].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [fuente, cantidad] of acum.conteoPorFuente) {
      if (cantidad > 1) repetidosPorFuente[fuente] = (repetidosPorFuente[fuente] ?? 0) + 1
    }
    if (acum.fuentes.size > 1) solapadosEntreFuentes++
    if (acum.desayuno <= 0 && acum.almuerzo <= 0) {
      sinRaciones++
      continue
    }
    comedores.push({
      cueAnexo,
      desayuno: acum.desayuno > 0,
      almuerzo: acum.almuerzo > 0,
      proveedor: acum.proveedores.size > 0 ? [...acum.proveedores].sort().join(' / ') : null,
      fuentes: [...acum.fuentes].sort(),
    })
  }
  return {
    comedores,
    estadisticas: { filasLeidas: filas.length, cuesUnicos: porCue.size, sinRaciones, repetidosPorFuente, solapadosEntreFuentes },
  }
}
