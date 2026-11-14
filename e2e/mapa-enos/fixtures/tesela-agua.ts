// Minimal Mapbox Vector Tile with one `waterway` line crossing the tile. The stub style draws it
// so the real basemap-styling code (realzarRutasYAgua) runs against a live line layer, without network.

const varint = (n: number): number[] => {
  const out: number[] = []
  let v = n
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  out.push(v)
  return out
}
const zigzag = (n: number) => (n << 1) ^ (n >> 31)
const campo = (numero: number, tipo: number, datos: number[]) => [...varint((numero << 3) | tipo), ...datos]
const delimitado = (numero: number, datos: number[]) => campo(numero, 2, [...varint(datos.length), ...datos])
const texto = (valor: string) => [...Buffer.from(valor, 'utf8')]

// Permanent streams carry no `intermittent` attribute in OpenMapTiles, so the styled dash evaluates to its [1, 0] branch.
function linea(y: number): number[] {
  const geometria = [9, zigzag(0), zigzag(y), 10, zigzag(4096), zigzag(0)].flatMap(varint) // MoveTo, LineTo
  return delimitado(2, [...campo(3, 0, varint(2)), ...delimitado(4, geometria)]) // 2 = LINESTRING
}

export function teselaAgua(): Buffer {
  const capa = [
    ...campo(15, 0, varint(2)),
    ...delimitado(1, texto('waterway')),
    ...linea(1024),
    ...linea(3072),
    ...campo(5, 0, varint(4096)),
  ]
  return Buffer.from(delimitado(3, capa))
}
