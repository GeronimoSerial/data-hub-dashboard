export function jsonError(error: string, status: number, headers?: HeadersInit): Response {
  const init = headers === undefined ? { status } : { status, headers }
  return Response.json({ error }, init)
}
