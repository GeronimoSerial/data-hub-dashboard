// Búsqueda genérica de escuelas sobre un array plano. Extraída y generalizada
// desde lib/mapas/natalidad.ts (rama main), donde operaba sobre
// FeatureCollection<Point, EscuelaProperties>. Acá no hay GeoJSON: los items
// son cualquier objeto que cumpla EscuelaBuscable (nombre, cueAnexo,
// localidad, departamento). El algoritmo de ranking es idéntico al de main,
// con el agregado de `departamento` como campo buscable en el rango substring.
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'

/** Forma mínima que debe exponer un item para ser buscable. */
export interface EscuelaBuscable {
  cueAnexo: string
  nombre: string
  localidad: string
  departamento: string
}

/** Misma normalización canónica que usa el matching de departamentos
    (NFD + sin diacríticos + mayúsculas + colapso de espacios), reexportada con
    el nombre que usa el resto del código de búsqueda. */
export function normalizarTextoBusqueda(texto: string): string {
  return normalizarNombreDepartamento(texto)
}

export interface ResultadoBusquedaEscuela<T extends EscuelaBuscable> {
  item: T
  /** Menor = mejor match; usado sólo para ordenar, no se expone en UI. */
  rango: number
}

/** Separa en "palabras" alfanuméricas (todo lo que no sea a-z0-9 es separador: espacios, "n°", "-", etc). */
function tokenizar(texto: string): string[] {
  return texto.split(/[^A-Z0-9]+/).filter(Boolean)
}

interface EntradaIndice<T extends EscuelaBuscable> {
  item: T
  nombre: string
  cue: string
  localidad: string
  departamento: string
  palabras: string[]
}

// Mismo motivo que en main: el buscador llama a buscarEscuelas en cada tecleo y
// el array del padrón es un objeto estable entre renders (useState cargado una
// sola vez). Cachear el índice normalizado por identidad del array en un
// WeakMap evita renormalizar los ~2000 items en cada tecla; las llamadas
// siguientes (mismo array, distinta query) sólo normalizan la query. WeakMap
// no retiene el índice si el array deja de estar referenciado.
const indicesBusquedaEscuelas = new WeakMap<object, EntradaIndice<EscuelaBuscable>[]>()

function indiceBusquedaEscuelas<T extends EscuelaBuscable>(items: T[]): EntradaIndice<T>[] {
  const cacheado = indicesBusquedaEscuelas.get(items)
  if (cacheado) return cacheado as EntradaIndice<T>[]

  const indice: EntradaIndice<T>[] = items.map((item) => {
    const nombre = normalizarTextoBusqueda(item.nombre)
    return {
      item,
      nombre,
      cue: normalizarTextoBusqueda(item.cueAnexo),
      localidad: normalizarTextoBusqueda(item.localidad),
      departamento: normalizarTextoBusqueda(item.departamento),
      palabras: tokenizar(nombre),
    }
  })
  indicesBusquedaEscuelas.set(items, indice)
  return indice
}

/**
 * Busca escuelas por nombre, CUE-anexo, localidad o departamento — insensible a
 * mayúsculas y acentos. Nunca busca con menos de 2 caracteres (evita listar
 * "todo" con una tecla).
 *
 * Orden de calidad de match (idéntico al de main):
 *   0. CUE-anexo exacto.
 *   1. nombre o CUE empiezan con la query.
 *   2. alguna palabra del nombre es EXACTAMENTE la query.
 *   3. alguna palabra del nombre empieza con la query pero no es igual.
 *   4. substring en cualquier posición de nombre/CUE/localidad/departamento.
 * Dentro de un mismo rango, ordena por nombre alfabético.
 */
export function buscarEscuelas<T extends EscuelaBuscable>(
  items: T[],
  query: string,
  limite = 8,
): T[] {
  const q = normalizarTextoBusqueda(query)
  if (q.length < 2) return []

  const hits: ResultadoBusquedaEscuela<T>[] = []
  for (const entrada of indiceBusquedaEscuelas(items)) {
    const { item, nombre, cue, localidad, departamento, palabras } = entrada

    let rango: number | null = null
    if (cue === q) rango = 0
    else if (nombre.startsWith(q) || cue.startsWith(q)) rango = 1
    else {
      if (palabras.includes(q)) rango = 2
      else if (palabras.some((palabra) => palabra.startsWith(q))) rango = 3
      else if (
        nombre.includes(q) ||
        cue.includes(q) ||
        localidad.includes(q) ||
        departamento.includes(q)
      )
        rango = 4
    }

    if (rango != null) hits.push({ item, rango })
  }

  hits.sort((a, b) => a.rango - b.rango || a.item.nombre.localeCompare(b.item.nombre))
  return hits.slice(0, limite).map((hit) => hit.item)
}
