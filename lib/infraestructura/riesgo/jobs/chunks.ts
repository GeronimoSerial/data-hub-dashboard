/** Ejecuta cada segmento contiguo mediante la inserción asociada a la transacción del llamador. */
export async function insertarPorChunks<T>(
  filas: T[],
  tamanoChunk: number,
  insertarChunk: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let inicio = 0; inicio < filas.length; inicio += tamanoChunk) {
    await insertarChunk(filas.slice(inicio, inicio + tamanoChunk))
  }
}
