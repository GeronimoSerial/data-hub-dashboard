export function respuestaGuard(guard: { error: string; status: number }): Response {
  return Response.json({ error: guard.error }, {
    status: guard.status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
