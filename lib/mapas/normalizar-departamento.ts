// Normalización canónica de nombre de departamento, compartida por los tres
// puntos del código que necesitaban agrupar/comparar departamentos y hasta
// ahora tenían cada uno su propia copia divergente:
// - lib/mapas/departamentos.ts (coroplético de escuelas caídas)
// - lib/mapas/georef-departamentos.ts (comparación contra el padrón oficial)
// - lib/infraestructura/riesgo/geo-perfil.ts (cálculo de infra_geo_profile)
//
// GOTCHA CONFIRMADO EN LA BASE REAL (public/data/localizaciones.json): el
// mismo departamento aparece con capitalización y tildes inconsistentes
// ("Concepción", "CONCEPCION", "CONCEPCIÓN") y a veces con espacios dobles.
// Comparar los strings tal cual, en cualquier dirección, pierde partes.
//
// La normalización es: NFD (descompone tildes en letra + marca combinante,
// ver rango Unicode U+0300–U+036F) + descarte de esas marcas + mayúsculas +
// colapso de espacios repetidos + trim. La Ñ SÍ se descompone bajo NFD en
// JS ('Ñ'.normalize('NFD') === 'N' + U+0303 combining tilde) — verificado a
// mano — así que no hace falta un reemplazo manual aparte para ella, pese a
// un comentario histórico en geo-perfil.ts que afirmaba lo contrario.
//
// Verificado a mano contra los 25 nombres del GeoJSON de departamentos y los
// valores distintos de `departamento` en localizaciones.json: normalizados,
// ambos lados colapsan a las mismas 25 claves.
export function normalizarNombreDepartamento(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Variante para el único consumidor con dato nullable (geo-perfil.ts, que
// lee `departamento` de un left join y puede no tener fila). `null` se
// preserva tal cual, y una cadena que normaliza a vacío colapsa a `null`:
// mismo criterio de "sin dato" que ya usa esa tabla para lat/lon inválidas
// (ver calcularGeoPerfiles), en vez de persistir una cadena vacía que
// después habría que tratar como un departamento más.
export function normalizarNombreDepartamentoONull(
  nombre: string | null,
): string | null {
  if (nombre === null) return null
  const normalizado = normalizarNombreDepartamento(nombre)
  return normalizado === '' ? null : normalizado
}
