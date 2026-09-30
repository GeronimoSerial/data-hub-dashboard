// Las respuestas del parte y de las verificaciones pueden incluir nombres de alumnos
// (spec §18.12): nunca se cachean, ni siquiera del lado del navegador.
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

export function jsonNoStore(data: unknown, status?: number): Response {
  const init = status === undefined ? { headers: NO_STORE } : { status, headers: NO_STORE }
  return Response.json(data, init)
}
