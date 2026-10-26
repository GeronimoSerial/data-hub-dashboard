export function respuestaAccesoDenegado(acceso: { status: number }): Response {
  const error = acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
  return Response.json({ error }, {
    status: acceso.status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
